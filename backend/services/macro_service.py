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


def _get_usd_krw() -> dict | None:
    """USD/KRW 환율 조회 - 여러 소스를 순서대로 시도."""

    # 1차: NAVER Finance forex API (한국 서버에서 실시간)
    try:
        r = requests.get(
            "https://m.stock.naver.com/api/forex/FX_USDKRW/basic",
            headers=_NAVER_HEADERS,
            timeout=6,
        )
        if r.ok:
            data = r.json()
            raw = data.get("closePrice") or data.get("basePrice") or data.get("rate")
            price_str = str(raw).replace(",", "") if raw else ""
            price = float(price_str) if price_str else None
            if price and price > 100:
                change_raw = data.get("compareToPreviousClosePrice") or "0"
                change_val = float(str(change_raw).replace(",", ""))
                rate_raw = data.get("fluctuationsRatio") or "0"
                change_rate = float(str(rate_raw).replace(",", ""))
                print(f"[Macro] USD/KRW OK (NAVER): {price}", flush=True)
                return {"price": round(price, 2), "change_val": round(change_val, 2), "change_rate": round(change_rate, 2), "positive": change_val >= 0}
        print(f"[Macro/NAVER] fail {r.status_code}", flush=True)
    except Exception as e:
        print(f"[Macro/NAVER] {e}", flush=True)

    # 2차: Dunamu(Upbit) CDN API - 실시간
    try:
        r = requests.get(
            "https://quotation-api-cdn.dunamu.com/v1/forex/recent",
            params={"codes": "FRX.KRWUSD"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=6,
        )
        if r.ok:
            items = r.json()
            if items and isinstance(items, list):
                d = items[0]
                price = d.get("basePrice")
                if price and float(price) > 100:
                    change_val = float(d.get("signedChangePrice") or 0)
                    change_rate_raw = float(d.get("signedChangeRate") or 0)
                    print(f"[Macro] USD/KRW OK (Dunamu): {price}", flush=True)
                    return {"price": round(float(price), 2), "change_val": round(change_val, 2), "change_rate": round(change_rate_raw * 100, 2), "positive": change_val >= 0}
        print(f"[Macro/Dunamu] fail {r.status_code} {r.text[:60]}", flush=True)
    except Exception as e:
        print(f"[Macro/Dunamu] {e}", flush=True)

    # 3차: Yahoo Finance quoteSummary v10 (글로벌, API 키 불필요)
    try:
        r = requests.get(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/USDKRW=X",
            params={"modules": "price"},
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "application/json",
            },
            timeout=6,
        )
        if r.ok:
            price_data = (r.json().get("quoteSummary") or {}).get("result", [{}])[0].get("price", {})
            price = (price_data.get("regularMarketPrice") or {}).get("raw")
            if price and float(price) > 100:
                change_val = float((price_data.get("regularMarketChange") or {}).get("raw") or 0)
                change_rate = float((price_data.get("regularMarketChangePercent") or {}).get("raw") or 0)
                print(f"[Macro] USD/KRW OK (Yahoo quoteSummary): {price}", flush=True)
                return {"price": round(float(price), 2), "change_val": round(change_val, 2), "change_rate": round(change_rate * 100, 2), "positive": change_val >= 0}
        print(f"[Macro/Yahoo-qs] fail {r.status_code} {r.text[:60]}", flush=True)
    except Exception as e:
        print(f"[Macro/Yahoo-qs] {e}", flush=True)

    # 4차: Yahoo Finance v8 chart API
    try:
        r = requests.get(
            "https://query2.finance.yahoo.com/v8/finance/chart/USDKRW=X",
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Accept": "application/json"},
            timeout=6,
        )
        if r.ok:
            meta = ((r.json().get("chart") or {}).get("result") or [{}])[0].get("meta", {})
            price = meta.get("regularMarketPrice")
            if price and float(price) > 100:
                prev = meta.get("previousClose") or meta.get("chartPreviousClose") or price
                change_val = round(float(price) - float(prev), 2)
                change_rate = round(change_val / float(prev) * 100, 2) if prev else 0.0
                print(f"[Macro] USD/KRW OK (Yahoo chart): {price}", flush=True)
                return {"price": round(float(price), 2), "change_val": change_val, "change_rate": change_rate, "positive": change_val >= 0}
        print(f"[Macro/Yahoo-chart] fail {r.status_code} {r.text[:60]}", flush=True)
    except Exception as e:
        print(f"[Macro/Yahoo-chart] {e}", flush=True)

    # 5차: stooq.com CSV (당일 데이터, 글로벌 접근, API 키 불필요)
    try:
        r = requests.get(
            "https://stooq.com/q/d/l/",
            params={"s": "usdkrw.fx", "i": "d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=6,
        )
        if r.ok and r.text.strip():
            lines = [l for l in r.text.strip().split("\n") if l.strip()]
            if len(lines) >= 2:
                cols = lines[-1].split(",")
                if len(cols) >= 5:
                    close = float(cols[4])
                    if close > 100:
                        print(f"[Macro] USD/KRW OK (stooq): {close}", flush=True)
                        return {"price": round(close, 2), "change_val": 0.0, "change_rate": 0.0, "positive": True}
        print(f"[Macro/stooq] fail {r.status_code} {r.text[:60]}", flush=True)
    except Exception as e:
        print(f"[Macro/stooq] {e}", flush=True)

    # 6차: ExchangeRate-API (최후 수단, 24시간 업데이트)
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=6)
        if r.ok:
            krw = r.json().get("rates", {}).get("KRW")
            if krw:
                print(f"[Macro] USD/KRW fallback (ExchangeRate-API): {krw}", flush=True)
                return {"price": round(float(krw), 2), "change_val": 0.0, "change_rate": 0.0, "positive": True}
    except Exception as e:
        print(f"[Macro/ExchangeRate] {e}", flush=True)

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

    usd_krw = _get_usd_krw()
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
