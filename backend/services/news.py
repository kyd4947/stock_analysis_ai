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

import requests
from backend.core.config import settings

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
            if title and link and "[Removed]" not in title:
                result.append({"title": title, "url": link, "source": source, "publishedAt": pub})
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

def get_stock_news(ticker: str, company_name: str = "") -> list[dict]:
    """종목 뉴스. 날짜 필터 없이 최신 기사 반환."""
    query = company_name or ticker
    articles = _google_news_rss(f"{query} 주가 주식", limit=10)
    if articles:
        return _sort_by_date(articles)[:5]

    key = settings.NEWS_API_KEY
    if not key:
        return []
    try:
        r = requests.get(
            "https://newsapi.org/v2/everything",
            params={"q": query, "language": "ko", "sortBy": "publishedAt", "pageSize": 5, "apiKey": key},
            timeout=8,
        )
        if r.ok and r.json().get("status") == "ok":
            return [
                {"title": a.get("title", ""), "url": a.get("url", ""), "source": a.get("source", {}).get("name", "")}
                for a in r.json().get("articles", [])
                if a.get("title") and "[Removed]" not in a.get("title", "")
            ][:5]
    except Exception:
        pass
    return []


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
