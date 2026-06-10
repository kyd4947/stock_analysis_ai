import asyncio
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from backend.core.limiter import limiter
from backend.services.stock import get_stock_data, get_price_history, get_naver_financials
from backend.services.news import get_stock_news
from backend.services.macro_service import get_macro_snapshot
from backend.services import gemini as gemini_svc

router = APIRouter()


class EntryExitRequest(BaseModel):
    ticker: str
    financial: dict = {}


@router.post("/entry-exit")
@limiter.limit("5/minute")
async def entry_exit(request: Request, req: EntryExitRequest):
    loop = asyncio.get_event_loop()

    stock, history, news, macro, naver_fin = await asyncio.gather(
        loop.run_in_executor(None, get_stock_data, req.ticker),
        loop.run_in_executor(None, get_price_history, req.ticker),
        loop.run_in_executor(None, get_stock_news, req.ticker),
        loop.run_in_executor(None, get_macro_snapshot),
        loop.run_in_executor(None, get_naver_financials, req.ticker),
    )

    price = stock.get("price") or 0
    if not price:
        raise HTTPException(400, "현재가 데이터를 가져올 수 없습니다.")
    if not history:
        raise HTTPException(400, "가격 히스토리 데이터를 가져올 수 없습니다.")

    # 재무 데이터 병합: 요청에 포함된 것 우선, 없으면 naver_fin 사용
    financial = {**naver_fin, **req.financial}

    result = await loop.run_in_executor(
        None,
        lambda: gemini_svc.analyze_entry_exit(
            ticker=req.ticker,
            current_price=price,
            price_history=history,
            news_articles=news,
            macro=macro,
            financial=financial,
        ),
    )

    if "error" in result:
        raise HTTPException(500, result["error"])

    return result
