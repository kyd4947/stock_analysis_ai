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
        "eps": None,
        "bps": None,
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

        # closePrice 우선, 없으면 다른 필드 시도
        price = (
            _num(data.get("closePrice"))
            or _num(data.get("currentPrice"))
            or _num(data.get("tradePrice"))
            or _num(data.get("nv"))
        )
        # 이름은 가격과 무관하게 저장 (유효 티커 판별에 사용)
        name_val = data.get("stockName") or data.get("symbolCode")
        if name_val:
            result["name"] = name_val

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

        # /finance/annual 에서 PER/PBR/ROE/EPS/BPS 추출 (totalInfos 대체)
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
                # 가장 최근 실적 기간 key (비컨센서스)
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

    except Exception:
        pass

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
