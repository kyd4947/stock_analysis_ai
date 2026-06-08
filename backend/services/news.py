"""
뉴스 수집.
- 구글 뉴스 RSS: API 키 불필요, 실시간 한국어 경제/종목 뉴스
- NewsAPI.org: NEWS_API_KEY 설정 시 보완용
"""
import xml.etree.ElementTree as ET
import requests
from backend.core.config import settings

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}


def _parse_rss(content: bytes) -> list[dict]:
    """RSS 2.0 XML → {title, url, source, publishedAt} 목록."""
    try:
        root = ET.fromstring(content)
        result = []
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            source_el = item.find("source")
            source = (source_el.text if source_el is not None else "").strip()
            pub = (item.findtext("pubDate") or "").strip()
            if title and link and "[Removed]" not in title:
                result.append({
                    "title": title,
                    "url": link,
                    "source": source,
                    "publishedAt": pub,
                })
        return result
    except Exception:
        return []


def _google_news_rss(query: str, limit: int = 6) -> list[dict]:
    """구글 뉴스 RSS 검색. API 키 불필요, 한국어 뉴스 반환."""
    try:
        r = requests.get(
            "https://news.google.com/rss/search",
            params={"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"},
            headers=_HEADERS,
            timeout=8,
        )
        if r.ok:
            return _parse_rss(r.content)[:limit]
    except Exception:
        pass
    return []


def get_stock_news(ticker: str, company_name: str = "") -> list[dict]:
    """종목 뉴스. 구글 뉴스 RSS → NewsAPI 순으로 시도."""
    query = company_name or ticker

    # 1차: 구글 뉴스 RSS (API 키 불필요)
    articles = _google_news_rss(f"{query} 주가 주식", limit=5)
    if articles:
        return articles

    # 2차: NewsAPI.org (키 있을 때만)
    key = settings.NEWS_API_KEY
    if not key:
        return []
    try:
        r = requests.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": query,
                "language": "ko",
                "sortBy": "publishedAt",
                "pageSize": 5,
                "apiKey": key,
            },
            timeout=8,
        )
        if r.ok and r.json().get("status") == "ok":
            return [
                {
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "source": a.get("source", {}).get("name", ""),
                }
                for a in r.json().get("articles", [])
                if a.get("title") and "[Removed]" not in a.get("title", "")
            ][:5]
    except Exception:
        pass
    return []


def get_market_news() -> list[dict]:
    """한국 주식 시장 전반 뉴스. 구글 뉴스 RSS → NewsAPI 순으로 시도."""

    # 1차: 구글 뉴스 RSS - 코스피/주식시장 (API 키 불필요)
    articles = _google_news_rss("코스피 코스닥 주식시장 경제", limit=6)
    if articles:
        return articles

    # 2차: NewsAPI.org (키 있을 때만)
    key = settings.NEWS_API_KEY
    if not key:
        return []
    try:
        r = requests.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": "코스피 OR 코스닥 OR 한국증시",
                "language": "ko",
                "sortBy": "publishedAt",
                "pageSize": 6,
                "apiKey": key,
            },
            timeout=8,
        )
        if r.ok and r.json().get("status") == "ok":
            return [
                {
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "source": a.get("source", {}).get("name", ""),
                    "publishedAt": a.get("publishedAt", ""),
                }
                for a in r.json().get("articles", [])
                if a.get("title") and "[Removed]" not in a.get("title", "")
            ][:6]
    except Exception:
        pass
    return []
