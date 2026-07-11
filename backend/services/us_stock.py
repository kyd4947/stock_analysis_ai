"""
미국 주식 데이터 수집 — Yahoo Finance API
"""
import re
import requests

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}
_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
_BASES = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]

_YAHOO_SESSION: requests.Session | None = None


def _get_yahoo_session() -> requests.Session:
    global _YAHOO_SESSION
    if _YAHOO_SESSION is None:
        s = requests.Session()
        s.headers.update(_BROWSER_HEADERS)
        try:
            s.get("https://fc.yahoo.com/", timeout=8)
            s.get("https://finance.yahoo.com/", timeout=8)
        except Exception:
            pass
        _YAHOO_SESSION = s
    return _YAHOO_SESSION


def _raw_val(d: dict, key: str):
    v = d.get(key)
    if isinstance(v, dict):
        return v.get("raw")
    return v


def get_us_stock_data(ticker: str) -> dict:
    """미국 주식 기본 데이터(가격, 이름) 조회 — Yahoo Finance."""
    ticker = ticker.upper()

    # ── Yahoo Finance ────────────────────────────────────────────────────────
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
            print(f"[US Stock] {ticker} Yahoo OK: ${price} ({change_rate:+.2f}%)", flush=True)
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


def _extract_yahoo_financials(ticker: str) -> dict:
    """Yahoo Finance HTML 페이지에서 재무지표 추출 (label-value 쌍 기반)."""
    try:
        r = requests.get(
            f"https://finance.yahoo.com/quote/{ticker}",
            headers=_BROWSER_HEADERS,
            timeout=10,
        )
        if not r.ok:
            return {}

        # label-value 쌍을 찾는 패턴: <p class="label ...">Label</p> <p class="value ...">Value</p>
        label_value_pairs = re.findall(
            r'<p class="label[^"]*">\s*(.*?)\s*</p>\s*<p class="value[^"]*">\s*(.*?)\s*</p>',
            r.text,
            re.DOTALL,
        )

        per = None
        pbr = None
        roe = None

        for label, value in label_value_pairs:
            label = label.strip()
            value_str = value.strip().replace(",", "").replace("%", "").replace("x", "")
            try:
                if "trailing p/e" in label.lower() or "pe ratio (ttm)" in label.lower():
                    per = float(value_str)
                elif "price/book" in label.lower():
                    pbr = float(value_str)
                elif "return on equity" in label.lower():
                    roe = float(value_str)
            except ValueError:
                continue

        if any(v is not None for v in [per, pbr, roe]):
            print(f"[US Fin HTML] {ticker} OK: PER={per} PBR={pbr} ROE={roe}", flush=True)
            return {
                "per": round(per, 2) if per else None,
                "pbr": round(pbr, 2) if pbr else None,
                "roe": roe,
            }

        # fallback: fin-streamer data-field 방식
        streamer_pairs = re.findall(
            r'data-value="([\d.]+)"[^>]*data-field="(trailingPE|forwardPE|priceToBook|returnOnEquity)"',
            r.text,
        )
        seen = {}
        for val, field in streamer_pairs:
            if field not in seen:
                seen[field] = val

        if "trailingPE" in seen and per is None:
            per = float(seen["trailingPE"])
        if "priceToBook" in seen and pbr is None:
            pbr = float(seen["priceToBook"])
        if "returnOnEquity" in seen and roe is None:
            roe = round(float(seen["returnOnEquity"]), 2)

        if any(v is not None for v in [per, pbr, roe]):
            print(f"[US Fin HTML/Streamer] {ticker} OK: PER={per} PBR={pbr} ROE={roe}", flush=True)
            return {
                "per": round(per, 2) if per else None,
                "pbr": round(pbr, 2) if pbr else None,
                "roe": roe,
            }

        return {}
    except Exception as e:
        print(f"[US Fin HTML] {ticker} error: {e}", flush=True)
        return {}


def get_us_stock_financials(ticker: str) -> dict:
    """미국 주식 재무지표(PER, PBR, ROE) 조회.

    우선순위:
      1. yfinance 라이브러리 (설치된 경우)
      2. Yahoo Finance HTML 페이지 label-value 파싱
      3. Yahoo Finance HTML fin-streamer data-field 파싱
    """
    ticker = ticker.upper()

    # 1차: yfinance (optional)
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker)
        info = stock.info or {}
        per = info.get("trailingPE") or info.get("forwardPE")
        pbr = info.get("priceToBook")
        roe_raw = info.get("returnOnEquity")
        roe = round(roe_raw * 100, 2) if roe_raw is not None else None

        if any(v is not None for v in [per, pbr, roe]):
            print(f"[US Fin yfinance] {ticker} OK: PER={per} PBR={pbr} ROE={roe}", flush=True)
            return {
                "per": round(per, 2) if per else None,
                "pbr": round(pbr, 2) if pbr else None,
                "roe": roe,
            }
    except ImportError:
        pass
    except Exception as e:
        print(f"[US Fin yfinance] {ticker} error: {e}", flush=True)

    # 2차: Yahoo Finance HTML 파싱
    result = _extract_yahoo_financials(ticker)
    if result:
        return result

    return {}


def get_us_price_history(ticker: str) -> dict:
    """미국 주식 1년 일별 OHLCV 조회 (Yahoo Finance v8 chart)."""
    for base in _BASES:
        try:
            r = requests.get(
                f"{base}/v8/finance/chart/{ticker}",
                params={"interval": "1d", "range": "1y"},
                headers=_HEADERS,
                timeout=10,
            )
            if not r.ok:
                continue
            result_list = (r.json().get("chart") or {}).get("result")
            if not result_list:
                continue
            quotes = result_list[0].get("indicators", {}).get("quote", [{}])[0]
            closes  = quotes.get("close",  [])
            highs   = quotes.get("high",   [])
            lows    = quotes.get("low",    [])
            volumes = quotes.get("volume", [])

            rows = [
                (c, h, l, v)
                for c, h, l, v in zip(closes, highs, lows, volumes)
                if c
            ]
            if len(rows) < 5:
                continue

            cs = [r[0] for r in rows]
            hs = [r[1] for r in rows]
            ls = [r[2] for r in rows]
            vs = [r[3] for r in rows if r[3] and r[3] > 0]

            def _ma(prices, n):
                return round(sum(prices[-n:]) / n, 2) if len(prices) >= n else None

            high_52w = round(max(hs), 2)
            low_52w  = round(min(ls), 2)
            curr = cs[-1]
            position_52w = round((curr - low_52w) / (high_52w - low_52w) * 100, 1) if high_52w > low_52w else 50.0
            pct_from_52w_high = round((curr - high_52w) / high_52w * 100, 1)

            curr_vol = vs[-1] if vs else None
            avg_vol_20 = round(sum(vs[-21:-1]) / 20, 2) if len(vs) >= 21 else None
            vol_ratio = round(curr_vol / avg_vol_20, 2) if avg_vol_20 and curr_vol else None

            ret_5d  = round((cs[-1] / cs[-6]  - 1) * 100, 2) if len(cs) >= 6  else None
            ret_20d = round((cs[-1] / cs[-21] - 1) * 100, 2) if len(cs) >= 21 else None

            print(f"[US Price History] {ticker} OK: {len(rows)}days", flush=True)
            return {
                "high_52w": high_52w,
                "low_52w":  low_52w,
                "position_52w": position_52w,
                "pct_from_52w_high": pct_from_52w_high,
                "ma5":  _ma(cs, 5),
                "ma20": _ma(cs, 20),
                "ma60": _ma(cs, 60),
                "curr_vol": curr_vol,
                "avg_vol_20d": avg_vol_20,
                "vol_ratio_20d": vol_ratio,
                "ret_5d":  ret_5d,
                "ret_20d": ret_20d,
                "recent_closes": [round(c, 2) for c in cs[-10:]],
            }
        except Exception as e:
            print(f"[US Price History] {ticker} {base} error: {e}", flush=True)
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
