from fastapi import APIRouter
from backend.services.macro_service import get_macro_snapshot

router = APIRouter()


@router.get("/macro")
def macro():
    return get_macro_snapshot()
