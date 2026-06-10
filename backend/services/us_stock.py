"""
미국 주식 데이터 수집 — Yahoo Finance API
"""
import requests

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}
_BASES = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]


def _raw_val(d: dict, key: str):
    v = d.get(key)
    if isinstance(v, dict):
        return v.get("raw")
    return v


def get_us_stock_data(ticker: str) -> dict:
    """Yahoo Finance에서 미국 주식 기본 데이터(가격, 이름, 섹터) 조회."""
    ticker = ticker.upper()
    for base in _BASES:
        try:
            r = requests.get(
                f"{base}/v8/finance/chart/{ticker}",
                params={"interval": "1d", "range": "1d"},
                headers=_HEADERS,
                timeout=8,
            )
            if not r.ok:
                continue
            result_list = (r.json().get("chart") or {}).get("result")
            if not result_list:
                continue
            meta = result_list[0].get("meta", {})
            price = float(meta.get("regularMarketPrice") or 0)
            prev = float(meta.get("previousClose") or meta.get("chartPreviousClose") or 0)
            if price <= 0:
                continue
            change_val = round(price - prev, 2) if prev > 0 else 0.0
            change_rate = round(change_val / prev * 100, 2) if prev > 0 else 0.0
            print(f"[US Stock] {ticker} OK: ${price} ({change_rate:+.2f}%)", flush=True)
            return {
                "price": round(price, 2),
                "change_val": change_val,
                "change_rate": change_rate,
                "positive": change_val >= 0,
                "name": meta.get("longName") or meta.get("shortName") or ticker,
                "sector": meta.get("sector") or "",
                "currency": meta.get("currency") or "USD",
            }
        except Exception as e:
            print(f"[US Stock] {ticker} {base} error: {e}", flush=True)
    return {}


def get_us_stock_financials(ticker: str) -> dict:
    """Yahoo Finance에서 미국 주식 재무지표(PER, PBR, ROE) 조회."""
    ticker = ticker.upper()
    for base in _BASES:
        try:
            r = requests.get(
                f"{base}/v10/finance/quoteSummary/{ticker}",
                params={"modules": "defaultKeyStatistics,financialData"},
                headers=_HEADERS,
                timeout=8,
            )
            if not r.ok:
                continue
            result = ((r.json().get("quoteSummary") or {}).get("result") or [None])[0]
            if not result:
                continue
            stats = result.get("defaultKeyStatistics", {})
            fin = result.get("financialData", {})

            per = _raw_val(stats, "trailingPE") or _raw_val(stats, "forwardPE")
            pbr = _raw_val(stats, "priceToBook")
            roe_raw = _raw_val(fin, "returnOnEquity")
            roe = round(roe_raw * 100, 2) if roe_raw is not None else None

            return {
                "per": round(per, 2) if per else None,
                "pbr": round(pbr, 2) if pbr else None,
                "roe": roe,
            }
        except Exception as e:
            print(f"[US Stock Fin] {ticker} error: {e}", flush=True)
    return {}


def search_us_stocks(query: str, limit: int = 10) -> list[dict]:
    """Yahoo Finance 자동완성 API로 미국 주식 검색."""
    try:
        r = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/search",
            params={"q": query, "lang": "en-US", "region": "US", "quotesCount": limit},
            headers=_HEADERS,
            timeout=6,
        )
        if not r.ok:
            return []
        quotes = r.json().get("quotes") or []
        return [
            {
                "ticker": q["symbol"],
                "name": q.get("longname") or q.get("shortname") or q["symbol"],
            }
            for q in quotes
            if q.get("symbol") and q.get("quoteType") in ("EQUITY", "ETF")
        ][:limit]
    except Exception as e:
        print(f"[US Search] error: {e}", flush=True)
    return []
