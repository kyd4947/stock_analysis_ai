import asyncio
from fastapi import APIRouter
from backend.services.macro_service import get_macro_snapshot
import backend.services.market_insight as _mi_svc

router = APIRouter()


@router.get("/market-insight")
async def market_insight_endpoint():
    loop = asyncio.get_event_loop()
    macro = await loop.run_in_executor(None, get_macro_snapshot)
    result = await loop.run_in_executor(None, _mi_svc.get_market_insight, macro)
    return result


@router.post("/market-insight/refresh")
async def market_insight_refresh():
    """캐시 강제 갱신 — 배포 후 즉시 새 추천 종목 반영."""
    _mi_svc._cache = None
    _mi_svc._cache_time = None
    loop = asyncio.get_event_loop()
    macro = await loop.run_in_executor(None, get_macro_snapshot)
    result = await loop.run_in_executor(None, _mi_svc.get_market_insight, macro)
    return {"refreshed": True, "generated_at": result.get("generated_at")}
