"""
NAVER Finance 모바일 API를 이용한 한국 주식 실시간 데이터 수집.
전 종목(KOSPI/KOSDAQ) 지원, API 키 불필요, 실시간 가격.
재무지표(PER/PBR/ROE)는 totalInfos에서 가져오며, DART에서 EPS/BPS로 계산한 값으로 보완.
"""
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


def get_stock_data(ticker: str) -> dict:
    """NAVER Finance 모바일 API로 실시간 주가 및 재무지표 조회."""
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

    try:
        r = requests.get(
            f"https://m.stock.naver.com/api/stock/{ticker}/basic",
            headers=_NAVER_HEADERS,
            timeout=8,
        )
        if not r.ok:
            return result
        data = r.json()

        price = _num(data.get("closePrice"))
        if not price:
            return result

        result.update(
            {
                "name": data.get("stockName") or ticker,
                "price": round(price),
                "change_rate": round(_signed(data.get("fluctuationsRatio")) or 0.0, 2),
                "change_value": round(_signed(data.get("compareToPreviousClosePrice")) or 0.0),
            }
        )

        # totalInfos에서 PER/PBR/ROE 추출
        for item in data.get("totalInfos", []):
            code = (item.get("code") or "").upper()
            raw = str(item.get("value") or "").replace("배", "").replace("%", "")
            val = _num(raw)
            if val is None:
                continue
            if code == "PER":
                result["per"] = round(val, 2)
            elif code == "PBR":
                result["pbr"] = round(val, 2)
            elif code == "ROE":
                result["roe"] = round(val, 2)

    except Exception:
        pass

    return result


def get_naver_financials(ticker: str) -> dict:
    """NAVER Finance HTML에서 PER/PBR/EPS/BPS 스크래핑 (DART 없을 때 보완용)."""
    import re

    def _num_pos(s: str) -> float | None:
        if not s:
            return None
        try:
            v = float(s.replace(",", "").strip())
            return v if v > 0 else None
        except Exception:
            return None

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
                    v = _num_pos(m.group(1))
                    if v is not None:
                        result[field] = round(v, 2)
            if result:
                return result
    except Exception:
        pass

    return {}
