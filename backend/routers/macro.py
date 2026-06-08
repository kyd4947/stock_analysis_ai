import asyncio
from fastapi import APIRouter
from backend.services.macro_service import get_macro_snapshot
from backend.services.news import get_market_news

router = APIRouter()


@router.get("/macro")
def macro():
    return get_macro_snapshot()


@router.get("/market-news")
async def market_news_endpoint():
    loop = asyncio.get_event_loop()
    articles = await loop.run_in_executor(None, get_market_news)
    return {"articles": articles}
