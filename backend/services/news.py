"""
뉴스 수집. NewsAPI.org → Currents API 순으로 시도.
"""
import requests
from backend.core.config import settings


def get_stock_news(ticker: str, company_name: str = "") -> list[dict]:
    query = company_name or ticker
    key = settings.NEWS_API_KEY
    if not key:
        return []

    # NewsAPI.org 시도
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
            articles = r.json().get("articles", [])
            result = [
                {
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "source": a.get("source", {}).get("name", ""),
                }
                for a in articles
                if a.get("title") and "[Removed]" not in a.get("title", "")
            ]
            if result:
                return result[:5]
    except Exception:
        pass

    # Currents API 시도
    try:
        r = requests.get(
            "https://api.currentsapi.services/v1/search",
            params={
                "keywords": query,
                "language": "ko",
                "apiKey": key,
            },
            timeout=8,
        )
        if r.ok:
            articles = r.json().get("news", [])
            return [
                {
                    "title": a.get("title", ""),
                    "url": a.get("url", ""),
                    "source": a.get("author", ""),
                }
                for a in articles[:5]
                if a.get("title")
            ]
    except Exception:
        pass

    return []
