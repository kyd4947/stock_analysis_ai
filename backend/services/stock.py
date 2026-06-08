"""
yfinance를 이용한 한국 주식 데이터 수집.
KOSPI 종목: {ticker}.KS, KOSDAQ 종목: {ticker}.KQ 순으로 시도.
"""
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
