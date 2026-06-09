import asyncio
from fastapi import APIRouter, Request
from pydantic import BaseModel
from backend.services import gemini as gemini_svc
from backend.services.macro_service import get_macro_snapshot
from backend.core.limiter import limiter

router = APIRouter()


class RecommendRequest(BaseModel):
    user_profile: dict


@router.post("/recommend")
@limiter.limit("5/minute")
async def recommend(request: Request, req: RecommendRequest):
    loop = asyncio.get_event_loop()
    macro = await loop.run_in_executor(None, get_macro_snapshot)
    result = await loop.run_in_executor(
        None, gemini_svc.recommend_stocks, req.user_profile, macro
    )
    return result
