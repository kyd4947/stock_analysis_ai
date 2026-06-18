import asyncio
import time
import httpx
from backend.core.config import settings

TOSS_BASE_URL = "https://openapi.tossinvest.com"
TOKEN_URL = f"{TOSS_BASE_URL}/oauth2/token"

_token: str | None = None
_token_expires_at: float = 0


async def _issue_access_token() -> str:
    client_id = settings.TOSS_CLIENT_ID or settings.TOSS_API_KEY
    client_secret = settings.TOSS_CLIENT_SECRET
    if not client_id or not client_secret:
        raise ValueError("TOSS_CLIENT_ID and TOSS_CLIENT_SECRET must be set")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Token issuance failed: {resp.status_code} {resp.text}")
        data = resp.json()
        _token = data["access_token"]
        global _token_expires_at
        _token_expires_at = time.time() + data.get("expires_in", 3600) - 60
        return _token


async def get_access_token() -> str:
    global _token, _token_expires_at
    if not _token or time.time() >= _token_expires_at:
        _token = await _issue_access_token()
    return _token


async def _get_headers() -> dict:
    token = await get_access_token()
    return {"Authorization": f"Bearer {token}"}


def _account_header(account_seq: str | None = None) -> dict:
    return {"X-Tossinvest-Account": account_seq or "1"}


async def get_prices(symbols: list[str]) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/prices",
            params={"symbols": ",".join(symbols)},
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Prices API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_holdings(account_seq: str | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/holdings",
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Holdings API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_exchange_rate() -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/exchange-rate",
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Exchange rate API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_stocks(symbols: list[str]) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/stocks",
            params={"symbols": ",".join(symbols)},
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Stocks API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_accounts(account_seq: str | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/accounts",
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Accounts API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_orderbook(symbol: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/orderbook",
            params={"symbol": symbol},
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Orderbook API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_candles(symbol: str, interval: str = "1d", count: int = 30) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/candles",
            params={"symbol": symbol, "interval": interval, "count": count},
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Candles API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_price_limits(symbol: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/price-limits",
            params={"symbol": symbol},
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Price-limits API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_stock_warnings(symbol: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/stocks/{symbol}/warnings",
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Stock warnings API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_trades(symbol: str, count: int = 50) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/trades",
            params={"symbol": symbol, "count": count},
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Trades API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_kr_market_calendar() -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/market-calendar/KR",
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"KR market calendar API error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_us_market_calendar() -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/market-calendar/US",
            headers=await _get_headers(),
        )
        if resp.status_code != 200:
            raise RuntimeError(f"US market calendar API error: {resp.status_code} {resp.text}")
        return resp.json()


# ── Sync helpers (for stock.py / us_stock.py integration) ──────────────────

_THREAD_POOL: dict | None = None


def _run_async(coro) -> any:
    """Run a coroutine from sync context, handling both with/without running loop."""
    global _THREAD_POOL
    try:
        loop = asyncio.get_running_loop()
        import concurrent.futures
        if _THREAD_POOL is None:
            _THREAD_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        fut = _THREAD_POOL.submit(asyncio.run, coro)
        return fut.result()
    except RuntimeError:
        return asyncio.run(coro)


def sync_get_prices(symbols: list[str]) -> dict:
    """Sync version, returns {symbol -> {price, currency}}"""
    try:
        data = _run_async(get_prices(symbols))
        result = {}
        for item in data.get("result", []):
            sym = item.get("symbol")
            if sym:
                result[sym] = {
                    "price": float(item.get("lastPrice", 0)),
                    "currency": item.get("currency", "KRW"),
                }
        return result
    except Exception as e:
        print(f"[Toss] sync_get_prices error: {e}", flush=True)
        return {}


def sync_get_stocks(symbols: list[str]) -> dict:
    """Sync version, returns {symbol -> stock_info_dict}"""
    try:
        data = _run_async(get_stocks(symbols))
        result = {}
        for item in data.get("result", []):
            sym = item.get("symbol")
            if sym:
                result[sym] = item
        return result
    except Exception as e:
        print(f"[Toss] sync_get_stocks error: {e}", flush=True)
        return {}


def sync_get_candles(symbol: str, interval: str = "1d", count: int = 200) -> list:
    """Sync version, returns list of {close, high, low, volume, timestamp}"""
    try:
        data = _run_async(get_candles(symbol, interval, count))
        return data.get("result", {}).get("items", [])
    except Exception as e:
        print(f"[Toss] sync_get_candles error: {e}", flush=True)
        return []


def sync_get_exchange_rate() -> dict | None:
    try:
        return _run_async(get_exchange_rate())
    except Exception as e:
        print(f"[Toss] sync_get_exchange_rate error: {e}", flush=True)
        return None


def _toss_configured() -> bool:
    return bool(settings.TOSS_CLIENT_SECRET) and bool(settings.TOSS_CLIENT_ID or settings.TOSS_API_KEY)


# ── Order API ──────────────────────────────────────────────────────────────

async def create_order(
    account_seq: str,
    symbol: str,
    side: str,
    order_type: str,
    quantity: int | None = None,
    amount: float | None = None,
    price: float | None = None,
    client_order_id: str | None = None,
) -> dict:
    body: dict = {"symbol": symbol, "side": side, "orderType": order_type}
    if quantity is not None:
        body["quantity"] = quantity
    if amount is not None:
        body["amount"] = int(amount)
    if price is not None:
        body["price"] = int(price)
    if client_order_id is not None:
        body["clientOrderId"] = client_order_id
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TOSS_BASE_URL}/api/v1/orders",
            json=body,
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Create order error: {resp.status_code} {resp.text}")
        return resp.json()


async def modify_order(account_seq: str, order_id: str, price: float | None = None, quantity: int | None = None) -> dict:
    body: dict = {}
    if price is not None:
        body["price"] = int(price)
    if quantity is not None:
        body["quantity"] = quantity
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TOSS_BASE_URL}/api/v1/orders/{order_id}/modify",
            json=body,
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Modify order error: {resp.status_code} {resp.text}")
        return resp.json()


async def cancel_order(account_seq: str, order_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TOSS_BASE_URL}/api/v1/orders/{order_id}/cancel",
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Cancel order error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_orders(account_seq: str, status: str | None = None, symbol: str | None = None, limit: int = 20) -> dict:
    params: dict = {"limit": limit}
    if status:
        params["status"] = status
    if symbol:
        params["symbol"] = symbol
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/orders",
            params=params,
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Get orders error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_order_detail(account_seq: str, order_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/orders/{order_id}",
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Get order detail error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_buying_power(account_seq: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/buying-power",
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Buying power error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_sellable_quantity(account_seq: str, symbol: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/sellable-quantity",
            params={"symbol": symbol},
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Sellable quantity error: {resp.status_code} {resp.text}")
        return resp.json()


async def get_commissions(account_seq: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TOSS_BASE_URL}/api/v1/commissions",
            headers={**await _get_headers(), **_account_header(account_seq)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Commissions error: {resp.status_code} {resp.text}")
        return resp.json()
