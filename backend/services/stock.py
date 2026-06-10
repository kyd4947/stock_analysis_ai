"""
한국 주식 실시간 데이터 수집.
1차: NAVER Finance 모바일 API
2차: Yahoo Finance (NAVER 실패 시 자동 fallback)
"""
import time
import requests


def _num(s) -> float | None:
    """양수만 파싱."""
    try:
        v = float(str(s).replace(",", "").strip())
        return v if v > 0 else None
    except Exception:
        return None


def _signed(s) -> float | None:
    """음수 포함 파싱."""
    try:
        return float(str(s).replace(",", "").strip())
    except Exception:
        return None


_NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://m.stock.naver.com/",
}

_YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}


def _yahoo_fallback(ticker: str) -> dict:
    """Yahoo Finance로 한국 주식 가격 조회 (KOSPI→.KS, KOSDAQ→.KQ 순 시도)."""
    for suffix in [".KS", ".KQ"]:
        try:
            r = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}{suffix}",
                headers=_YAHOO_HEADERS,
                timeout=8,
            )
            if not r.ok:
                continue
            result_list = (r.json().get("chart") or {}).get("result")
            if not result_list:
                continue
            meta = result_list[0].get("meta", {})
            price = float(meta.get("regularMarketPrice") or meta.get("previousClose") or 0)
            if price <= 0:
                continue
            prev = float(meta.get("previousClose") or meta.get("chartPreviousClose") or price)
            change_val = round(price - prev, 0)
            change_rate = round(change_val / prev * 100, 2) if prev else 0.0
            name = meta.get("shortName") or meta.get("longName") or ticker
            print(f"[Stock] {ticker} Yahoo fallback OK ({suffix}): {price}", flush=True)
            return {
                "name": name,
                "price": round(price),
                "change_rate": change_rate,
                "change_value": change_val,
            }
        except Exception as e:
            print(f"[Stock] {ticker} Yahoo {suffix} error: {e}", flush=True)
    return {}


def get_stock_data(ticker: str) -> dict:
    """실시간 주가·재무지표 조회. NAVER 실패 시 Yahoo Finance로 자동 전환."""
    result = {
        "ticker": ticker,
        "name": None,
        "price": None,
        "change_rate": None,
        "change_value": None,
        "sector": None,
        "per": None,
        "pbr": None,
        "roe": None,
        "eps": None,
        "bps": None,
    }

    # ── 1차: NAVER Finance ────────────────────────────────────────────────────
    naver_ok = False
    try:
        r = None
        for attempt in range(2):
            try:
                r = requests.get(
                    f"https://m.stock.naver.com/api/stock/{ticker}/basic",
                    headers=_NAVER_HEADERS,
                    timeout=8,
                )
                if r.ok:
                    naver_ok = True
                    break
                print(f"[Stock] NAVER {ticker} attempt {attempt+1}: HTTP {r.status_code}", flush=True)
            except requests.Timeout:
                print(f"[Stock] NAVER {ticker} attempt {attempt+1}: timeout", flush=True)
            if attempt < 1:
                time.sleep(1)

        if naver_ok and r is not None:
            data = r.json()
            price = (
                _num(data.get("closePrice"))
                or _num(data.get("currentPrice"))
                or _num(data.get("tradePrice"))
                or _num(data.get("nv"))
            )
            name_val = data.get("stockName") or data.get("symbolCode")
            if name_val:
                result["name"] = name_val

            if price:
                result.update({
                    "name": data.get("stockName") or ticker,
                    "price": round(price),
                    "change_rate": round(_signed(data.get("fluctuationsRatio")) or 0.0, 2),
                    "change_value": round(_signed(data.get("compareToPreviousClosePrice")) or 0.0),
                })

                # 재무지표: /finance/annual
                try:
                    fa = requests.get(
                        f"https://m.stock.naver.com/api/stock/{ticker}/finance/annual",
                        headers=_NAVER_HEADERS,
                        timeout=6,
                    )
                    if fa.ok:
                        fi = fa.json().get("financeInfo", {})
                        titles = fi.get("trTitleList", [])
                        rows = fi.get("rowList", [])
                        actual_keys = sorted(
                            [t["key"] for t in titles if t.get("isConsensus", "N") == "N"],
                            reverse=True,
                        )
                        key = actual_keys[0] if actual_keys else None
                        if key:
                            for row in rows:
                                title = row.get("title", "")
                                raw = str(row.get("columns", {}).get(key, {}).get("value") or "").replace(",", "").replace("%", "")
                                if title in ("PER", "PBR", "BPS"):
                                    val = _num(raw)
                                    if val is not None:
                                        result[title.lower()] = round(val, 2)
                                elif title in ("ROE", "EPS"):
                                    val = _signed(raw)
                                    if val is not None:
                                        result[title.lower()] = round(val, 2)
                except Exception:
                    pass

                return result  # NAVER 성공
    except Exception as e:
        print(f"[Stock] NAVER {ticker} exception: {e}", flush=True)

    # ── 2차: Yahoo Finance fallback ───────────────────────────────────────────
    yahoo = _yahoo_fallback(ticker)
    if yahoo:
        result.update(yahoo)

    return result


def get_naver_financials(ticker: str) -> dict:
    """NAVER Finance /finance/annual API에서 PER/PBR/ROE/EPS/BPS 조회 (DART 보완용)."""
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/stock/{ticker}/finance/annual",
            headers=_NAVER_HEADERS,
            timeout=8,
        )
        if not r.ok:
            return {}
        fi = r.json().get("financeInfo", {})
        titles = fi.get("trTitleList", [])
        rows = fi.get("rowList", [])
        actual_keys = sorted(
            [t["key"] for t in titles if t.get("isConsensus", "N") == "N"],
            reverse=True,
        )
        if not actual_keys:
            return {}
        key = actual_keys[0]
        result: dict = {}
        for row in rows:
            title = row.get("title", "")
            raw = str(row.get("columns", {}).get(key, {}).get("value") or "").replace(",", "").replace("%", "")
            if title in ("PER", "PBR", "BPS"):
                val = _num(raw)
                if val is not None:
                    result[title.lower()] = round(val, 2)
            elif title in ("ROE", "EPS"):
                val = _signed(raw)
                if val is not None:
                    result[title.lower()] = round(val, 2)
        return result
    except Exception:
        return {}


def get_price_history(ticker: str) -> dict:
    """Yahoo Finance에서 60일 일별 종가 조회 및 이동평균·고저 계산."""
    for suffix in [".KS", ".KQ"]:
        try:
            r = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}{suffix}",
                params={"interval": "1d", "range": "3mo"},
                headers=_YAHOO_HEADERS,
                timeout=10,
            )
            if not r.ok:
                continue
            result_list = (r.json().get("chart") or {}).get("result")
            if not result_list:
                continue
            quotes = result_list[0].get("indicators", {}).get("quote", [{}])[0]
            closes = quotes.get("close", [])
            highs  = quotes.get("high",  [])
            lows   = quotes.get("low",   [])

            # None 제거
            rows = [(c, h, l) for c, h, l in zip(closes, highs, lows) if c]
            if len(rows) < 5:
                continue

            cs = [r[0] for r in rows]

            def _ma(prices, n):
                if len(prices) < n:
                    return None
                return round(sum(prices[-n:]) / n)

            result = {
                "high_60d": round(max(r[1] for r in rows)),
                "low_60d":  round(min(r[2] for r in rows)),
                "ma5":  _ma(cs, 5),
                "ma20": _ma(cs, 20),
                "ma60": _ma(cs, 60),
                "recent_closes": [round(c) for c in cs[-10:]],
            }
            print(f"[Stock] {ticker} price history OK ({suffix}): {len(rows)}days", flush=True)
            return result
        except Exception as e:
            print(f"[Stock] {ticker} price_history {suffix} error: {e}", flush=True)
    return {}
