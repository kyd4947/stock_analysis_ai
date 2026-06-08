"""
yfinance를 이용한 한국 주식 데이터 수집.
KOSPI 종목: {ticker}.KS, KOSDAQ 종목: {ticker}.KQ 순으로 시도.
PER/PBR가 yfinance에 없으면 NAVER Finance API로 보완.
"""
import requests
import yfinance as yf


def get_stock_data(ticker: str) -> dict:
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
    }

    for suffix in [".KS", ".KQ"]:
        try:
            t = yf.Ticker(f"{ticker}{suffix}")
            info = t.info
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            if not price:
                continue

            prev_close = info.get("regularMarketPreviousClose") or price
            change_val = price - prev_close
            change_rate = (change_val / prev_close * 100) if prev_close else 0.0

            roe_raw = info.get("returnOnEquity")
            roe = round(roe_raw * 100, 2) if roe_raw is not None else None

            per_raw = info.get("trailingPE")
            pbr_raw = info.get("priceToBook")

            result.update(
                {
                    "name": info.get("longName") or info.get("shortName") or ticker,
                    "price": round(price),
                    "change_rate": round(change_rate, 2),
                    "change_value": round(change_val),
                    "sector": info.get("sector") or info.get("industry"),
                    "per": round(per_raw, 2) if per_raw else None,
                    "pbr": round(pbr_raw, 2) if pbr_raw else None,
                    "roe": roe,
                }
            )
            return result
        except Exception:
            continue

    # yfinance 실패 시 NAVER Finance 모바일 API로 가격 조회
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/stock/{ticker}/basic",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=8,
        )
        if r.ok:
            data = r.json()
            price_str = str(data.get("closePrice") or "").replace(",", "")
            price = float(price_str) if price_str else None
            if price:
                change_str = str(data.get("compareToPreviousClosePrice") or "0").replace(",", "")
                change_val = float(change_str) if change_str else 0.0
                change_rate_str = str(data.get("fluctuationsRatio") or "0")
                change_rate = float(change_rate_str) if change_rate_str else 0.0
                result.update(
                    {
                        "name": data.get("stockName") or ticker,
                        "price": round(price),
                        "change_rate": round(change_rate, 2),
                        "change_value": round(change_val),
                        "sector": None,
                    }
                )
                return result
    except Exception:
        pass

    return result


def get_naver_financials(ticker: str) -> dict:
    """NAVER Finance에서 PER/PBR/EPS/BPS 스크래핑.
    finance.naver.com HTML의 id="_per", "_pbr", "_eps", "_bps" 요소를 파싱."""
    import re

    def _num(s: str) -> float | None:
        if not s:
            return None
        try:
            v = float(s.replace(",", "").strip())
            return v if v > 0 else None
        except Exception:
            return None

    # 1차: NAVER Finance 주식 메인 페이지 HTML 스크래핑
    try:
        r = requests.get(
            f"https://finance.naver.com/item/main.nhn?code={ticker}",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Referer": "https://finance.naver.com",
            },
            timeout=8,
        )
        if r.ok:
            r.encoding = "euc-kr"
            html = r.text
            result: dict = {}
            for field, eid in [("per", "_per"), ("pbr", "_pbr"), ("eps", "_eps"), ("bps", "_bps")]:
                m = re.search(rf'id="{eid}"[^>]*>([\d,\.]+)', html)
                if m:
                    v = _num(m.group(1))
                    if v is not None:
                        result[field] = round(v, 2)
            if result:
                return result
    except Exception:
        pass

    # 2차: NAVER 모바일 JSON API (totalInfos 구조 시도)
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/stock/{ticker}/basic",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=6,
        )
        if r.ok:
            data = r.json()
            result = {}
            for item in data.get("totalInfos", []):
                code = (item.get("code") or "").upper()
                val = _num(str(item.get("value") or "").replace("배", "").replace("%", ""))
                if val is None:
                    continue
                if code in ("PER",):
                    result["per"] = round(val, 2)
                elif code in ("PBR",):
                    result["pbr"] = round(val, 2)
                elif code in ("ROE",):
                    result["roe"] = round(val, 2)
                elif code in ("EPS",):
                    result["eps"] = val
                elif code in ("BPS",):
                    result["bps"] = val
            if result:
                return result
    except Exception:
        pass

    return {}
