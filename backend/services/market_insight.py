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

반드시 아래 JSON 형식만 응답하세요 (마크다운 없이):
{{"interpretation": "현재 시장 상황을 2~3문장으로 설명. 투자자에게 유용한 실질적 인사이트 포함.", "risk_appetite": "보수적 또는 중립 또는 중립+ 또는 공격적 중 하나", "recommended_weight": 0~100 사이 정수, "sectors": [{{"name": "반도체", "score": 0~100 정수}}, {{"name": "자동차", "score": 0~100 정수}}, {{"name": "금융", "score": 0~100 정수}}, {{"name": "바이오", "score": 0~100 정수}}, {{"name": "IT/플랫폼", "score": 0~100 정수}}, {{"name": "에너지/화학", "score": 0~100 정수}}]}}"""

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
