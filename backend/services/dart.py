"""
DART API 연동.
최초 호출 시 corp_code.zip을 내려받아 종목코드→corp_code 매핑을 캐싱.
"""
import io
import zipfile
import xml.etree.ElementTree as ET
import datetime
import requests
from functools import lru_cache

from backend.core.config import settings

RISK_KEYWORDS = ("조사", "제재", "위반", "과징금", "고발", "검찰", "처벌", "과태료", "소송", "경고")


@lru_cache(maxsize=1)
def _corp_info_map() -> dict[str, dict]:
    """DART corp_code.zip을 한 번만 내려받아 stock_code → {corp_code, name} 매핑 반환."""
    if not settings.DART_API_KEY:
        return {}
    try:
        r = requests.get(
            "https://opendart.fss.or.kr/api/corpCode.zip",
            params={"crtfc_key": settings.DART_API_KEY},
            timeout=30,
        )
        r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            with z.open("CORPCODE.xml") as f:
                tree = ET.parse(f)
        mapping: dict[str, dict] = {}
        for item in tree.getroot().findall("list"):
            stock_code = (item.findtext("stock_code") or "").strip()
            corp_code = (item.findtext("corp_code") or "").strip()
            corp_name = (item.findtext("corp_name") or "").strip()
            if stock_code:
                mapping[stock_code] = {"corp_code": corp_code, "name": corp_name}
        return mapping
    except Exception:
        return {}


@lru_cache(maxsize=1)
def _corp_code_map() -> dict[str, str]:
    return {k: v["corp_code"] for k, v in _corp_info_map().items()}


def _get_corp_code(ticker: str) -> str | None:
    return _corp_code_map().get(ticker)


def search_stocks(query: str, limit: int = 10) -> list[dict]:
    """종목명 또는 티커 코드로 종목 검색. DART 전체 상장 종목 대상."""
    q = query.strip()
    if not q:
        return []
    q_lower = q.lower()
    results = []
    for stock_code, info in _corp_info_map().items():
        name = info.get("name", "")
        if stock_code == q.upper() or stock_code.startswith(q) or q_lower in name.lower():
            results.append({"ticker": stock_code, "name": name})

    def _rank(item: dict) -> tuple:
        t, n = item["ticker"], item["name"].lower()
        if t == q.upper():
            return (0, n)
        if t.startswith(q):
            return (1, n)
        return (2, n)

    results.sort(key=_rank)
    return results[:limit]


def get_dart_disclosures(ticker: str) -> dict:
    corp_code = _get_corp_code(ticker)
    risk_flags: list[str] = []
    highlights: list[str] = []

    if not corp_code:
        return {"risk_flags": risk_flags, "highlights": highlights}

    try:
        r = requests.get(
            "https://opendart.fss.or.kr/api/list.json",
            params={
                "crtfc_key": settings.DART_API_KEY,
                "corp_code": corp_code,
                "page_count": 10,
                "sort": "date",
                "sort_mth": "desc",
            },
            timeout=10,
        )
        if r.ok:
            data = r.json()
            if data.get("status") == "000":
                for item in data.get("list", [])[:8]:
                    title = item.get("report_nm", "")
                    if any(kw in title for kw in RISK_KEYWORDS):
                        risk_flags.append(title)
                    else:
                        highlights.append(title)
    except Exception:
        pass

    return {"risk_flags": risk_flags[:3], "highlights": highlights[:3]}


def get_dart_financials(ticker: str) -> dict:
    """DART 재무제표에서 ROE, EPS, BPS를 조회해 PER/PBR 계산에 활용."""
    corp_code = _get_corp_code(ticker)
    if not corp_code or not settings.DART_API_KEY:
        return {}

    year = datetime.date.today().year - 1
    data = None
    for reprt_code in ["11011", "11014", "11013"]:  # 연간 → Q3 → Q2 순 fallback
        try:
            r = requests.get(
                "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json",
                params={
                    "crtfc_key": settings.DART_API_KEY,
                    "corp_code": corp_code,
                    "bsns_year": str(year),
                    "reprt_code": reprt_code,
                    "fs_div": "CFS",
                },
                timeout=15,
            )
            if r.ok:
                d = r.json()
                if d.get("status") == "000" and d.get("list"):
                    data = d
                    break
        except Exception:
            continue

    if not data:
        return {}

    net_income = equity = eps = bps = None
    for item in data.get("list", []):
        nm = item.get("account_nm", "").strip()
        raw = (item.get("thstrm_amount") or "").replace(",", "").strip()
        try:
            val = float(raw)
        except ValueError:
            continue

        if nm in ("당기순이익", "분기순이익") and net_income is None:
            net_income = val
        elif nm in ("자본총계", "자본") and equity is None:
            equity = val
        elif ("기본주당순이익" in nm or nm == "주당순이익") and eps is None:
            eps = val
        elif "주당순자산" in nm and bps is None:
            bps = val

    result: dict = {}
    if net_income is not None and equity and equity > 0:
        result["roe"] = round(net_income / equity * 100, 2)
    if eps is not None:
        result["eps"] = eps
    if bps is not None and bps > 0:
        result["bps"] = bps
    return result


def get_shareholders(ticker: str) -> list[dict]:
    corp_code = _get_corp_code(ticker)
    if not corp_code:
        return []

    try:
        year = datetime.date.today().year - 1
        r = requests.get(
            "https://opendart.fss.or.kr/api/elestock.json",
            params={
                "crtfc_key": settings.DART_API_KEY,
                "corp_code": corp_code,
                "bsns_year": str(year),
                "reprt_code": "11011",
            },
            timeout=10,
        )
        if r.ok:
            data = r.json()
            if data.get("status") == "000":
                return [
                    {"name": item.get("nm", ""), "share": item.get("stkqy_irds", "")}
                    for item in data.get("list", [])[:5]
                ]
    except Exception:
        pass

    return []
