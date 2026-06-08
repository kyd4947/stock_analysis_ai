import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import screen, macro, chat, search, market_insight


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버 시작 시 DART corp_code 캐시를 완전히 로드한 뒤 요청 수락
    # (60초 제한: 타임아웃 시 폴백으로 계속)
    loop = asyncio.get_event_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, _warmup_dart),
            timeout=65,
        )
    except asyncio.TimeoutError:
        pass
    yield


def _warmup_dart():
    try:
        from backend.services.dart import _corp_info_map
        _corp_info_map()
    except Exception:
        pass


app = FastAPI(title="Stock Analysis AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(screen.router, prefix="/api")
app.include_router(macro.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(market_insight.router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "message": "Stock Analysis AI Backend"}
