"""
거시경제 데이터 수집:
- KOSPI/KOSDAQ/USD-KRW: NAVER Finance 실시간
- 한국 기준금리 / CPI: ECOS API  (하루 1회 캐시)
- 미국 기준금리 / 10Y 수익률: FRED API  (하루 1회 캐시)
"""
import datetime
import requests

from backend.core.config import settings

# 금리·CPI·고용 등 저빈도 변동 데이터 — 24시간 캐시
_SLOW_CACHE: dict | None = None
_SLOW_CACHE_TIME: datetime.datetime | None = None
_SLOW_TTL_SECONDS = 86_400  # 24 hours

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


def _get_vkospi() -> dict | None:
    """VKOSPI(코스피 변동성 지수) — NAVER Finance 전용 (Yahoo Finance에 ^VKOSPI 없음)."""

    # 1차: NAVER Finance /api/index/VKOSPI/basic
    try:
        r = requests.get(
            "https://m.stock.naver.com/api/index/VKOSPI/basic",
            headers=_NAVER_HEADERS,
            timeout=8,
        )
        if r.ok:
            data = r.json()
            print(f"[Macro] VKOSPI basic raw: {data}", flush=True)
            raw = (
                data.get("closePrice") or data.get("nIndexVal") or
                data.get("indexLevel") or data.get("currentIndex") or
                data.get("price") or data.get("marketPrice")
            )
            price_str = str(raw or "").replace(",", "").strip()
            price = float(price_str) if price_str else None
            if price:
                change_str = str(
                    data.get("compareToPreviousClosePrice") or
                    data.get("priceChangeValue") or data.get("change") or "0"
                ).replace(",", "")
                change_val = float(change_str) if change_str else 0.0
                change_rate_str = str(
                    data.get("fluctuationsRatio") or data.get("priceChangeRate") or
                    data.get("changeRate") or "0"
                )
                change_rate = float(change_rate_str) if change_rate_str else 0.0
                print(f"[Macro] VKOSPI basic OK: {price} ({change_rate:+.2f}%)", flush=True)
                return {
                    "price": round(price, 2),
                    "change_val": round(change_val, 2),
                    "change_rate": round(change_rate, 2),
                    "positive": change_val >= 0,
                }
        else:
            print(f"[Macro] VKOSPI basic fail: {r.status_code}", flush=True)
    except Exception as e:
        print(f"[Macro] VKOSPI basic error: {e}", flush=True)

    # 2차: NAVER Finance 차트 API (일봉)
    try:
        now = datetime.datetime.now()
        start = (now - datetime.timedelta(days=10)).strftime("%Y%m%d000000")
        end = now.strftime("%Y%m%d235959")
        r = requests.get(
            "https://m.stock.naver.com/api/chart/domestic/index/VKOSPI/day",
            params={"startDateTime": start, "endDateTime": end},
            headers=_NAVER_HEADERS,
            timeout=8,
        )
        if r.ok:
            items = r.json()
            if items and isinstance(items, list):
                last = items[-1]
                prev_item = items[-2] if len(items) >= 2 else None
                print(f"[Macro] VKOSPI chart item: {last}", flush=True)
                price = float(
                    last.get("closePrice") or last.get("close") or
                    last.get("price") or last.get("indexLevel") or 0
                )
                if price:
                    prev_price = price
                    if prev_item:
                        prev_price = float(
                            prev_item.get("closePrice") or prev_item.get("close") or
                            prev_item.get("price") or prev_item.get("indexLevel") or price
                        )
                    change_val = round(price - prev_price, 2)
                    change_rate = round(change_val / prev_price * 100, 2) if prev_price else 0.0
                    print(f"[Macro] VKOSPI chart OK: {price} ({change_rate:+.2f}%)", flush=True)
                    return {
                        "price": round(price, 2),
                        "change_val": change_val,
                        "change_rate": change_rate,
                        "positive": change_val >= 0,
                    }
        else:
            print(f"[Macro] VKOSPI chart fail: {r.status_code} {r.text[:80]}", flush=True)
    except Exception as e:
        print(f"[Macro] VKOSPI chart error: {e}", flush=True)

    # 3차: NAVER Finance fchart (구형 XML API)
    try:
        import re as _re
        r = requests.get(
            "https://fchart.stock.naver.com/sise.nhn",
            params={"requestType": "0", "symbol": "VKOSPI", "timeframe": "day", "count": "3"},
            headers=_NAVER_HEADERS,
            timeout=8,
        )
        if r.ok and r.text.strip():
            print(f"[Macro] VKOSPI fchart raw: {r.text[:200]}", flush=True)
            matches = _re.findall(r'data="([^"]+)"', r.text)
            rows = [m.split("|") for m in matches if len(m.split("|")) >= 5]
            if rows:
                last_row = rows[-1]
                prev_row = rows[-2] if len(rows) >= 2 else None
                price = float(last_row[4])
                if price:
                    prev_price = float(prev_row[4]) if prev_row else price
                    change_val = round(price - prev_price, 2)
                    change_rate = round(change_val / prev_price * 100, 2) if prev_price else 0.0
                    print(f"[Macro] VKOSPI fchart OK: {price} ({change_rate:+.2f}%)", flush=True)
                    return {
                        "price": round(price, 2),
                        "change_val": change_val,
                        "change_rate": change_rate,
                        "positive": change_val >= 0,
                    }
        else:
            print(f"[Macro] VKOSPI fchart fail: {r.status_code}", flush=True)
    except Exception as e:
        print(f"[Macro] VKOSPI fchart error: {e}", flush=True)

    # 4차: KOSPI 역사적 변동성 (연환산) — Yahoo Finance ^KS11 (NAVER 차단 시 fallback)
    # VKOSPI 값 범위(10~40)와 동일한 범위를 가지므로 공포지수 대리값으로 적합
    try:
        import yfinance as yf, math
        hist = yf.Ticker("^KS11").history(period="30d")
        closes = hist["Close"].tolist()
        if len(closes) >= 5:
            log_rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
            mean = sum(log_rets) / len(log_rets)
            var = sum((r - mean) ** 2 for r in log_rets) / max(len(log_rets) - 1, 1)
            ann_vol = round(math.sqrt(var) * math.sqrt(252) * 100, 2)
            print(f"[Macro] VKOSPI proxy (KOSPI hist vol): {ann_vol}", flush=True)
            return {"price": ann_vol, "change_val": 0.0, "change_rate": 0.0, "positive": True}
    except Exception as e:
        print(f"[Macro] VKOSPI hist vol error: {e}", flush=True)

    return None


def _yahoo_us_index(symbol: str, label: str) -> dict | None:
    """Yahoo Finance에서 미국 지수(S&P500/Nasdaq/Dow) 전일 종가 및 등락률 조회."""
    for base in ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]:
        try:
            r = requests.get(
                f"{base}/v8/finance/chart/{symbol}",
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json",
                },
                timeout=8,
            )
            if not r.ok:
                continue
            result_list = (r.json().get("chart") or {}).get("result")
            if not result_list:
                continue
            meta = result_list[0].get("meta", {})
            price = float(meta.get("regularMarketPrice") or meta.get("previousClose") or 0)
            prev = float(meta.get("previousClose") or meta.get("chartPreviousClose") or 0)
            if price > 0 and prev > 0:
                change_val = round(price - prev, 2)
                change_rate = round(change_val / prev * 100, 2)
                print(f"[Macro] {label} OK: {price} ({change_rate:+.2f}%)", flush=True)
                return {
                    "price": round(price, 2),
                    "change_val": change_val,
                    "change_rate": change_rate,
                    "positive": change_val >= 0,
                }
        except Exception as e:
            print(f"[Macro] {label} {base} error: {e}", flush=True)
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


def _signal(value: float, good_below: float | None, bad_above: float | None) -> str:
    """값이 낮을수록 좋은 지표(실업률·실업수당)용 신호 판정."""
    if good_below is not None and value <= good_below:
        return "호재"
    if bad_above is not None and value >= bad_above:
        return "악재"
    return "중립"


def _signal_high(value: float, good_above: float, bad_below: float) -> str:
    """값이 높을수록 좋은 지표(고용 증가)용 신호 판정."""
    if value >= good_above:
        return "호재"
    if value <= bad_below:
        return "악재"
    return "중립"


def _fred_series_n(series_id: str, n: int = 2) -> list[float]:
    """FRED에서 최신 n개 관측값 반환."""
    if not settings.FRED_API_KEY:
        return []
    try:
        r = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": series_id,
                "api_key": settings.FRED_API_KEY,
                "file_type": "json",
                "sort_order": "desc",
                "limit": n,
            },
            timeout=8,
        )
        if r.ok:
            return [
                float(o["value"])
                for o in r.json().get("observations", [])
                if o.get("value") not in (".", None, "")
            ]
    except Exception:
        pass
    return []


def _us_employment() -> dict:
    """미국 고용지표 3종: 실업률·비농업고용변화·신규실업수당."""
    result = {}

    # 실업률 (UNRATE, %)
    vals = _fred_series_n("UNRATE", 1)
    if vals:
        v = round(vals[0], 1)
        result["us_unemployment"] = {
            "label": "미국 실업률", "value": v, "unit": "%",
            "signal": _signal(v, good_below=4.0, bad_above=5.5),
        }

    # 비농업고용 전월대비 변화 (PAYEMS, 천 명)
    vals = _fred_series_n("PAYEMS", 2)
    if len(vals) >= 2:
        change = round(vals[0] - vals[1], 0)
        result["us_nonfarm_payrolls"] = {
            "label": "미국 비농업고용", "value": change, "unit": "K",
            "signal": _signal_high(change, good_above=200, bad_below=50),
        }

    # 신규 실업수당 청구 (ICSA, 명 → 천 명으로 표시)
    vals = _fred_series_n("ICSA", 1)
    if vals:
        v = round(vals[0] / 1000, 1)
        result["us_initial_claims"] = {
            "label": "미국 신규실업수당", "value": v, "unit": "K",
            "signal": _signal(v * 1000, good_below=250_000, bad_above=400_000),
        }

    return result


def _kr_unemployment() -> dict | None:
    """한국 실업률 (ECOS 경제활동인구조사)."""
    if not settings.ECOS_API_KEY:
        return None
    try:
        today = datetime.date.today()
        start = (today.replace(day=1) - datetime.timedelta(days=90)).strftime("%Y%m")
        end = today.strftime("%Y%m")
        # 901Y025: 경제활동인구조사 주요지표, 0102000: 실업률(계절조정)
        url = (
            f"https://ecos.bok.or.kr/api/StatisticSearch"
            f"/{settings.ECOS_API_KEY}/json/kr/1/3/901Y025/M/{start}/{end}/0102000"
        )
        r = requests.get(url, timeout=8)
        if r.ok:
            rows = r.json().get("StatisticSearch", {}).get("row", [])
            rows = [row for row in rows if row.get("DATA_VALUE") not in (None, "", " ")]
            if rows:
                v = round(float(rows[-1]["DATA_VALUE"]), 1)
                return {
                    "label": "한국 실업률", "value": v, "unit": "%",
                    "signal": _signal(v, good_below=3.0, bad_above=4.5),
                }
    except Exception as e:
        print(f"[Macro] KR unemployment error: {e}", flush=True)
    return None


def _get_slow_data() -> dict:
    """금리·CPI·고용 등 저빈도 변동 데이터를 24시간 캐시로 반환."""
    global _SLOW_CACHE, _SLOW_CACHE_TIME

    now = datetime.datetime.now()
    if (
        _SLOW_CACHE is not None
        and _SLOW_CACHE_TIME is not None
        and (now - _SLOW_CACHE_TIME).total_seconds() < _SLOW_TTL_SECONDS
    ):
        print("[Macro] slow data cache hit", flush=True)
        return _SLOW_CACHE

    slow: dict = {}

    policy_rate = _ecos_policy_rate()
    if policy_rate is not None:
        slow["policy_rate"] = policy_rate

    inflation_yoy = _ecos_cpi_yoy()
    if inflation_yoy is not None:
        slow["inflation_yoy"] = inflation_yoy

    fed_funds = _fred_series("FEDFUNDS")
    if fed_funds is not None:
        slow["fed_funds_rate"] = fed_funds

    us_10y = _fred_series("DGS10")
    if us_10y is not None:
        slow["us_10y_yield"] = us_10y

    employment: dict = {}
    us_emp = _us_employment()
    employment.update(us_emp)
    kr_unemp = _kr_unemployment()
    if kr_unemp:
        employment["kr_unemployment"] = kr_unemp
    if employment:
        slow["employment"] = employment

    if slow:
        _SLOW_CACHE = slow
        _SLOW_CACHE_TIME = now
        print(f"[Macro] slow data cached at {now.strftime('%H:%M:%S')} (next refresh in 24h)", flush=True)

    return _SLOW_CACHE or slow


def get_macro_snapshot() -> dict:
    result: dict = {}

    # 실시간 데이터: 매 호출마다 갱신
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

    sp500 = _yahoo_us_index("^GSPC", "S&P500")
    if sp500:
        result["sp500"] = sp500

    nasdaq = _yahoo_us_index("^IXIC", "Nasdaq")
    if nasdaq:
        result["nasdaq"] = nasdaq

    dji = _yahoo_us_index("^DJI", "Dow Jones")
    if dji:
        result["dji"] = dji

    vix = _yahoo_us_index("^VIX", "VIX")
    if vix:
        result["vix"] = vix

    vkospi = _get_vkospi()
    if vkospi:
        result["vkospi"] = vkospi

    # 저빈도 데이터: 24시간 캐시 (금리·CPI·고용)
    result.update(_get_slow_data())

    return result
