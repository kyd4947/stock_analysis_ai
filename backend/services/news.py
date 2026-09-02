"""
뉴스 수집.
- 구글 뉴스 RSS: API 키 불필요, 실시간 한국어 경제/종목 뉴스
- NAVER Finance JSON: NAVER 시장 뉴스 (API 키 불필요)
- 연합뉴스 RSS: 경제 섹션 (API 키 불필요)
- NewsAPI.org: NEWS_API_KEY 설정 시 보완용

시장 뉴스는 오늘(KST) 날짜 기사만 반환. 없을 경우 최근 1일 이내로 확장.
"""
import datetime
import zoneinfo
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import requests
from backend.core.config import settings

# 차단할 TLD — 한국 금융 뉴스와 무관한 스팸성 도메인에 주로 사용됨
_SPAM_TLDS = frozenset([
    ".ru", ".xyz", ".info", ".tk", ".ml", ".ga", ".cf",
    ".pw", ".top", ".click", ".link", ".win", ".bid", ".loan",
])

# 제목에 이 키워드가 포함되면 스팸/도박 콘텐츠로 간주
_SPAM_TITLE_KEYWORDS = frozenset([
    "슬롯", "카지노", "바카라", "도박", "베팅", "토토", "먹튀",
    "온라인카지노", "casino", "slot", "poker", "betting",
    # 불법 리딩방 / 투자 사기성 콘텐츠
    "리딩방", "수익보장", "확정수익", "원금보장", "무료체험", "카톡방",
    "텔레그램방", "오픈채팅", "종목방", "매매방", "단타방", "수익인증",
    "따라만 하세요", "벌어드립니다", "무료로 시작", "클릭만 하면",
])


def _is_spam(article: dict) -> bool:
    """스팸·도박 기사 감지: URL TLD + 제목 키워드 이중 필터."""
    url = article.get("url", "")
    title = article.get("title", "").lower()

    # 제목 키워드 필터
    for kw in _SPAM_TITLE_KEYWORDS:
        if kw in title:
            return True

    # URL TLD 필터
    try:
        hostname = urlparse(url).hostname or ""
        for tld in _SPAM_TLDS:
            if hostname.endswith(tld):
                return True
    except Exception:
        pass

    return False

_KST = zoneinfo.ZoneInfo("Asia/Seoul")

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}


# ── 날짜 파싱 ──────────────────────────────────────────────────────────────────

def _parse_pub_date(pub_str: str) -> datetime.datetime | None:
    """RFC 2822(RSS) 또는 NAVER 날짜 문자열 → timezone-aware datetime."""
    if not pub_str:
        return None
    try:
        return parsedate_to_datetime(pub_str)
    except Exception:
        pass
    try:
        fmt = "%Y-%m-%d %H:%M:%S" if len(pub_str) > 10 else "%Y-%m-%d"
        return datetime.datetime.strptime(pub_str[:19], fmt).replace(tzinfo=_KST)
    except Exception:
        pass
    return None


def _today_kst() -> datetime.date:
    return datetime.datetime.now(_KST).date()


def _filter_by_date(articles: list[dict], max_days: int) -> list[dict]:
    """KST 기준 max_days일 이내 기사만 반환. 날짜 파싱 불가 기사는 제외."""
    cutoff = _today_kst() - datetime.timedelta(days=max_days - 1)
    result = []
    for a in articles:
        dt = _parse_pub_date(a.get("publishedAt", ""))
        if dt is not None and dt.astimezone(_KST).date() >= cutoff:
            result.append(a)
    return result


def _sort_by_date(articles: list[dict]) -> list[dict]:
    """publishedAt 기준 최신순 정렬."""
    def _key(a):
        dt = _parse_pub_date(a.get("publishedAt", ""))
        return dt if dt else datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
    return sorted(articles, key=_key, reverse=True)


# ── RSS 파싱 ───────────────────────────────────────────────────────────────────

def _parse_rss(content: bytes) -> list[dict]:
    """RSS 2.0 XML → {title, url, source, publishedAt} 목록."""
    try:
        root = ET.fromstring(content)
        result = []
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            if not link:
                guid = item.findtext("guid") or ""
                if guid.strip().startswith("http"):
                    link = guid.strip()
            source_el = item.find("source")
            source = (source_el.text if source_el is not None else "").strip()
            pub = (item.findtext("pubDate") or "").strip()
            article = {"title": title, "url": link, "source": source, "publishedAt": pub}
            if title and link and "[Removed]" not in title and not _is_spam(article):
                result.append(article)
        return result
    except Exception as e:
        print(f"[News] RSS parse error: {e}", flush=True)
        return []


# ── 소스별 수집 ────────────────────────────────────────────────────────────────

def _google_news_rss(query: str, limit: int = 20) -> list[dict]:
    """구글 뉴스 RSS. when:1d 파라미터로 24시간 내 기사만 요청."""
    try:
        r = requests.get(
            "https://news.google.com/rss/search",
            params={"q": f"{query} when:1d", "hl": "ko", "gl": "KR", "ceid": "KR:ko"},
            headers=_HEADERS,
            timeout=8,
        )
        if r.ok:
            items = _parse_rss(r.content)[:limit]
            if items:
                return items
            print(f"[News] Google RSS 0 items: {query}", flush=True)
        else:
            print(f"[News] Google RSS {r.status_code}: {query}", flush=True)
    except Exception as e:
        print(f"[News] Google RSS exception: {e}", flush=True)
    return []


def _yonhap_rss(limit: int = 20) -> list[dict]:
    """연합뉴스 경제 RSS."""
    try:
        r = requests.get("https://www.yna.co.kr/rss/economy.xml", headers=_HEADERS, timeout=8)
        if r.ok:
            return _parse_rss(r.content)[:limit]
    except Exception as e:
        print(f"[News] Yonhap RSS exception: {e}", flush=True)
    return []


def _naver_finance_market_news(limit: int = 20) -> list[dict]:
    """NAVER Finance 시장 뉴스 JSON API."""
    try:
        r = requests.get(
            "https://m.stock.naver.com/api/news/market/today",
            params={"page": 1, "pageSize": limit},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://m.stock.naver.com/",
            },
            timeout=8,
        )
        if r.ok:
            data = r.json()
            articles = data.get("articleList") or data.get("list") or []
            result = []
            for a in articles[:limit]:
                title = (a.get("title") or "").strip()
                office_id = a.get("officeId") or ""
                article_id = a.get("articleId") or ""
                if title and office_id and article_id:
                    result.append({
                        "title": title,
                        "url": f"https://n.news.naver.com/article/{office_id}/{article_id}",
                        "source": a.get("officeName") or "",
                        "publishedAt": a.get("wrtDt") or "",
                    })
            if result:
                return result
    except Exception as e:
        print(f"[News] NAVER finance news exception: {e}", flush=True)
    return []


# ── 날짜 필터 적용 헬퍼 ────────────────────────────────────────────────────────

def _pick_today(candidates: list[dict], limit: int) -> list[dict]:
    """
    오늘(KST) 기사 우선 반환.
    오늘 기사가 2개 미만이면 최근 2일로 확장.
    날짜 파싱 가능한 기사만 포함, 최신순 정렬.
    """
    today = _filter_by_date(candidates, max_days=1)
    if len(today) >= 2:
        return _sort_by_date(today)[:limit]
    # 오늘 기사가 부족하면 2일 이내로 확장
    recent = _filter_by_date(candidates, max_days=2)
    if recent:
        return _sort_by_date(recent)[:limit]
    # 날짜 필터 통과 기사가 없으면 빈 목록 반환 (frontend fallback 허용)
    return []


# ── 공개 API ───────────────────────────────────────────────────────────────────

# 한자 축약 표기 (언론 헤드라인에서 자주 사용).
# 예: "HD현대중공업" → "HD현대重", "삼성전자" → "삼성電"
_HANJA_ABBREV: dict[str, str] = {
    "중공업": "重",
    "전자": "電",
    "철강": "鐵",
    "화학": "化",
    "지주": "持",
    "건설": "建",
    "해양": "海",
    "조선": "造",
    "산업": "産",
    "물산": "物",
    "제약": "藥",
    "생명": "命",
    "금융": "金",
    "투자": "投",
    "증권": "證",
    "은행": "銀",
    "보험": "保",
    "자동차": "車",
    "정유": "油",
    "석유": "油",
    "통신": "信",
    "기계": "機",
    "전기": "電",
    "전선": "線",
    "소재": "材",
    "개발": "開",
}

# 한/영 별칭: 검색 종목명과 언론 표기가 다른 경우 대응.
_NAME_ALIASES: dict[str, list[str]] = {
    "NAVER": ["네이버"],
    "네이버": ["NAVER"],
    "S-Oil": ["에쓰오일"],
    "삼성바이오로직스": ["삼성바이오"],
    "HD현대중공업": ["현대중공업"],
}

# 원문 종목명에서 파생되는 표기 변형 목록을 생성.
# - 한자 축약: "HD현대중공업" → "HD현대重"
# - 별칭: "NAVER" → "네이버"
def _name_variants(name: str) -> list[str]:
    variants: list[str] = []
    if not name:
        return variants
    variants.append(name)
    lowered = name.lower()
    # 별칭 추가
    for key, alias_list in _NAME_ALIASES.items():
        if key.lower() == lowered:
            variants.extend(alias_list)
    # 한자 축약: 뒤에서부터 매칭되는 도메인 단어를 한자로 치환
    hanja_variant = name
    replaced = False
    for kor, hanja in _HANJA_ABBREV.items():
        if kor != hanja and kor in hanja_variant:
            hanja_variant = hanja_variant.replace(kor, hanja)
            replaced = True
    if replaced and hanja_variant != name:
        variants.append(hanja_variant)
    # 중복 제거
    seen = set()
    unique = []
    for v in variants:
        if v and v not in seen:
            seen.add(v)
            unique.append(v)
    return unique


def get_stock_news(ticker: str, company_name: str = "") -> list[dict]:
    """종목 뉴스. 제목(출처 표기 제외)에 종목명/티커가 포함된 기사만 반환.

    - 검색 쿼리는 종목명과 그 변형(한자 축약·한/영 별칭)만 사용한다.
      '주가 주식'을 덧붙이면 파업·수주·공시처럼 제목에 '주가'가 없는
      종목 뉴스가 누락되므로 붙이지 않는다.
    - 관련 기사가 없으면 빈 목록을 반환한다 (다른 종목 기사를 대신 노출하지 않음).
    """
    query = company_name or ticker
    variants = _name_variants(query)
    search_query = " OR ".join(variants) if variants else query
    articles = _google_news_rss(search_query, limit=20)
    if articles:
        filtered = _filter_by_relevance(articles, ticker, company_name)
        if filtered:
            return _sort_by_date(filtered)[:5]

    key = settings.NEWS_API_KEY
    if key:
        try:
            r = requests.get(
                "https://newsapi.org/v2/everything",
                params={"q": query, "language": "ko", "sortBy": "publishedAt", "pageSize": 10, "apiKey": key},
                timeout=8,
            )
            if r.ok and r.json().get("status") == "ok":
                all_articles = [
                    {"title": a.get("title", ""), "url": a.get("url", ""), "source": a.get("source", {}).get("name", "")}
                    for a in r.json().get("articles", [])
                    if a.get("title") and "[Removed]" not in a.get("title", "")
                ]
                filtered = _filter_by_relevance(all_articles, ticker, company_name)
                if filtered:
                    return filtered[:5]
        except Exception:
            pass
    return []


# 종목명이 '네이버프리미엄'처럼 뉴스 플랫폼/서비스명의 일부로 쓰이는 접미사.
# 검색 종목명이 제목에서 이 단어와 결합해 '출처'로만 등장하면 다른 종목 기사일 가능성이 높다.
_PLATFORM_SUFFIXES = frozenset([
    "프리미엄", "뉴스", "블로그", "카페", "증권", "경제", "부동산",
    "엔터", "스포츠", "아트", "스타일", "쇼핑", "뷰",
])

# 출처명이 종목명과 겹치는 대표 자사 미디어.
# 예: NAVER 종목 검색 시 '네이버 프리미엄콘텐츠'/'blog.naver.com'의 타종목 분석 기사가
# 출처명에 '네이버'가 포함된다는 이유만으로 관련 기사로 오판되는 것을 방지한다.
_PLATFORM_SOURCE_MARKERS = frozenset([
    "네이버 프리미엄콘텐츠", "네이버 블로그", "blog.naver.com", "네이버 프리미엄",
    "kb think", "kb씽크", "네이버프리미엄콘텐츠",
])


def _strip_source_suffix(title: str, source: str) -> str:
    """RSS 제목에서 ' - 출처' / ' : 출처' 꼬리와 플랫폼 꼬리를 제거한 순수 헤드라인 반환.

    Google News RSS 제목 형식은 "헤드라인 - 출처명"이며, 블로그 계열은
    "헤드라인 : 네이버 블로그 - blog.naver.com"처럼 꼬리가 이중으로 붙는다.
    출처명에 종목명(예: '네이버')이 포함된 경우 관련성 오판의 원인이 되므로
    제목에서 출처 부분을 떼어내고 헤드라인만으로 판정한다.
    """
    t = title
    src = (source or "").strip()
    if src:
        # "헤드라인 - 출처" / "헤드라인 : 출처" 제거 (마지막 등장 위치 기준)
        for sep in (" - ", " : ", " | "):
            idx = t.rfind(f"{sep}{src}")
            if idx > 0:
                t = t[:idx]
                break
        # "네이버 블로그 - blog.naver.com" 같은 이중 꼬리 제거
        for marker in _PLATFORM_SOURCE_MARKERS:
            marker_low = marker.lower()
            for sep in (" - ", " : ", " | "):
                idx = t.lower().rfind(f"{sep}{marker_low}")
                if idx > 0:
                    t = t[:idx]
    return t.strip()


def _is_platform_source(source: str) -> bool:
    """출처 자체가 종목명과 겹치는 자사/플랫폼 미디어인지 확인."""
    src = (source or "").lower()
    if not src:
        return False
    return any(marker in src for marker in _PLATFORM_SOURCE_MARKERS)


def _is_platform_context(title: str, company_name: str) -> bool:
    """회사명이 제목에서 '네이버프리미엄'처럼 플랫폼 출처로만 쓰였는지 확인."""
    name = (company_name or "").lower()
    if not name:
        return False
    for suffix in _PLATFORM_SUFFIXES:
        if f"{name}{suffix}" in title:
            return True
    return False

# 제목에 포함되면 '다른 종목에 관한 기사'로 보는 주요 종목명.
# 자체 플랫폼 기사(예: 네이버프리미엄의 SK하이닉스 분석)를 걸러내기 위한 참고 목록.
_OTHER_STOCK_NAMES = frozenset([
    "삼성전자", "SK하이닉스", "하이닉스", "카카오", "카카오뱅크", "셀트리온",
    "LG에너지솔루션", "현대차", "기아", "포스코", "LG화학", "삼성바이오",
    "NAVER", "네이버", "KB금융", "신한지주", "하나금융", "우리금융",
    "삼성전우", "현대모비스", "셀트리온헬스케어", "삼성물산", "LG전자",
])


def _is_platform_context(title: str, company_name: str) -> bool:
    """회사명이 제목에서 '네이버프리미엄'처럼 플랫폼 출처로만 쓰였는지 확인."""
    name = (company_name or "").lower()
    if not name:
        return False
    for suffix in _PLATFORM_SUFFIXES:
        if f"{name}{suffix}" in title:
            return True
    return False


def _filter_by_relevance(articles: list[dict], ticker: str, company_name: str) -> list[dict]:
    """기사 제목에 종목명/티커가 포함된 기사만 필터링.

    - 매칭은 출처 표기(" - 출처명")를 제거한 순수 헤드라인 기준으로 한다.
      출처명에 종목명이 포함됨(예: '네이버 프리미엄콘텐츠', 'KB Think')만으로는
      관련 기사로 보지 않는다.
    - 한자 축약 표기(HD현대重)와 한/영 별칭(NAVER↔네이버)도 키워드로 인정.
    - 종목명이 '네이버프리미엄'처럼 플랫폼 출처로만 등장하고, 제목에 다른 종목명이
      보이면 다른 종목 기사로 판단해 제외한다.
    """
    keywords = set()
    if company_name:
        for v in _name_variants(company_name):
            keywords.add(v.lower())
    if ticker:
        keywords.add(ticker.lower())

    if not keywords:
        return articles

    # 다른 종목명 감지용: 키워드와 무관한 타 종목명은 그대로 사용
    other_names = [o for o in _OTHER_STOCK_NAMES if o.lower() not in keywords]

    result = []
    for a in articles:
        source = a.get("source") or ""
        headline = _strip_source_suffix(a.get("title") or "", source).lower()
        # 자사 플랫폼 출처 기사는 헤드라인에 종목명이 직접 언급될 때만 허용
        # (헤드라인 매칭 아래 단계에서 자연스럽게 처리됨)
        if not any(kw in headline for kw in keywords):
            continue
        # 플랫폼 출처 맥락 + 다른 종목명 → 다른 종목 기사로 간주
        if company_name and (_is_platform_context(headline, company_name) or _is_platform_source(source)):
            if any(other.lower() in headline for other in other_names):
                continue
        result.append(a)
    return result


def get_us_market_news(limit: int = 5) -> list[dict]:
    """미국 증시 관련 한국어 뉴스 (전날 미국 시장 동향)."""
    articles = _google_news_rss("미국증시 나스닥 뉴욕증시 S&P500 연준 when:1d", limit=15)
    if articles:
        return _sort_by_date(articles)[:limit]
    # fallback: 연합뉴스 경제에서 미국 관련 필터
    all_art = _yonhap_rss(limit=30)
    us_art = [a for a in all_art if any(kw in a.get("title", "") for kw in ["나스닥", "뉴욕", "미국", "다우", "S&P", "연준", "Fed"])]
    return _sort_by_date(us_art)[:limit]


def get_market_news() -> list[dict]:
    """한국 주식 시장 전반 뉴스. 오늘(KST) 기사 우선, 없으면 최근 2일."""
    all_candidates: list[dict] = []

    # 1차: 구글 뉴스 RSS (when:1d 파라미터 포함)
    all_candidates += _google_news_rss("코스피 코스닥 주식시장 경제", limit=20)

    # 1차에서 충분히 오늘 기사를 확보하면 조기 반환
    result = _pick_today(all_candidates, limit=6)
    if len(result) >= 3:
        return result

    # 2차: NAVER Finance 시장 뉴스
    all_candidates += _naver_finance_market_news(limit=20)
    result = _pick_today(all_candidates, limit=6)
    if len(result) >= 3:
        return result

    # 3차: 연합뉴스 경제 RSS
    all_candidates += _yonhap_rss(limit=20)
    result = _pick_today(all_candidates, limit=6)
    if result:
        return result

    # 4차: NewsAPI.org (키 있을 때만)
    key = settings.NEWS_API_KEY
    if key:
        try:
            r = requests.get(
                "https://newsapi.org/v2/everything",
                params={"q": "코스피 OR 코스닥 OR 한국증시", "language": "ko", "sortBy": "publishedAt", "pageSize": 20, "apiKey": key},
                timeout=8,
            )
            if r.ok and r.json().get("status") == "ok":
                for a in r.json().get("articles", []):
                    if a.get("title") and "[Removed]" not in a.get("title", ""):
                        all_candidates.append({"title": a["title"], "url": a.get("url", ""), "source": a.get("source", {}).get("name", ""), "publishedAt": a.get("publishedAt", "")})
        except Exception:
            pass
        result = _pick_today(all_candidates, limit=6)
        if result:
            return result

    return []


def get_us_stock_news(ticker: str, limit: int = 5) -> list[dict]:
    """미국 개별 종목 뉴스 — Google News RSS (영어)."""
    articles = []
    try:
        r = requests.get(
            "https://news.google.com/rss/search",
            params={"q": f"{ticker} stock when:1d", "hl": "en-US", "gl": "US", "ceid": "US:en"},
            headers=_HEADERS,
            timeout=8,
        )
        if r.ok:
            articles = _parse_rss(r.content)[:limit]
    except Exception as e:
        print(f"[News] US stock {ticker} error: {e}", flush=True)
    return _sort_by_date(articles)[:limit]
