import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import screen, macro, chat, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버 시작 시 DART corp_code 캐시를 백그라운드에서 미리 로드
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _warmup_dart)
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


@app.get("/")
async def root():
    return {"status": "ok", "message": "Stock Analysis AI Backend"}
