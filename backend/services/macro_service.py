"""
거시경제 데이터 수집:
- KOSPI/KOSDAQ/USD-KRW: NAVER Finance 실시간
- 한국 기준금리 / CPI: ECOS API
- 미국 기준금리 / 10Y 수익률: FRED API
"""
import datetime
import requests

from backend.core.config import settings

_NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://m.stock.naver.com/",
}


def _naver_index(index_code: str) -> dict | None:
    """NAVER Finance에서 지수(KOSPI/KOSDAQ) 실시간 데이터 조회."""
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/index/{index_code}/basic",
            headers=_NAVER_HEADERS,
            timeout=8,
        )
        if not r.ok:
            return None
        data = r.json()
        price_str = str(data.get("closePrice") or "").replace(",", "")
        price = float(price_str) if price_str else None
        if not price:
            return None
        change_str = str(data.get("compareToPreviousClosePrice") or "0").replace(",", "")
        change_val = float(change_str) if change_str else 0.0
        change_rate_str = str(data.get("fluctuationsRatio") or "0")
        change_rate = float(change_rate_str) if change_rate_str else 0.0
        return {
            "price": round(price, 2),
            "change_val": round(change_val, 2),
            "change_rate": round(change_rate, 2),
            "positive": change_val >= 0,
        }
    except Exception:
        return None


def _naver_forex(forex_code: str) -> dict | None:
    """NAVER Finance에서 환율 실시간 데이터 조회."""
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/forex/{forex_code}/basic",
            headers=_NAVER_HEADERS,
            timeout=8,
        )
        if not r.ok:
            return None
        data = r.json()
        price_str = str(data.get("closePrice") or "").replace(",", "")
        price = float(price_str) if price_str else None
        if not price:
            return None
        change_str = str(data.get("compareToPreviousClosePrice") or "0").replace(",", "")
        change_val = float(change_str) if change_str else 0.0
        change_rate_str = str(data.get("fluctuationsRatio") or "0")
        change_rate = float(change_rate_str) if change_rate_str else 0.0
        return {
            "price": round(price, 2),
            "change_val": round(change_val, 2),
            "change_rate": round(change_rate, 2),
            "positive": change_val >= 0,
        }
    except Exception:
        return None


def _ecos_policy_rate() -> float | None:
    if not settings.ECOS_API_KEY:
        return None
    try:
        today = datetime.date.today()
        start = (today.replace(day=1) - datetime.timedelta(days=90)).strftime("%Y%m")
        end = today.strftime("%Y%m")
        url = (
            f"https://ecos.bok.or.kr/api/StatisticSearch"
            f"/{settings.ECOS_API_KEY}/json/kr/1/5/722Y001/M/{start}/{end}/0101000"
        )
        r = requests.get(url, timeout=8)
        if r.ok:
            rows = r.json().get("StatisticSearch", {}).get("row", [])
            if rows:
                return float(rows[-1]["DATA_VALUE"])
    except Exception:
        pass
    return None


def _ecos_cpi_yoy() -> float | None:
    if not settings.ECOS_API_KEY:
        return None
    try:
        today = datetime.date.today()
        start = (today.replace(day=1) - datetime.timedelta(days=400)).strftime("%Y%m")
        end = today.strftime("%Y%m")
        url = (
            f"https://ecos.bok.or.kr/api/StatisticSearch"
            f"/{settings.ECOS_API_KEY}/json/kr/1/15/021Y126/M/{start}/{end}/0"
        )
        r = requests.get(url, timeout=8)
        if r.ok:
            rows = r.json().get("StatisticSearch", {}).get("row", [])
            if len(rows) >= 13:
                current = float(rows[-1]["DATA_VALUE"])
                year_ago = float(rows[-13]["DATA_VALUE"])
                return round((current - year_ago) / year_ago * 100, 2)
    except Exception:
        pass
    return None


def _fred_series(series_id: str) -> float | None:
    if not settings.FRED_API_KEY:
        return None
    try:
        r = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": series_id,
                "api_key": settings.FRED_API_KEY,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 1,
            },
            timeout=8,
        )
        if r.ok:
            obs = r.json().get("observations", [])
            if obs and obs[0]["value"] != ".":
                return float(obs[0]["value"])
    except Exception:
        pass
    return None


def get_macro_snapshot() -> dict:
    result: dict = {}

    kospi = _naver_index("KOSPI")
    if kospi:
        result["kospi"] = kospi

    kosdaq = _naver_index("KOSDAQ")
    if kosdaq:
        result["kosdaq"] = kosdaq

    usd_krw = _naver_forex("FX_USDKRW")
    if usd_krw:
        result["usd_krw"] = usd_krw
        result["exchange_rate_usdkrw"] = usd_krw["price"]

    policy_rate = _ecos_policy_rate()
    if policy_rate is not None:
        result["policy_rate"] = policy_rate

    inflation_yoy = _ecos_cpi_yoy()
    if inflation_yoy is not None:
        result["inflation_yoy"] = inflation_yoy

    fed_funds = _fred_series("FEDFUNDS")
    if fed_funds is not None:
        result["fed_funds_rate"] = fed_funds

    us_10y = _fred_series("DGS10")
    if us_10y is not None:
        result["us_10y_yield"] = us_10y

    return result
