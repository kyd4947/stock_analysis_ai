"""
Gemini AI를 이용한 종목 분석 및 Q&A.
google-genai SDK 사용. 모델 할당량 초과 시 순서대로 fallback.
"""
import json
import re
import time
from google import genai

from backend.core.config import settings

_MODELS = [
    "gemini-2.5-flash",       # 20/day — 최고 품질
    "gemini-2.5-pro",         # 20/day
    "gemini-2.0-flash",       # 높은 할당량
    "gemini-2.0-flash-lite",  # 높은 할당량
    "gemini-1.5-flash",       # 높은 할당량
]

_STYLE_MAP = {
    "lowPER": "저PER 가치투자",
    "lowPBR": "저PBR 자산가치",
    "highROE": "고ROE 수익성",
    "value": "가치투자",
    "quality": "퀄리티",
    "quant": "퀀트(PER·PBR·ROE·모멘텀 등 다중 지표 기반 체계적 선별)",
}
_HORIZON_MAP = {"short": "단기(3개월 이내)", "mid": "중기(6~12개월)", "long": "장기(1년 이상)"}
_RISK_MAP = {"low": "보수적", "medium": "중립적", "high": "공격적"}


def _client() -> genai.Client:
    return genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options={"api_version": "v1"},
    )


def _safety_settings():
    from google.genai import types as _gt
    return [
        _gt.SafetySetting(category=c, threshold="BLOCK_ONLY_HIGH")
        for c in [
            "HARM_CATEGORY_HARASSMENT",
            "HARM_CATEGORY_HATE_SPEECH",
            "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            "HARM_CATEGORY_DANGEROUS_CONTENT",
            "HARM_CATEGORY_CIVIC_INTEGRITY",
        ]
    ]


def _generate(prompt: str) -> str:
    """모델 fallback 포함 텍스트 생성. 모든 오류에서 다음 모델 시도."""
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다")
    client = _client()
    last_err: Exception | None = None
    for model in _MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config={"safety_settings": _safety_settings()},
            )
            if response.text is None:
                feedback = response.candidates[0].finish_reason if response.candidates else "UNKNOWN"
                raise RuntimeError(f"응답 없음 (finish_reason: {feedback})")
            return response.text.strip()
        except Exception as e:
            err_str = str(e)
            print(f"[Gemini] {model} failed: {type(e).__name__}: {err_str}", flush=True)
            last_err = e
            if "429" in err_str or "quota" in err_str.lower() or "resource_exhausted" in err_str.lower():
                print(f"[Gemini] {model} 할당량 초과 → 다음 모델로", flush=True)
            elif "503" in err_str or "unavailable" in err_str.lower():
                print(f"[Gemini] {model} 일시적 과부하 → 다음 모델로", flush=True)
                time.sleep(2)
            elif "SAFETY" in err_str or "finish_reason" in err_str:
                print(f"[Gemini] {model} safety filter 차단 → 다음 모델로", flush=True)
            continue
    raise RuntimeError(f"모든 Gemini 모델 오류: {last_err}")


def analyze_stock(
    ticker: str,
    user_profile: dict,
    macro: dict,
    financial: dict,
    dart: dict,
    news_articles: list[dict],
    price: float,
    us_news_articles: list[dict] | None = None,
    price_history: dict | None = None,
    investor_trend: dict | None = None,
    earnings_info: dict | None = None,
    shareholders: list[dict] | None = None,
) -> dict:
    style = ", ".join(_STYLE_MAP.get(s, s) for s in user_profile.get("preferred_style", []))
    horizon = _HORIZON_MAP.get(user_profile.get("horizon", "mid"), "중기")
    risk = _RISK_MAP.get(user_profile.get("risk_tolerance", "medium"), "중립적")

    news_text = "\n".join(f"- {a['title']}" for a in news_articles[:5]) or "뉴스 없음"
    risk_text = ", ".join(dart.get("risk_flags", [])) or "없음"
    highlights_text = "\n".join(f"- {h}" for h in dart.get("highlights", [])) or "없음"

    # 미국 증시 동향
    us_parts = []
    if macro.get("sp500"):
        r = macro["sp500"]["change_rate"]
        us_parts.append(f"S&P500 {r:+.2f}%")
    if macro.get("nasdaq"):
        r = macro["nasdaq"]["change_rate"]
        us_parts.append(f"나스닥 {r:+.2f}%")
    if macro.get("dji"):
        r = macro["dji"]["change_rate"]
        us_parts.append(f"다우 {r:+.2f}%")
    us_market_str = " | ".join(us_parts) if us_parts else "데이터 없음"
    us_news_text = "\n".join(f"- {a['title']}" for a in (us_news_articles or [])[:3]) or "없음"

    def _fmt_fin(v) -> str:
        if v is None or v == 0:
            return "데이터 없음"
        return str(v)

    price_str = f"{price:,.0f}원" if price > 0 else "시세 미제공"

    # 52주 고저 및 기술 지표
    ph = price_history or {}
    tech_parts = []
    if ph.get("high_52w") and ph.get("low_52w"):
        tech_parts.append(f"52주 고가 {ph['high_52w']:,}원 / 저가 {ph['low_52w']:,}원")
    if ph.get("position_52w") is not None:
        tech_parts.append(f"현재가 52주 범위 내 {ph['position_52w']}% 위치 (고점 대비 {ph.get('pct_from_52w_high', 0):+.1f}%)")
    if ph.get("ma5") and ph.get("ma20"):
        trend = "정배열(단기↑)" if ph["ma5"] >= ph["ma20"] else "역배열(단기↓)"
        tech_parts.append(f"MA5 {ph['ma5']:,} / MA20 {ph['ma20']:,} → {trend}")
    if ph.get("vol_ratio_20d") is not None:
        vr = ph["vol_ratio_20d"]
        vol_desc = "급증(20일평균 대비 {:.1f}배)".format(vr) if vr >= 2 else ("증가" if vr >= 1.3 else ("감소" if vr < 0.7 else "보통"))
        tech_parts.append(f"거래량 {vol_desc}")
    if ph.get("ret_5d") is not None and ph.get("ret_20d") is not None:
        tech_parts.append(f"최근 수익률 5일 {ph['ret_5d']:+.1f}% / 20일 {ph['ret_20d']:+.1f}%")
    tech_text = "\n".join(tech_parts) or "데이터 없음"

    # KOSPI 대비 상대 강도
    kospi_ret_5d = None
    if macro.get("kospi") and ph.get("ret_5d") is not None:
        kospi_chg = macro["kospi"].get("change_rate", 0)
        diff = round(ph["ret_5d"] - kospi_chg, 2)
        kospi_ret_5d = f"KOSPI 대비 5일 수익률 {diff:+.2f}%p ({'시장 아웃퍼폼' if diff > 0 else '시장 언더퍼폼'})"

    # 외국인/기관 수급
    it = investor_trend or {}
    invest_parts = []
    if it.get("foreign_5d_net") is not None:
        v = it["foreign_5d_net"]
        invest_parts.append(f"외국인 5일 순매수 {v:+,}주 ({'매수 우위' if v > 0 else '매도 우위'})")
    if it.get("institution_5d_net") is not None:
        v = it["institution_5d_net"]
        invest_parts.append(f"기관 5일 순매수 {v:+,}주 ({'매수 우위' if v > 0 else '매도 우위'})")
    invest_text = "\n".join(invest_parts) or "데이터 없음"

    # 실적 일정
    ei = earnings_info or {}
    earn_text = "데이터 없음"
    if ei.get("last_report"):
        earn_text = f"최근 보고서: {ei['last_report']} ({ei.get('last_report_date', '')})"
        if ei.get("next_earnings_est"):
            earn_text += f" | 다음 예상: {ei['next_earnings_est']}"

    # 주요 주주
    sh_text = "데이터 없음"
    if shareholders:
        sh_text = ", ".join(f"{s['name']} {s['share']}주" for s in shareholders[:3] if s.get("name"))

    prompt = f"""당신은 한국 주식 투자 AI 애널리스트입니다. 아래 데이터를 종합하여 {ticker} 종목을 분석하세요.

[투자자 프로필]
리스크 선호: {risk} | 투자 스타일: {style or "없음"} | 투자 기간: {horizon}

[한국 거시경제]
USD/KRW: {macro.get("exchange_rate_usdkrw", "N/A")} | 한국 기준금리: {macro.get("policy_rate", "N/A")}% | 미국 기준금리: {macro.get("fed_funds_rate", "N/A")}% | 인플레이션(YoY): {macro.get("inflation_yoy", "N/A")}%

[전날 미국 증시 (오늘 한국 시장 영향)]
{us_market_str}

[미국 시장 주요 뉴스]
{us_news_text}

[재무]
현재가: {price_str} | PER: {_fmt_fin(financial.get("per"))} | PBR: {_fmt_fin(financial.get("pbr"))} | ROE: {_fmt_fin(financial.get("roe"))}{'%' if financial.get('roe') else ''}

[기술 지표 및 수급]
{tech_text}
{f"업종 상대 강도: {kospi_ret_5d}" if kospi_ret_5d else ""}

[외국인/기관 수급 동향]
{invest_text}

[실적 발표 일정]
{earn_text}

[주요 주주]
{sh_text}

[DART 공시 하이라이트]
{highlights_text}

[DART 리스크 공시]
{risk_text}

[종목 관련 최신 뉴스]
{news_text}
※ 뉴스가 있으면 반드시 분석에 반영하고, reasons 중 하나에 뉴스 내용(호재/악재 여부)을 포함하세요.

위 데이터를 종합 분석하여 아래 JSON 형식으로만 응답하세요. 마크다운(```)을 절대 사용하지 마세요.

{{"score": 0.75, "signal": "BUY", "signal_reason": "매수 판단 근거 1~2문장", "summary": "종합 의견 2~3문장", "reasons": ["근거1", "근거2", "근거3"]}}

score는 0.0~1.0 사이 실수.
signal 선택 기준:
- BUY: 지금 신규 매수 적합
- HOLD: 이미 보유 중이라면 유지 권장
- WATCH: 아직 없다면 매수 보류, 상황 관망
- SELL: 보유 중이라면 매도 고려
모든 텍스트는 한국어로 작성하세요."""

    try:
        text = _generate(prompt)
        text = re.sub(r"```(?:json)?\s*", "", text)
        text = re.sub(r"```", "", text).strip()
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
        return json.loads(text)
    except Exception as e:
        print(f"[Gemini] analyze_stock {ticker} error: {type(e).__name__}: {e}", flush=True)
        return {
            "score": 0.5,
            "signal": "HOLD",
            "signal_reason": "AI 분석 중 오류가 발생했습니다. 데이터를 재수집 후 다시 시도해주세요.",
            "summary": f"{ticker} 분석 데이터를 수집했습니다. AI 분석 중 오류가 발생했습니다.",
            "reasons": ["데이터 수집 완료", "AI 분석 재시도 필요"],
        }


def analyze_us_stock(
    ticker: str,
    user_profile: dict,
    macro: dict,
    financial: dict,
    news_articles: list[dict],
    price: float,
) -> dict:
    horizon = _HORIZON_MAP.get(user_profile.get("horizon", "mid"), "중기")
    risk = _RISK_MAP.get(user_profile.get("risk_tolerance", "medium"), "중립적")
    style = ", ".join(_STYLE_MAP.get(s, s) for s in user_profile.get("preferred_style", []))

    news_text = "\n".join(f"- {a['title']}" for a in news_articles[:3]) or "No recent news"

    sp500_str = f"{macro['sp500']['change_rate']:+.2f}%" if macro.get("sp500") else "N/A"
    nasdaq_str = f"{macro['nasdaq']['change_rate']:+.2f}%" if macro.get("nasdaq") else "N/A"
    dji_str = f"{macro['dji']['change_rate']:+.2f}%" if macro.get("dji") else "N/A"

    def _fmt(v):
        return str(v) if v is not None else "N/A"

    prompt = f"""당신은 미국 주식 투자 AI 애널리스트입니다. 아래 데이터를 종합하여 {ticker} 종목을 분석하세요.

[투자자 프로필]
리스크 선호: {risk} | 투자 스타일: {style or "없음"} | 투자 기간: {horizon}

[미국 시장 환경]
S&P500: {sp500_str} | NASDAQ: {nasdaq_str} | Dow Jones: {dji_str}
미국 기준금리: {_fmt(macro.get("fed_funds_rate"))}% | USD/KRW: {_fmt(macro.get("exchange_rate_usdkrw"))}

[종목 데이터 — {ticker}]
현재가: ${price:,.2f} USD
PER: {_fmt(financial.get("per"))} | PBR: {_fmt(financial.get("pbr"))} | ROE: {_fmt(financial.get("roe"))}{'%' if financial.get('roe') else ''}

[최근 뉴스]
{news_text}

위 데이터를 분석하여 아래 JSON 형식으로만 응답하세요. 마크다운(```)을 사용하지 마세요.

{{"score": 0.75, "signal": "BUY", "signal_reason": "매수 판단 근거 1~2문장", "summary": "종합 의견 2~3문장", "reasons": ["근거1", "근거2", "근거3"]}}

score 0.0~1.0. signal 기준:
- BUY: 지금 신규 매수 적합
- HOLD: 보유 중이라면 유지
- WATCH: 관망 (고평가 또는 모멘텀 약함)
- SELL: 매도 고려

[밸류에이션 필터]
- PER 40배 초과: WATCH 또는 SELL 검토 (기술주는 50배까지 허용)
- S&P500 -1% 이상 시: BUY 기준 강화

모든 텍스트는 한국어로 작성하세요."""

    try:
        text = _generate(prompt)
        text = re.sub(r"```(?:json)?\s*", "", text)
        text = re.sub(r"```", "", text).strip()
        s, e = text.find("{"), text.rfind("}")
        if s != -1 and e > s:
            text = text[s : e + 1]
        return json.loads(text)
    except Exception as ex:
        print(f"[Gemini] analyze_us_stock {ticker} error: {type(ex).__name__}: {ex}", flush=True)
        return {
            "score": 0.5,
            "signal": "HOLD",
            "signal_reason": "AI 분석 중 오류가 발생했습니다.",
            "summary": f"{ticker} 분석 중 오류가 발생했습니다.",
            "reasons": ["데이터 수집 완료", "AI 분석 재시도 필요"],
        }


def recommend_stocks(user_profile: dict, macro: dict, candidates: list[dict]) -> dict:
    style = ", ".join(_STYLE_MAP.get(s, s) for s in user_profile.get("preferred_style", []))
    horizon = _HORIZON_MAP.get(user_profile.get("horizon", "mid"), "중기")
    risk = _RISK_MAP.get(user_profile.get("risk_tolerance", "medium"), "중립적")

    def _f(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "N/A"

    rows = []
    for c in candidates:
        price = c.get("price")
        price_str = f"{price:,}원" if price else "N/A"
        rows.append(
            f"- {c['name']}({c['ticker']}) [{c['sector']}]"
            f" 현재가:{price_str}"
            f" PER:{_f(c.get('per'), '배')}"
            f" PBR:{_f(c.get('pbr'), '배')}"
            f" ROE:{_f(c.get('roe'), '%')}"
        )
    candidates_text = "\n".join(rows)

    us_parts = []
    if macro.get("sp500"):
        us_parts.append(f"S&P500 {macro['sp500']['change_rate']:+.2f}%")
    if macro.get("nasdaq"):
        us_parts.append(f"나스닥 {macro['nasdaq']['change_rate']:+.2f}%")
    us_str = " | ".join(us_parts) if us_parts else "N/A"

    prompt = f"""당신은 한국 주식 투자 전문 AI 애널리스트입니다.
아래 후보 종목의 실시간 재무 데이터를 보고, 투자자 프로필 기준에서 **지금 바로 매수할 수 있는** 종목만 2~3개 엄선하여 추천하세요.

[투자자 프로필]
리스크 허용도: {risk} | 투자 스타일: {style or "설정 없음"} | 투자 기간: {horizon}

[현재 시장 지표]
USD/KRW: {macro.get("exchange_rate_usdkrw", "N/A")} | 한국 기준금리: {macro.get("policy_rate", "N/A")}% | 미국 기준금리: {macro.get("fed_funds_rate", "N/A")}%
전날 미국 증시: {us_str}

[후보 종목 실시간 재무 데이터]
{candidates_text}

[엄격한 선택 규칙]
1. signal은 반드시 BUY만 사용하세요. WATCH·HOLD·SELL 종목은 목록에 넣지 마세요.
2. BUY 근거가 명확하지 않으면 차라리 2개만 추천하세요. 억지로 3개를 채우지 마세요.
3. 투자 스타일과 재무 지표가 맞는 종목만 포함하세요 (예: 고ROE 스타일 → ROE 15% 이상 우선).
4. 근거에는 반드시 실제 재무 수치(PER, ROE 등)를 포함하세요. 수치 없는 막연한 근거 금지.

[밸류에이션 필터 — 이 조건을 어기면 BUY 불가]
5. PER 30배 초과 종목은 제외하세요. ROE가 아무리 높아도 PER 30배 초과는 현재 시장에서 WATCH 대상입니다.
6. PBR 8배 초과 종목은 제외하세요.
7. 미국 증시 전날 -1% 이하 하락했다면, PER 20배 초과 종목은 추천하지 마세요.
8. 재무 데이터가 N/A인 항목이 많은 종목은 불확실성이 높으므로 다른 종목 우선 선택.

아래 JSON 형식으로만 응답하세요. 마크다운(```)을 절대 사용하지 마세요.

{{"message": "추천 전략 요약 2~3문장", "stocks": [{{"ticker": "005930", "name": "삼성전자", "sector": "반도체/AI", "reason": "ROE 00%, PER 00배 기준 추천 근거 1~2문장", "signal": "BUY"}}]}}

모든 텍스트는 한국어로 작성하세요."""

    try:
        text = _generate(prompt)
        text = re.sub(r"```(?:json)?\s*", "", text)
        text = re.sub(r"```", "", text).strip()
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
        return json.loads(text)
    except Exception as e:
        print(f"[Gemini] recommend_stocks error: {type(e).__name__}: {e}", flush=True)
        return {
            "message": "AI 추천 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
            "stocks": [],
        }


def analyze_entry_exit(
    ticker: str,
    current_price: float,
    price_history: dict,
    news_articles: list[dict],
    macro: dict,
    financial: dict,
) -> dict:
    """Thinking mode로 매수/매도 타점 분석. 실제 가격 데이터 기반."""
    h52w = price_history.get("high_52w")
    l52w = price_history.get("low_52w")
    ma5  = price_history.get("ma5")
    ma20 = price_history.get("ma20")
    ma60 = price_history.get("ma60")
    recent = price_history.get("recent_closes", [])

    def _p(v):
        return f"{v:,.0f}원" if v else "N/A"

    recent_str = " → ".join(f"{c:,.0f}" for c in recent) if recent else "없음"
    news_text  = "\n".join(f"- {a['title']}" for a in news_articles[:5]) or "없음"

    prompt = f"""당신은 한국 주식 기술적 분석 전문 AI입니다.
아래 실제 데이터만을 근거로 {ticker} 종목의 매수·매도 타점을 산출하세요.

[현재가 및 기술적 지표 — 실제 데이터]
현재가: {_p(current_price)}
52주 고점: {_p(h52w)} | 52주 저점: {_p(l52w)}
5일 이동평균(MA5): {_p(ma5)}
20일 이동평균(MA20): {_p(ma20)}
60일 이동평균(MA60): {_p(ma60)}
최근 10일 종가: {recent_str}

[재무지표]
PER: {financial.get('per') or 'N/A'} | PBR: {financial.get('pbr') or 'N/A'} | ROE: {financial.get('roe') or 'N/A'}%

[거시경제]
USD/KRW: {macro.get('exchange_rate_usdkrw', 'N/A')} | 기준금리: {macro.get('policy_rate', 'N/A')}%

[오늘 관련 뉴스]
{news_text}

[타점 산출 규칙 — 반드시 준수]
1. 위 실제 숫자들에서만 지지·저항 근거를 찾으세요. 없는 수치를 만들지 마세요.
2. 매수 구간(entry_low~entry_high): 반드시 현재가 이하의 지지선. MA20·MA60·60일저점 중 현재가에 가장 가까운 지지선 부근으로 설정. 현재가가 MA20보다 10% 이상 위에 있으면 "눌림목 대기" 구간으로 설정하고 basis에 명시.
3. 1차 목표가(target_1): 반드시 현재가보다 높아야 함. 현재가 위의 저항선(52주 고점 위 또는 직전 고점)을 기준으로 설정. 52주 고점이 현재가와 같거나 낮으면 현재가 × 1.05를 사용.
4. 2차 목표가(target_2): 1차 목표가보다 높은 다음 저항선. 근거가 없으면 null.
5. 손절가(stop_loss): 매수 구간 하단에서 1~3% 아래. 단, 현재가 대비 -20% 이내로 제한.
6. 근거(basis): 사용한 실제 수치를 인용하며 2~3문장. 현재가가 매수 구간보다 크게 위에 있으면 "현재 고점 부근이므로 눌림목 확인 후 진입 권장"을 반드시 포함.
7. confidence: 데이터 신뢰도 기반 high/medium/low

JSON만 응답. 마크다운 금지.
{{"entry_low": 숫자, "entry_high": 숫자, "target_1": 숫자, "target_2": 숫자또는null, "stop_loss": 숫자, "basis": "근거 문장", "confidence": "high|medium|low"}}"""

    # Thinking mode 시도 → 실패 시 일반 생성으로 fallback
    text = None
    try:
        from google.genai import types as _gt
        client = _client()
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=_gt.GenerateContentConfig(
                thinking_config=_gt.ThinkingConfig(thinking_budget=8000)
            ),
        )
        text = resp.text.strip()
        print(f"[Gemini] entry_exit {ticker} thinking mode OK", flush=True)
    except Exception as e:
        print(f"[Gemini] entry_exit {ticker} thinking failed ({e}), fallback", flush=True)

    if text is None:
        try:
            text = _generate(prompt)
        except Exception as e:
            print(f"[Gemini] entry_exit {ticker} fallback error: {e}", flush=True)
            return {"error": "타점 분석 중 오류가 발생했습니다."}

    try:
        text = re.sub(r"```(?:json)?\s*", "", text)
        text = re.sub(r"```", "", text).strip()
        s, e2 = text.find("{"), text.rfind("}")
        if s != -1 and e2 > s:
            text = text[s : e2 + 1]
        result = json.loads(text)
        result["current_price"] = round(current_price)
        return result
    except Exception as e:
        print(f"[Gemini] entry_exit {ticker} parse error: {e}", flush=True)
        return {"error": "응답 파싱 중 오류가 발생했습니다."}


def analyze_entry_exit_us_stock(
    ticker: str,
    current_price: float,
    price_history: dict,
    news_articles: list[dict],
    macro: dict,
    financial: dict,
) -> dict:
    """Thinking mode로 미국 주식 매수/매도 타점 분석. USD 가격 기반."""
    h52w = price_history.get("high_52w")
    l52w = price_history.get("low_52w")
    ma5  = price_history.get("ma5")
    ma20 = price_history.get("ma20")
    ma60 = price_history.get("ma60")
    recent = price_history.get("recent_closes", [])

    def _p(v):
        return f"${v:,.2f}" if v else "N/A"

    recent_str = " → ".join(f"${c:,.2f}" for c in recent) if recent else "N/A"
    news_text  = "\n".join(f"- {a['title']}" for a in news_articles[:5]) or "N/A"

    prompt = f"""You are a US stock technical analysis AI specialist.
Based ONLY on the actual data below, calculate entry/exit price levels for {ticker}.

[Current Price & Technical Indicators — Actual Data]
Current Price: {_p(current_price)}
52-Week High: {_p(h52w)} | 52-Week Low: {_p(l52w)}
MA5: {_p(ma5)}
MA20: {_p(ma20)}
MA60: {_p(ma60)}
Last 10 Closes: {recent_str}

[Financials]
PER: {financial.get('per') or 'N/A'} | PBR: {financial.get('pbr') or 'N/A'} | ROE: {financial.get('roe') or 'N/A'}%

[Macro]
USD/KRW: {macro.get('exchange_rate_usdkrw', 'N/A')} | Fed Rate: {macro.get('fed_funds_rate') or macro.get('policy_rate', 'N/A')}%

[Recent News]
{news_text}

[Entry/Exit Calculation Rules — Follow Strictly]
1. Use ONLY the actual numbers above for support/resistance reasoning.
2. Entry zone (entry_low~entry_high): MUST be at or below current price. Pick the closest support level near MA20, MA60, or 60-day low. If current price is 10%+ above MA20, set a "pullback wait" zone and note it in basis.
3. Target 1 (target_1): MUST be above current price. Use resistance above current price (above 52-week high or previous high). If 52-week high <= current price, use current_price × 1.05.
4. Target 2 (target_2): Next resistance above target 1. null if no basis.
5. Stop Loss (stop_loss): 1~3% below entry zone low, but no more than -20% from current price.
6. Basis: 2~3 sentences citing actual numbers used. If current price is well above entry zone, include "Currently near highs, recommend waiting for pullback confirmation."
7. Confidence: high/medium/low based on data reliability.

JSON only. No markdown.
{{"entry_low": number, "entry_high": number, "target_1": number, "target_2": number or null, "stop_loss": number, "basis": "reasoning", "confidence": "high|medium|low"}}"""

    text = None
    try:
        from google.genai import types as _gt
        client = _client()
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=_gt.GenerateContentConfig(
                thinking_config=_gt.ThinkingConfig(thinking_budget=8000)
            ),
        )
        text = resp.text.strip()
        print(f"[Gemini] entry_exit_us {ticker} thinking mode OK", flush=True)
    except Exception as e:
        print(f"[Gemini] entry_exit_us {ticker} thinking failed ({e}), fallback", flush=True)

    if text is None:
        try:
            text = _generate(prompt)
        except Exception as e:
            print(f"[Gemini] entry_exit_us {ticker} fallback error: {e}", flush=True)
            return {"error": "타점 분석 중 오류가 발생했습니다."}

    try:
        text = re.sub(r"```(?:json)?\s*", "", text)
        text = re.sub(r"```", "", text).strip()
        s, e2 = text.find("{"), text.rfind("}")
        if s != -1 and e2 > s:
            text = text[s : e2 + 1]
        result = json.loads(text)
        result["current_price"] = round(current_price, 2)
        return result
    except Exception as e:
        print(f"[Gemini] entry_exit_us {ticker} parse error: {e}", flush=True)
        return {"error": "응답 파싱 중 오류가 발생했습니다."}


def _qa_prompt(ticker: str, question: str, context_summary: str) -> str:
    ctx = f"\n\n[분석 컨텍스트 — 이 데이터만 근거로 사용]\n{context_summary}" if context_summary else ""
    return f"""당신은 한국 주식 투자 분석 AI입니다.{ctx}

[엄격한 답변 규칙]
1. 위 [분석 컨텍스트]에 있는 데이터를 기본 근거로 사용하세요.
2. 사용자가 질문에서 새로운 사실(예: "장대 음봉이 세워졌다", "오늘 급락했다")을 제시하면, 그것을 추가 정보로 수용하여 분석에 반영하세요. 컨텍스트와 모순되면 사용자 제공 정보를 우선시하고 "새로 제시하신 정보를 반영하면..."으로 답변을 시작하세요.
3. 컨텍스트에 없는 구체적 수치를 임의로 만들지 마세요. 단, 최근10일종가 데이터가 있으면 이를 이용해 가격 흐름을 직접 분석하세요.
4. 답변 형식: 핵심 요점 2~4개를 번호 목록으로 간결하게. 각 항목은 1~2문장. 불필요한 서론·맺음말 없이 바로 본론부터.
5. 출처·근거·뉴스를 묻는 질문이면: 컨텍스트의 뉴스 URL을 마크다운 링크 [기사 제목](URL) 형식으로 인용하세요. URL이 없으면 출처명만 표기하세요.
6. 시드머니·투자금액·분할매수를 묻는 질문이면: 제시된 금액 기준으로 1차(50%)·2차(30%)·3차(20%) 분할 또는 상황에 맞는 비중을 계산해 구체적 금액(원 단위)으로 답하세요. 주식 수도 함께 계산하세요.
7. "투자 판단은 사용자 본인의 몫입니다" 문구는 답변 본문에 포함하지 마세요.
8. 실시간 뉴스 검색·조회를 요청하면: 저는 실시간 뉴스 검색 기능이 없고 종목 분석 시 수집된 뉴스만 참조할 수 있습니다. 컨텍스트에 뉴스가 있으면 그것을 인용하고, 없으면 "최신 뉴스는 [네이버 금융](https://finance.naver.com/item/news.naver?code={ticker}) 에서 확인하실 수 있습니다"라고 안내하세요.

{ticker} 종목에 관한 질문에 한국어로 답변하세요.

질문: {question}"""


def answer_question(ticker: str, question: str, context_summary: str = "") -> str:
    prompt = _qa_prompt(ticker, question, context_summary)
    try:
        return _generate(prompt)
    except Exception:
        return "답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."


def answer_question_stream(ticker: str, question: str, context_summary: str = ""):
    """Gemini 스트리밍 버전. 텍스트 청크를 yield."""
    prompt = _qa_prompt(ticker, question, context_summary)
    if not settings.GEMINI_API_KEY:
        yield "GEMINI_API_KEY가 설정되지 않았습니다."
        return
    client = _client()
    for model in _MODELS:
        try:
            for chunk in client.models.generate_content_stream(model=model, contents=prompt):
                if chunk.text:
                    yield chunk.text
            return
        except Exception as e:
            print(f"[Gemini stream] {model} failed: {type(e).__name__}: {e}", flush=True)
            continue
    yield "답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
