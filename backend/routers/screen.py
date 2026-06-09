import re
import uuid
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator
from backend.core.limiter import limiter

from backend.services.stock import get_stock_data, get_naver_financials
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


_TICKER_RE = re.compile(r"^[\w가-힣]{1,20}$")

class ScreenRequest(BaseModel):
    id: Optional[str] = None
    tickers: list[str]
    user_profile: UserProfile = UserProfile()
    preferences: Preferences = Preferences()

    @field_validator("tickers")
    @classmethod
    def validate_tickers(cls, v: list[str]) -> list[str]:
        if len(v) > 20:
            raise ValueError("tickers는 최대 20개까지 허용됩니다.")
        for t in v:
            if not _TICKER_RE.match(t.strip()):
                raise ValueError(f"유효하지 않은 티커: {t}")
        return v


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
    stock, dart, shareholders, news_articles, dart_fin, naver_fin = await asyncio.gather(
        loop.run_in_executor(None, get_stock_data, ticker),
        loop.run_in_executor(None, get_dart_disclosures, ticker),
        loop.run_in_executor(None, get_shareholders, ticker),
        loop.run_in_executor(None, get_stock_news, ticker),
        loop.run_in_executor(None, get_dart_financials, ticker),
        loop.run_in_executor(None, get_naver_financials, ticker),
    )

    # 이름도 가격도 없으면 → 존재하지 않는 티커
    if not stock.get("price") and not stock.get("name"):
        return None

    price = stock.get("price") or 0
    per = stock.get("per")
    pbr = stock.get("pbr")
    roe = stock.get("roe")

    # 우선순위: NAVER Finance(totalInfos) → NAVER HTML 스크래핑 → DART(EPS/BPS 계산)
    if per is None:
        per = naver_fin.get("per")
    if pbr is None:
        pbr = naver_fin.get("pbr")
    if roe is None:
        roe = naver_fin.get("roe")

    eps = dart_fin.get("eps")
    bps = dart_fin.get("bps")
    if per is None and eps and price and eps > 0:
        per = round(price / eps, 2)
    if pbr is None and bps and price and bps > 0:
        pbr = round(price / bps, 2)
    if roe is None and dart_fin.get("roe") is not None:
        roe = dart_fin["roe"]
    # NAVER HTML EPS/BPS로 ROE 계산
    if roe is None:
        naver_eps = naver_fin.get("eps")
        naver_bps = naver_fin.get("bps")
        if naver_eps and naver_bps and naver_bps > 0:
            roe = round(naver_eps / naver_bps * 100, 2)
    # NAVER API totalInfos EPS/BPS로 ROE 계산 (최종 fallback)
    if roe is None:
        s_eps = stock.get("eps")
        s_bps = stock.get("bps")
        if s_eps is not None and s_bps and s_bps > 0:
            roe = round(s_eps / s_bps * 100, 2)
    if roe is not None:
        print(f"[Screen/{ticker}] ROE={roe}", flush=True)
    else:
        print(f"[Screen/{ticker}] ROE=None (all sources exhausted)", flush=True)

    # None을 그대로 유지 (0.0으로 대체하지 않음 - AI가 0을 유효값으로 오인하는 문제 방지)
    financial = {
        "per": per,
        "pbr": pbr,
        "roe": roe,
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
@limiter.limit("5/minute")
async def screen_stocks(request: Request, req: ScreenRequest):
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
