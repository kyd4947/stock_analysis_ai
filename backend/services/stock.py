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

    return result


def get_naver_financials(ticker: str) -> dict:
    """NAVER Finance에서 PER/PBR/ROE/EPS/BPS 조회.
    yfinance가 한국 주식 재무지표를 누락할 때 사용하는 신뢰성 높은 폴백."""
    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/stock/{ticker}/basic",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=6,
        )
        if not r.ok:
            return {}
        data = r.json()

        def _parse(s) -> float | None:
            if s is None:
                return None
            try:
                cleaned = str(s).replace(",", "").replace("%", "").replace("배", "").strip()
                v = float(cleaned)
                return v if v > 0 else None
            except Exception:
                return None

        result: dict = {}
        for item in data.get("totalInfos", []):
            code = item.get("code", "")
            val = _parse(item.get("value"))
            if val is None:
                continue
            if code == "PER":
                result["per"] = round(val, 2)
            elif code == "PBR":
                result["pbr"] = round(val, 2)
            elif code == "ROE":
                result["roe"] = round(val, 2)
            elif code == "EPS":
                result["eps"] = val
            elif code == "BPS":
                result["bps"] = val

        return result
    except Exception:
        return {}
