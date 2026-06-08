"""
DART API 연동.
최초 호출 시 corp_code.zip을 내려받아 종목코드→corp_code 매핑을 캐싱.
다운로드 실패 시 하드코딩 주요 종목으로 폴백 (검색 즉시 동작).
"""
import io
import time
import zipfile
import xml.etree.ElementTree as ET
import datetime
import requests

from backend.core.config import settings

RISK_KEYWORDS = ("조사", "제재", "위반", "과징금", "고발", "검찰", "처벌", "과태료", "소송", "경고")

# DART 다운로드 실패 시 폴백용 하드코딩 주요 종목 (stock_code → {corp_code, name})
_FALLBACK_STOCKS: dict[str, dict] = {
    # KOSPI
    "005930": {"corp_code": "", "name": "삼성전자"},
    "000660": {"corp_code": "", "name": "SK하이닉스"},
    "207940": {"corp_code": "", "name": "삼성바이오로직스"},
    "373220": {"corp_code": "", "name": "LG에너지솔루션"},
    "005380": {"corp_code": "", "name": "현대자동차"},
    "068270": {"corp_code": "", "name": "셀트리온"},
    "005490": {"corp_code": "", "name": "POSCO홀딩스"},
    "000270": {"corp_code": "", "name": "기아"},
    "035720": {"corp_code": "", "name": "카카오"},
    "035420": {"corp_code": "", "name": "NAVER"},
    "006400": {"corp_code": "", "name": "삼성SDI"},
    "105560": {"corp_code": "", "name": "KB금융"},
    "055550": {"corp_code": "", "name": "신한지주"},
    "051910": {"corp_code": "", "name": "LG화학"},
    "352820": {"corp_code": "", "name": "하이브"},
    "012450": {"corp_code": "", "name": "한화에어로스페이스"},
    "028260": {"corp_code": "", "name": "삼성물산"},
    "086790": {"corp_code": "", "name": "하나금융지주"},
    "316140": {"corp_code": "", "name": "우리금융지주"},
    "096770": {"corp_code": "", "name": "SK이노베이션"},
    "010950": {"corp_code": "", "name": "S-Oil"},
    "033780": {"corp_code": "", "name": "KT&G"},
    "011170": {"corp_code": "", "name": "롯데케미칼"},
    "030200": {"corp_code": "", "name": "KT"},
    "017670": {"corp_code": "", "name": "SK텔레콤"},
    "066570": {"corp_code": "", "name": "LG전자"},
    "003550": {"corp_code": "", "name": "LG"},
    "097950": {"corp_code": "", "name": "CJ제일제당"},
    "259960": {"corp_code": "", "name": "크래프톤"},
    "034020": {"corp_code": "", "name": "두산에너빌리티"},
    "032830": {"corp_code": "", "name": "삼성생명"},
    "015760": {"corp_code": "", "name": "한국전력"},
    "012330": {"corp_code": "", "name": "현대모비스"},
    "010130": {"corp_code": "", "name": "고려아연"},
    "247540": {"corp_code": "", "name": "에코프로비엠"},
    "011200": {"corp_code": "", "name": "HMM"},
    "004020": {"corp_code": "", "name": "현대제철"},
    "003490": {"corp_code": "", "name": "대한항공"},
    "028050": {"corp_code": "", "name": "삼성엔지니어링"},
    "000720": {"corp_code": "", "name": "현대건설"},
    "023530": {"corp_code": "", "name": "롯데쇼핑"},
    "011790": {"corp_code": "", "name": "SKC"},
    "000100": {"corp_code": "", "name": "유한양행"},
    "293490": {"corp_code": "", "name": "카카오뱅크"},
    "323410": {"corp_code": "", "name": "카카오페이"},
    "251270": {"corp_code": "", "name": "넷마블"},
    "036570": {"corp_code": "", "name": "엔씨소프트"},
    "034730": {"corp_code": "", "name": "SK"},
    "018260": {"corp_code": "", "name": "삼성SDS"},
    "008770": {"corp_code": "", "name": "호텔신라"},
    "078930": {"corp_code": "", "name": "GS"},
    "071050": {"corp_code": "", "name": "한국금융지주"},
    "024110": {"corp_code": "", "name": "IBK기업은행"},
    "139480": {"corp_code": "", "name": "이마트"},
    "042660": {"corp_code": "", "name": "한화오션"},
    "009150": {"corp_code": "", "name": "삼성전기"},
    "016360": {"corp_code": "", "name": "삼성증권"},
    "010140": {"corp_code": "", "name": "삼성중공업"},
    "161390": {"corp_code": "", "name": "한국타이어앤테크놀로지"},
    "011780": {"corp_code": "", "name": "금호석유화학"},
    "047050": {"corp_code": "", "name": "포스코인터내셔널"},
    "005830": {"corp_code": "", "name": "DB손해보험"},
    "032640": {"corp_code": "", "name": "LG유플러스"},
    "000810": {"corp_code": "", "name": "삼성화재"},
    "267260": {"corp_code": "", "name": "현대글로비스"},
    "088350": {"corp_code": "", "name": "한화생명"},
    "009540": {"corp_code": "", "name": "HD현대중공업"},
    "329180": {"corp_code": "", "name": "HD현대"},
    "241560": {"corp_code": "", "name": "두산밥캣"},
    "180640": {"corp_code": "", "name": "한진칼"},
    "128940": {"corp_code": "", "name": "한미약품"},
    "069620": {"corp_code": "", "name": "대웅제약"},
    "001040": {"corp_code": "", "name": "CJ"},
    "006800": {"corp_code": "", "name": "미래에셋증권"},
    "003600": {"corp_code": "", "name": "SK케미칼"},
    "010600": {"corp_code": "", "name": "현대미포조선"},
    "005945": {"corp_code": "", "name": "NH투자증권"},
    "008930": {"corp_code": "", "name": "한미사이언스"},
    "267250": {"corp_code": "", "name": "HD현대오일뱅크"},
    "000210": {"corp_code": "", "name": "DL"},
    # KOSDAQ
    "086520": {"corp_code": "", "name": "에코프로"},
    "145020": {"corp_code": "", "name": "휴젤"},
    "058470": {"corp_code": "", "name": "리노공업"},
    "357780": {"corp_code": "", "name": "솔브레인"},
    "263750": {"corp_code": "", "name": "펄어비스"},
    "112040": {"corp_code": "", "name": "위메이드"},
    "347860": {"corp_code": "", "name": "알테오젠"},
    "067160": {"corp_code": "", "name": "SOOP"},
    "293480": {"corp_code": "", "name": "카카오게임즈"},
    "302440": {"corp_code": "", "name": "SK바이오사이언스"},
    "253450": {"corp_code": "", "name": "스튜디오드래곤"},
    "122870": {"corp_code": "", "name": "와이지엔터테인먼트"},
    "041510": {"corp_code": "", "name": "에스엠"},
    "035900": {"corp_code": "", "name": "JYP Ent."},
    "288295": {"corp_code": "", "name": "레인보우로보틱스"},
    "214150": {"corp_code": "", "name": "클래시스"},
    "196300": {"corp_code": "", "name": "셀트리온제약"},
    "091990": {"corp_code": "", "name": "셀트리온헬스케어"},
    "403870": {"corp_code": "", "name": "HPSP"},
    "039030": {"corp_code": "", "name": "이오테크닉스"},
    "237690": {"corp_code": "", "name": "에스티팜"},
    "402340": {"corp_code": "", "name": "SK스퀘어"},
    "215000": {"corp_code": "", "name": "골프존"},
}

# 모듈 레벨 캐시 (lru_cache 대신 사용 - 빈 결과 캐싱 방지)
_corp_info: dict[str, dict] = {}
_corp_info_loaded = False
_corp_info_last_attempt = 0.0


def _corp_info_map() -> dict[str, dict]:
    """DART corp_code.zip → stock_code:{corp_code,name} 매핑. 실패 시 폴백 반환."""
    global _corp_info, _corp_info_loaded, _corp_info_last_attempt

    if _corp_info_loaded:
        return _corp_info

    now = time.time()
    # 이미 폴백 데이터라도 있고 5분 이내 재시도면 그대로 반환
    if _corp_info and (now - _corp_info_last_attempt) < 300:
        return _corp_info

    _corp_info_last_attempt = now
    result: dict[str, dict] = dict(_FALLBACK_STOCKS)

    if settings.DART_API_KEY:
        try:
            r = requests.get(
                "https://opendart.fss.or.kr/api/corpCode.zip",
                params={"crtfc_key": settings.DART_API_KEY},
                timeout=60,
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
            if mapping:
                result.update(mapping)
                _corp_info_loaded = True  # 성공 시에만 완전 로드 표시
        except Exception:
            pass
    else:
        _corp_info_loaded = True  # API 키 없으면 재시도 불필요

    _corp_info = result
    return _corp_info


def _corp_code_map() -> dict[str, str]:
    return {k: v["corp_code"] for k, v in _corp_info_map().items()}


def _get_corp_code(ticker: str) -> str | None:
    code = _corp_code_map().get(ticker)
    return code if code else None


def name_to_ticker(name: str) -> str | None:
    """종목명 → 티커 코드 변환 (정확한 이름 매칭 우선, 그 다음 포함 검색)."""
    q = name.strip().lower()
    if not q:
        return None
    # 1차: 정확한 이름 매칭
    for stock_code, info in _corp_info_map().items():
        if info.get("name", "").lower() == q:
            return stock_code
    # 2차: 포함 검색 (가장 짧은 이름 우선 - 더 정확할 가능성)
    candidates = [
        (stock_code, info["name"])
        for stock_code, info in _corp_info_map().items()
        if q in info.get("name", "").lower()
    ]
    if candidates:
        candidates.sort(key=lambda x: len(x[1]))
        return candidates[0][0]
    return None


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
