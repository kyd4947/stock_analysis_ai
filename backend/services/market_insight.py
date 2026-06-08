"""
시장 해석 AI 분석.
- Gemini가 거시경제 데이터를 바탕으로 시장 해석, 위험 선호도, 섹터 온도를 생성.
- 결과는 메모리에 캐시. 한국 시간 기준 매일 오전 8시 이후 첫 요청 시 갱신.
"""
import json
import re
import datetime
import zoneinfo
from backend.services import gemini as gemini_svc

_KST = zoneinfo.ZoneInfo("Asia/Seoul")

_cache: dict | None = None
_cache_time: datetime.datetime | None = None


def _should_refresh() -> bool:
    if _cache is None or _cache_time is None:
        return True
    now = datetime.datetime.now(_KST)
    today_8am = now.replace(hour=8, minute=0, second=0, microsecond=0)
    # 오늘 8시가 지났고, 캐시가 오늘 8시 이전에 생성됐으면 갱신
    return now >= today_8am and _cache_time < today_8am


def _fallback() -> dict:
    return {
        "interpretation": "현재 시장 데이터를 분석 중입니다. 잠시 후 다시 확인해주세요.",
        "risk_appetite": "중립",
        "recommended_weight": 60,
        "sectors": [
            {"name": "반도체", "score": 75},
            {"name": "자동차", "score": 60},
            {"name": "금융", "score": 55},
            {"name": "바이오", "score": 65},
            {"name": "IT/플랫폼", "score": 70},
            {"name": "에너지/화학", "score": 50},
        ],
        "recommended_tickers": [
            {"ticker": "005930", "name": "삼성전자", "sector": "반도체"},
            {"ticker": "000660", "name": "SK하이닉스", "sector": "AI메모리"},
            {"ticker": "035420", "name": "NAVER", "sector": "플랫폼"},
            {"ticker": "207940", "name": "삼성바이오로직스", "sector": "바이오"},
            {"ticker": "005380", "name": "현대차", "sector": "자동차"},
        ],
        "generated_at": None,
    }


def _generate_insight(macro: dict) -> dict:
    kospi = macro.get("kospi") or {}
    kosdaq = macro.get("kosdaq") or {}
    usd_krw = macro.get("exchange_rate_usdkrw") or (macro.get("usd_krw") or {}).get("price")
    policy_rate = macro.get("policy_rate")
    fed_rate = macro.get("fed_funds_rate")
    inflation = macro.get("inflation_yoy")
    us_10y = macro.get("us_10y_yield")

    def _fmt_index(d: dict, label: str) -> str:
        p = d.get("price")
        r = d.get("change_rate")
        if p and r is not None:
            return f"{p:,.2f} ({r:+.2f}%)"
        return "N/A"

    prompt = f"""당신은 한국 주식시장 전문 AI 매크로 애널리스트입니다. 아래 거시경제 데이터를 바탕으로 오늘의 한국 시장 해석을 생성하세요.

[거시경제 데이터]
KOSPI: {_fmt_index(kospi, "KOSPI")}
KOSDAQ: {_fmt_index(kosdaq, "KOSDAQ")}
USD/KRW: {f"{usd_krw:,.1f}" if usd_krw else "N/A"}
한국 기준금리: {f"{policy_rate}%" if policy_rate else "N/A"}
미국 기준금리(FF): {f"{fed_rate}%" if fed_rate else "N/A"}
한국 인플레이션(YoY): {f"{inflation}%" if inflation else "N/A"}
미국 10년 국채금리: {f"{us_10y}%" if us_10y else "N/A"}

[참고 종목 목록 - 실제 코스피/코스닥 상장 종목 (이 중에서만 추천)]
삼성전자(005930), SK하이닉스(000660), NAVER(035420), 카카오(035720),
현대차(005380), 기아(000270), LG화학(051910), 삼성SDI(006400),
삼성바이오로직스(207940), 셀트리온(068270), KB금융(105560), 신한지주(055550),
POSCO홀딩스(005490), LG전자(066570), SK이노베이션(096770), 에코프로비엠(247540),
크래프톤(259960), 카카오뱅크(323410), 고려아연(010130), 현대모비스(012330),
한국전력(015760), 삼성물산(028260), LG에너지솔루션(373220), HD현대일렉트릭(267260)

오늘의 시장 상황(KOSPI/KOSDAQ 흐름, 환율, 금리)을 고려하여 주목할 만한 종목 5개를 위 목록에서 선택하세요.
반드시 아래 JSON 형식만 응답하세요 (마크다운 없이):
{{"interpretation": "현재 시장 상황을 2~3문장으로 설명. 투자자에게 유용한 실질적 인사이트 포함.", "risk_appetite": "보수적 또는 중립 또는 중립+ 또는 공격적 중 하나", "recommended_weight": 0~100 사이 정수, "sectors": [{{"name": "반도체", "score": 0~100 정수}}, {{"name": "자동차", "score": 0~100 정수}}, {{"name": "금융", "score": 0~100 정수}}, {{"name": "바이오", "score": 0~100 정수}}, {{"name": "IT/플랫폼", "score": 0~100 정수}}, {{"name": "에너지/화학", "score": 0~100 정수}}], "recommended_tickers": [{{"ticker": "005930", "name": "삼성전자", "sector": "반도체"}}, {{"ticker": "000660", "name": "SK하이닉스", "sector": "AI메모리"}}, {{"ticker": "035420", "name": "NAVER", "sector": "플랫폼"}}, {{"ticker": "207940", "name": "삼성바이오로직스", "sector": "바이오"}}, {{"ticker": "005380", "name": "현대차", "sector": "자동차"}}]}}"""

    text = gemini_svc._generate(prompt)
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def get_market_insight(macro: dict) -> dict:
    global _cache, _cache_time

    if not _should_refresh() and _cache is not None:
        return _cache

    try:
        result = _generate_insight(macro)
        now = datetime.datetime.now(_KST)
        result["generated_at"] = now.isoformat()
        _cache = result
        _cache_time = now
        print(f"[MarketInsight] Generated at {now.strftime('%Y-%m-%d %H:%M KST')}", flush=True)
        return result
    except Exception as e:
        print(f"[MarketInsight] Gemini failed: {type(e).__name__}: {e}", flush=True)
        if _cache is not None:
            return _cache
        return _fallback()
