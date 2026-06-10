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
    "gemini-3.5-flash",       # 20/day
    "gemini-3.1-flash-lite",  # 500/day — 가장 여유 있음
    "gemini-2.5-flash-lite",  # 20/day
    "gemini-2.0-flash-lite",  # 20/day
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


def _generate(prompt: str) -> str:
    """모델 fallback 포함 텍스트 생성. 모든 오류에서 다음 모델 시도."""
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다")
    client = _client()
    last_err: Exception | None = None
    for model in _MODELS:
        try:
            response = client.models.generate_content(model=model, contents=prompt)
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
) -> dict:
    style = ", ".join(_STYLE_MAP.get(s, s) for s in user_profile.get("preferred_style", []))
    horizon = _HORIZON_MAP.get(user_profile.get("horizon", "mid"), "중기")
    risk = _RISK_MAP.get(user_profile.get("risk_tolerance", "medium"), "중립적")

    news_text = "\n".join(f"- {a['title']}" for a in news_articles[:3]) or "뉴스 없음"
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

[DART 공시 하이라이트]
{highlights_text}

[DART 리스크 공시]
{risk_text}

[종목 관련 최신 뉴스]
{news_text}

위 데이터를 분석하여 아래 JSON 형식으로만 응답하세요. 마크다운(```)을 절대 사용하지 마세요. JSON 외 다른 텍스트를 포함하지 마세요.

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


def answer_question(ticker: str, question: str, context_summary: str = "") -> str:
    ctx = f"\n\n[분석 컨텍스트 — 이 데이터만 근거로 사용]\n{context_summary}" if context_summary else ""
    prompt = f"""당신은 한국 주식 투자 분석 AI입니다.{ctx}

[엄격한 답변 규칙]
1. 위 [분석 컨텍스트]에 있는 데이터만 근거로 사용하세요.
2. 컨텍스트에 없는 구체적 수치(주가, 날짜, 실적 등)를 임의로 만들지 마세요. 모르면 "제공된 데이터에 해당 정보가 없습니다"라고 하세요.
3. 투자 판단은 사용자 본인의 몫임을 항상 유지하세요.
4. 답변 형식: 핵심 요점 2~4개를 번호 목록으로 간결하게. 각 항목은 1~2문장. 불필요한 서론·맺음말 없이 바로 본론부터.

{ticker} 종목에 관한 질문에 한국어로 답변하세요.

질문: {question}"""

    try:
        return _generate(prompt)
    except Exception:
        return "답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
