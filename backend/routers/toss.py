from fastapi import APIRouter, HTTPException, Query, Body
from backend.services.toss_service import (
    get_prices,
    get_holdings,
    get_exchange_rate,
    get_stocks,
    get_accounts,
    get_orderbook,
    get_candles,
    get_price_limits,
    get_stock_warnings,
    get_trades,
    get_kr_market_calendar,
    get_us_market_calendar,
    create_order,
    modify_order,
    cancel_order,
    get_orders,
    get_order_detail,
    get_buying_power,
    get_sellable_quantity,
    get_commissions,
)

router = APIRouter(prefix="/toss", tags=["toss"])


@router.get("/price/{ticker}")
async def get_stock_price(ticker: str):
    try:
        return await get_prices([ticker])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/prices")
async def get_stock_prices(symbols: str = Query(..., description="쉼표로 구분된 종목 심볼 목록")):
    try:
        return await get_prices(symbols.split(","))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/holdings")
async def get_portfolio_holdings(account_seq: str = "1"):
    try:
        return await get_holdings(account_seq)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/exchange-rate")
async def get_exchange_rate_api():
    try:
        return await get_exchange_rate()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stocks/{ticker}")
async def get_stock_info(ticker: str):
    """종목 기본 정보 (시장, 통화, 상장상태 등)"""
    try:
        return await get_stocks([ticker])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stocks")
async def get_stocks_info(symbols: str = Query(..., description="쉼표로 구분된 종목 심볼 목록")):
    try:
        return await get_stocks(symbols.split(","))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/accounts")
async def get_account_list(account_seq: str = "1"):
    try:
        return await get_accounts(account_seq)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/orderbook/{symbol}")
async def get_orderbook_api(symbol: str):
    """매수/매도 호가 및 잔량 조회"""
    try:
        return await get_orderbook(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/price-limits/{symbol}")
async def get_price_limits_api(symbol: str):
    """상/하한가 조회"""
    try:
        return await get_price_limits(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/candles/{symbol}")
async def get_candles_api(
    symbol: str,
    interval: str = Query("1d", description="봉 단위 (1m, 1d)"),
    count: int = Query(100, description="조회 봉 수 (최대 200)"),
):
    """캔들 차트 조회 (OHLCV)"""
    try:
        return await get_candles(symbol, interval, count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/warnings/{symbol}")
async def get_stock_warnings_api(symbol: str):
    """매수 유의사항 조회 (정리매매, 단기과열, 투자경고/위험, VI, 신주인수권)"""
    try:
        return await get_stock_warnings(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/trades/{symbol}")
async def get_trades_api(symbol: str, count: int = Query(50, description="조회 건수 (최대 50)")):
    """최근 체결 내역 조회"""
    try:
        return await get_trades(symbol, count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/market-calendar/kr")
async def get_kr_market_calendar_api():
    """국내 장 운영 정보 (KRX·NXT 세션별 시간)"""
    try:
        return await get_kr_market_calendar()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/market-calendar/us")
async def get_us_market_calendar_api():
    """해외 장 운영 정보 (데이마켓·프리·정규·애프터마켓)"""
    try:
        return await get_us_market_calendar()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Order API ──────────────────────────────────────────────────────────────

@router.post("/orders")
async def create_order_api(
    account_seq: str = Body("1"),
    symbol: str = Body(...),
    side: str = Body(..., description="BUY or SELL"),
    order_type: str = Body(..., description="LIMIT or MARKET"),
    quantity: int | None = Body(None),
    amount: float | None = Body(None),
    price: float | None = Body(None),
    client_order_id: str | None = Body(None),
):
    """주문 생성 (지정가/시장가)"""
    try:
        return await create_order(account_seq, symbol, side, order_type, quantity, amount, price, client_order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/orders/{order_id}/modify")
async def modify_order_api(
    order_id: str,
    account_seq: str = Body("1"),
    price: float | None = Body(None),
    quantity: int | None = Body(None),
):
    """주문 정정"""
    try:
        return await modify_order(account_seq, order_id, price, quantity)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/orders/{order_id}/cancel")
async def cancel_order_api(order_id: str, account_seq: str = Body("1")):
    """주문 취소"""
    try:
        return await cancel_order(account_seq, order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/orders")
async def get_orders_api(
    account_seq: str = "1",
    status: str | None = Query(None, description="PENDING or DONE"),
    symbol: str | None = Query(None),
    limit: int = Query(20),
):
    """주문 목록 조회"""
    try:
        return await get_orders(account_seq, status, symbol, limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/orders/{order_id}")
async def get_order_detail_api(order_id: str, account_seq: str = "1"):
    """주문 상세 조회"""
    try:
        return await get_order_detail(account_seq, order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/buying-power")
async def get_buying_power_api(account_seq: str = "1"):
    """매수 가능 금액 조회"""
    try:
        return await get_buying_power(account_seq)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/sellable-quantity")
async def get_sellable_quantity_api(
    account_seq: str = "1",
    symbol: str = Query(...),
):
    """판매 가능 수량 조회"""
    try:
        return await get_sellable_quantity(account_seq, symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/commissions")
async def get_commissions_api(account_seq: str = "1"):
    """매매 수수료 조회"""
    try:
        return await get_commissions(account_seq)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
