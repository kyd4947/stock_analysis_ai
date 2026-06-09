import asyncio
from fastapi import APIRouter
from backend.services.macro_service import get_macro_snapshot
from backend.services import gemini as gemini_svc
from backend.core.config import settings
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


@router.get("/market-insight/gemini-test")
async def gemini_test():
    """Gemini API 연결 진단 — 키 유효성 및 오류 메시지 반환."""
    key = settings.GEMINI_API_KEY
    if not key:
        return {"ok": False, "error": "GEMINI_API_KEY 환경변수가 설정되지 않았습니다."}
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, gemini_svc._generate, "한국어로 '안녕'이라고만 답하세요."
        )
        return {"ok": True, "response": result, "key_prefix": key[:8] + "..."}
    except Exception as e:
        return {"ok": False, "error": str(e), "key_prefix": key[:8] + "..."}
