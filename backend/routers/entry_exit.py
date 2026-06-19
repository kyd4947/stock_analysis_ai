import asyncio
import re
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from backend.core.limiter import limiter
from backend.services.stock import get_stock_data, get_price_history, get_naver_financials
from backend.services.us_stock import get_us_stock_data, get_us_stock_financials, get_us_price_history
from backend.services.news import get_stock_news, get_us_stock_news
from backend.services.macro_service import get_macro_snapshot
from backend.services import gemini as gemini_svc

router = APIRouter()

_US_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")


class EntryExitRequest(BaseModel):
    ticker: str
    financial: dict = {}


@router.post("/entry-exit")
@limiter.limit("5/minute")
async def entry_exit(request: Request, req: EntryExitRequest):
    loop = asyncio.get_event_loop()
    ticker = req.ticker.upper()

    if _US_TICKER_RE.match(ticker):
        return await _handle_us(ticker, req.financial, loop)

    return await _handle_kr(ticker, req.financial, loop)


async def _handle_us(ticker: str, financial: dict, loop):
    stock, history, news, macro, us_fin = await asyncio.gather(
        loop.run_in_executor(None, get_us_stock_data, ticker),
        loop.run_in_executor(None, get_us_price_history, ticker),
        loop.run_in_executor(None, get_us_stock_news, ticker),
        loop.run_in_executor(None, get_macro_snapshot),
        loop.run_in_executor(None, get_us_stock_financials, ticker),
    )

    price = stock.get("price") or 0
    if not price:
        raise HTTPException(400, "현재가 데이터를 가져올 수 없습니다.")
    if not history:
        raise HTTPException(400, "가격 히스토리 데이터를 가져올 수 없습니다.")

    financial = {**us_fin, **financial}

    result = await loop.run_in_executor(
        None,
        lambda: gemini_svc.analyze_entry_exit_us_stock(
            ticker=ticker,
            current_price=price,
            price_history=history,
            news_articles=news,
            macro=macro,
            financial=financial,
        ),
    )

    if "error" in result:
        raise HTTPException(500, result["error"])

    result["currency"] = "USD"
    return result


async def _handle_kr(ticker: str, financial: dict, loop):
    stock, history, news, macro, naver_fin = await asyncio.gather(
        loop.run_in_executor(None, get_stock_data, ticker),
        loop.run_in_executor(None, get_price_history, ticker),
        loop.run_in_executor(None, get_stock_news, ticker),
        loop.run_in_executor(None, get_macro_snapshot),
        loop.run_in_executor(None, get_naver_financials, ticker),
    )

    price = stock.get("price") or 0
    if not price:
        raise HTTPException(400, "현재가 데이터를 가져올 수 없습니다.")
    if not history:
        raise HTTPException(400, "가격 히스토리 데이터를 가져올 수 없습니다.")

    financial = {**naver_fin, **financial}

    result = await loop.run_in_executor(
        None,
        lambda: gemini_svc.analyze_entry_exit(
            ticker=ticker,
            current_price=price,
            price_history=history,
            news_articles=news,
            macro=macro,
            financial=financial,
        ),
    )

    if "error" in result:
        raise HTTPException(500, result["error"])

    result["currency"] = "KRW"
    return result
