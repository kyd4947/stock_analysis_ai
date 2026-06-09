import asyncio
from fastapi import APIRouter, Request
from pydantic import BaseModel
from backend.services.stock import get_stock_data
from backend.core.limiter import limiter

router = APIRouter()


class PricesRequest(BaseModel):
    tickers: list[str]


@router.post("/prices")
@limiter.limit("30/minute")
async def get_prices(request: Request, req: PricesRequest):
    """대시보드용 현재가/등락률만 반환 — Gemini 호출 없음."""
    loop = asyncio.get_event_loop()
    tickers = req.tickers[:20]
    tasks = [loop.run_in_executor(None, get_stock_data, t) for t in tickers]
    results = await asyncio.gather(*tasks)
    return {
        "results": [
            {
                "ticker": r["ticker"],
                "name": r.get("name"),
                "price": r.get("price"),
                "change_rate": r.get("change_rate"),
                "change_value": r.get("change_value"),
            }
            for r in results
            if r.get("price")
        ]
    }
