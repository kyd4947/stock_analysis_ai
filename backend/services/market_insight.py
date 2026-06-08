"""
시장 해석 AI 분석.
- 후보 종목 20개의 실시간 가격/등락률을 병렬 수집 후 Gemini에 전달.
- Gemini는 거시경제 + 실시간 시황을 종합해 오늘 주목할 종목 5개를 선정.
- 결과는 메모리에 캐시. 한국 시간 기준 매일 오전 8시 이후 첫 요청 시 갱신.
"""
import concurrent.futures
import datetime
import json
import re
import zoneinfo

import requests

from backend.services import gemini as gemini_svc

_KST = zoneinfo.ZoneInfo("Asia/Seoul")

_cache: dict | None = None
_cache_time: datetime.datetime | None = None

_NAVER_HDRS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://m.stock.naver.com/",
}

# 추천 후보 종목 (ticker, name, sector) — 실시간 시황 수집 대상
_CANDIDATES = [
    ("005930", "삼성전자", "반도체"),
    ("000660", "SK하이닉스", "AI메모리"),
    ("035420", "NAVER", "플랫폼"),
    ("035720", "카카오", "플랫폼"),
    ("005380", "현대차", "자동차"),
    ("000270", "기아", "자동차"),
    ("051910", "LG화학", "배터리소재"),
    ("006400", "삼성SDI", "배터리"),
    ("207940", "삼성바이오로직스", "바이오CDMO"),
    ("068270", "셀트리온", "바이오"),
    ("105560", "KB금융", "금융"),
    ("055550", "신한지주", "금융"),
    ("005490", "POSCO홀딩스", "철강"),
    ("373220", "LG에너지솔루션", "배터리"),
    ("267260", "HD현대일렉트릭", "전력인프라"),
    ("012330", "현대모비스", "자동차부품"),
    ("247540", "에코프로비엠", "배터리소재"),
    ("034020", "두산에너빌리티", "원전/에너지"),
    ("066570", "LG전자", "가전/전장"),
    ("096770", "SK이노베이션", "에너지화학"),
]


def _fetch_one_price(item: tuple) -> tuple | None:
    ticker, name, sector = item
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/stock/{ticker}/basic",
            headers=_NAVER_HDRS,
            timeout=5,
        )
        if r.ok:
            d = r.json()
            price_str = str(d.get("closePrice") or "").replace(",", "")
            price = float(price_str) if price_str else None
            if not price:
                return None
            rate = float(str(d.get("fluctuationsRatio") or "0"))
            return (ticker, name, sector, round(price), round(rate, 2))
    except Exception:
        pass
    return None


def _fetch_all_prices() -> list[tuple]:
    """후보 종목 현재가/등락률 병렬 수집."""
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(_fetch_one_price, _CANDIDATES))
        fetched = [r for r in results if r is not None]
        print(f"[MarketInsight] 가격 수집 {len(fetched)}/{len(_CANDIDATES)}개 성공", flush=True)
        return fetched
    except Exception as e:
        print(f"[MarketInsight] 가격 수집 실패: {e}", flush=True)
        return []


def _should_refresh() -> bool:
    if _cache is None or _cache_time is None:
        return True
    now = datetime.datetime.now(_KST)
    today_8am = now.replace(hour=8, minute=0, second=0, microsecond=0)
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
            {"ticker": "267260", "name": "HD현대일렉트릭", "sector": "전력인프라"},
            {"ticker": "105560", "name": "KB금융", "sector": "금융"},
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

    # 후보 종목 실시간 시황 수집
    prices = _fetch_all_prices()
    if prices:
        lines = []
        for ticker, name, sector, price, rate in prices:
            sign = "+" if rate >= 0 else ""
            lines.append(f"  {name}({ticker}/{sector}): {price:,}원 {sign}{rate}%")
        price_section = "\n".join(lines)
    else:
        price_section = "  (실시간 시황 수집 실패 — 거시경제만 참고)"

    prompt = f"""당신은 한국 주식시장 전문 AI 투자 애널리스트입니다.
아래 거시경제 데이터와 오늘의 종목 실시간 시황을 바탕으로 시장 해석과 오늘 주목할 종목을 생성하세요.

[거시경제 데이터]
KOSPI: {_fmt_index(kospi, "KOSPI")}
KOSDAQ: {_fmt_index(kosdaq, "KOSDAQ")}
USD/KRW: {f"{usd_krw:,.1f}" if usd_krw else "N/A"}
한국 기준금리: {f"{policy_rate}%" if policy_rate else "N/A"}
미국 기준금리(FF): {f"{fed_rate}%" if fed_rate else "N/A"}
한국 인플레이션(YoY): {f"{inflation}%" if inflation else "N/A"}
미국 10년 국채금리: {f"{us_10y}%" if us_10y else "N/A"}

[오늘의 주요 종목 실시간 시황 (현재가 / 1일 등락률)]
{price_section}

[추천 종목 선정 기준]
1. 위 목록에 있는 종목만 추천 (목록 외 종목 선택 금지)
2. 오늘 1일 등락률 -3% 이하인 종목은 제외 (하락 추세 신호)
3. 등락률이 플러스(+)이거나 소폭 마이너스(-3% 이상)인 종목 우선
4. 현재 거시경제 환경(금리/환율/지수 흐름)에서 수혜 가능한 업종 우선
5. 5개 종목을 서로 다른 섹터에서 다양하게 선택

반드시 아래 JSON 형식만 응답하세요 (마크다운 없이):
{{"interpretation": "현재 시장 상황을 2~3문장으로 설명. 투자자에게 유용한 실질적 인사이트 포함.", "risk_appetite": "보수적 또는 중립 또는 중립+ 또는 공격적 중 하나", "recommended_weight": 0~100 사이 정수, "sectors": [{{"name": "반도체", "score": 0~100 정수}}, {{"name": "자동차", "score": 0~100 정수}}, {{"name": "금융", "score": 0~100 정수}}, {{"name": "바이오", "score": 0~100 정수}}, {{"name": "IT/플랫폼", "score": 0~100 정수}}, {{"name": "에너지/화학", "score": 0~100 정수}}], "recommended_tickers": [{{"ticker": "005930", "name": "삼성전자", "sector": "반도체"}}, {{"ticker": "000660", "name": "SK하이닉스", "sector": "AI메모리"}}, {{"ticker": "035420", "name": "NAVER", "sector": "플랫폼"}}, {{"ticker": "267260", "name": "HD현대일렉트릭", "sector": "전력인프라"}}, {{"ticker": "005380", "name": "현대차", "sector": "자동차"}}]}}"""

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
