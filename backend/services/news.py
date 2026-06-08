"""
뉴스 수집.
- 구글 뉴스 RSS: API 키 불필요, 실시간 한국어 경제/종목 뉴스
- NAVER Finance JSON: NAVER 시장 뉴스 (API 키 불필요)
- 연합뉴스 RSS: 경제 섹션 (API 키 불필요)
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
            # Google News RSS 등 일부 피드는 <link> 대신 <guid>에 URL 저장
            if not link:
                guid = item.findtext("guid") or ""
                if guid.strip().startswith("http"):
                    link = guid.strip()
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
    except Exception as e:
        print(f"[News] RSS parse error: {e}", flush=True)
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
            items = _parse_rss(r.content)[:limit]
            if items:
                return items
            print(f"[News] Google RSS returned 0 items for query: {query}", flush=True)
        else:
            print(f"[News] Google RSS status {r.status_code} for query: {query}", flush=True)
    except Exception as e:
        print(f"[News] Google RSS exception: {e}", flush=True)
    return []


def _yonhap_rss(limit: int = 6) -> list[dict]:
    """연합뉴스 경제 RSS. API 키 불필요."""
    try:
        r = requests.get(
            "https://www.yna.co.kr/rss/economy.xml",
            headers=_HEADERS,
            timeout=8,
        )
        if r.ok:
            items = _parse_rss(r.content)[:limit]
            if items:
                return items
    except Exception as e:
        print(f"[News] Yonhap RSS exception: {e}", flush=True)
    return []


def _naver_finance_market_news(limit: int = 6) -> list[dict]:
    """NAVER Finance 시장 뉴스 JSON API. API 키 불필요."""
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
    """한국 주식 시장 전반 뉴스. 여러 소스를 순서대로 시도."""

    # 1차: 구글 뉴스 RSS (API 키 불필요)
    articles = _google_news_rss("코스피 코스닥 주식시장 경제", limit=6)
    if articles:
        return articles

    # 2차: NAVER Finance 시장 뉴스 JSON API
    articles = _naver_finance_market_news(limit=6)
    if articles:
        return articles

    # 3차: 연합뉴스 경제 RSS
    articles = _yonhap_rss(limit=6)
    if articles:
        return articles

    # 4차: NewsAPI.org (키 있을 때만)
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
