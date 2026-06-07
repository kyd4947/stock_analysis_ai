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
def _corp_code_map() -> dict[str, str]:
    """DART corp_code.zip을 한 번만 내려받아 stock_code → corp_code 매핑을 반환."""
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
        mapping: dict[str, str] = {}
        for item in tree.getroot().findall("list"):
            stock_code = (item.findtext("stock_code") or "").strip()
            corp_code = (item.findtext("corp_code") or "").strip()
            if stock_code:
                mapping[stock_code] = corp_code
        return mapping
    except Exception:
        return {}


def _get_corp_code(ticker: str) -> str | None:
    return _corp_code_map().get(ticker)


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
