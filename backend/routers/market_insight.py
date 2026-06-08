import asyncio
from fastapi import APIRouter
from backend.services.macro_service import get_macro_snapshot
from backend.services.market_insight import get_market_insight

router = APIRouter()


@router.get("/market-insight")
async def market_insight_endpoint():
    loop = asyncio.get_event_loop()
    macro = await loop.run_in_executor(None, get_macro_snapshot)
    result = await loop.run_in_executor(None, get_market_insight, macro)
    return result
