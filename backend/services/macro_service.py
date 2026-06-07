"""
거시경제 데이터 수집:
- KOSPI/KOSDAQ/USD-KRW: yfinance 실시간
- 한국 기준금리 / CPI: ECOS API
- 미국 기준금리 / 10Y 수익률: FRED API
"""
import datetime
import requests
import yfinance as yf

from backend.core.config import settings


def _index_snapshot(symbol: str) -> dict | None:
    try:
        t = yf.Ticker(symbol)
        info = t.fast_info
        price = info.last_price
        prev = info.previous_close
        if not price:
            return None
        change_val = price - prev
        change_rate = (change_val / prev * 100) if prev else 0.0
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

    kospi = _index_snapshot("^KS11")
    if kospi:
        result["kospi"] = kospi

    kosdaq = _index_snapshot("^KQ11")
    if kosdaq:
        result["kosdaq"] = kosdaq

    usd_krw = _index_snapshot("KRW=X")
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
