import uuid
import asyncio
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

from backend.services.stock import get_stock_data
from backend.services.macro_service import get_macro_snapshot
from backend.services.dart import get_dart_disclosures, get_shareholders, get_dart_financials, name_to_ticker
from backend.services.news import get_stock_news
from backend.services import gemini as gemini_svc

router = APIRouter()


class UserProfile(BaseModel):
    risk_tolerance: str = "medium"
    preferred_style: list[str] = []
    horizon: str = "mid"


class Preferences(BaseModel):
    min_score: float = 0.0
    top_k: int = 10
    require_liquidity: bool = False


class ScreenRequest(BaseModel):
    id: Optional[str] = None
    tickers: list[str]
    user_profile: UserProfile = UserProfile()
    preferences: Preferences = Preferences()


def _resolve_ticker(ticker: str) -> str:
    """종목명(한글) → 티커 코드 변환. 숫자 코드면 그대로 반환."""
    stripped = ticker.strip()
    if stripped.isdigit():
        return stripped
    found = name_to_ticker(stripped)
    return found if found else stripped


async def _process_ticker(
    ticker: str,
    user_profile: dict,
    macro: dict,
    min_score: float,
    loop: asyncio.AbstractEventLoop,
) -> dict | None:
    ticker = _resolve_ticker(ticker)
    stock, dart, shareholders, news_articles, dart_fin = await asyncio.gather(
        loop.run_in_executor(None, get_stock_data, ticker),
        loop.run_in_executor(None, get_dart_disclosures, ticker),
        loop.run_in_executor(None, get_shareholders, ticker),
        loop.run_in_executor(None, get_stock_news, ticker),
        loop.run_in_executor(None, get_dart_financials, ticker),
    )

    # yfinance가 재무지표를 제공하지 않으면 DART 재무제표로 보완
    price = stock.get("price") or 0
    per = stock.get("per")
    pbr = stock.get("pbr")
    roe = stock.get("roe")

    if per is None and dart_fin.get("eps") and price and dart_fin["eps"] > 0:
        per = round(price / dart_fin["eps"], 2)
    if pbr is None and dart_fin.get("bps") and price and dart_fin["bps"] > 0:
        pbr = round(price / dart_fin["bps"], 2)
    if roe is None and dart_fin.get("roe") is not None:
        roe = dart_fin["roe"]

    financial = {
        "per": per or 0.0,
        "pbr": pbr or 0.0,
        "roe": roe or 0.0,
    }

    analysis = await loop.run_in_executor(
        None,
        lambda: gemini_svc.analyze_stock(
            ticker=ticker,
            user_profile=user_profile,
            macro=macro,
            financial=financial,
            dart=dart,
            news_articles=news_articles,
            price=stock.get("price") or 0,
        ),
    )

    score = analysis.get("score", 0.5)
    if score < min_score:
        return None

    return {
        "ticker": ticker,
        "name": stock.get("name") or ticker,
        "score": score,
        "signal": analysis.get("signal", "HOLD"),
        "signal_reason": analysis.get("signal_reason", ""),
        "summary": analysis.get("summary", ""),
        "reasons": analysis.get("reasons", []),
        "price": stock.get("price"),
        "change_rate": stock.get("change_rate"),
        "change_value": stock.get("change_value"),
        "sector": stock.get("sector"),
        "macro": {
            "exchange_rate_usdkrw": macro.get("exchange_rate_usdkrw") or 0,
            "policy_rate": macro.get("policy_rate") or 0,
            "inflation_yoy": macro.get("inflation_yoy") or 0,
            "us_10y_yield": macro.get("us_10y_yield"),
            "fed_funds_rate": macro.get("fed_funds_rate"),
        },
        "financial": financial,
        "dart": dart,
        "news": {"articles": news_articles} if news_articles else None,
        "shareholders": shareholders or None,
    }


@router.post("/screen")
async def screen_stocks(req: ScreenRequest):
    loop = asyncio.get_event_loop()
    macro = await loop.run_in_executor(None, get_macro_snapshot)

    tickers = req.tickers[: req.preferences.top_k]
    tasks = [
        _process_ticker(
            ticker=t,
            user_profile=req.user_profile.model_dump(),
            macro=macro,
            min_score=req.preferences.min_score,
            loop=loop,
        )
        for t in tickers
    ]
    raw_results = await asyncio.gather(*tasks)

    results = [r for r in raw_results if r is not None]
    results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "request_id": req.id or str(uuid.uuid4()),
        "results": results,
    }
