import hashlib
import hmac
import json
import time
import base64
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from backend.core.config import settings

JWT_SECRET = settings.JWT_SECRET or "default-secret-change-me"
TOKEN_EXPIRY = 86400 * 7  # 7 days


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "==")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def create_token() -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps({
        "sub": "user",
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_EXPIRY,
    }).encode())
    sig = hmac.new(JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(sig)}"


def verify_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        sig = hmac.new(JWT_SECRET.encode(), f"{parts[0]}.{parts[1]}".encode(), hashlib.sha256).digest()
        expected = _b64url(sig)
        if not hmac.compare_digest(parts[2], expected):
            return None
        payload = json.loads(_b64url_decode(parts[1]))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def verify_password(password: str) -> bool:
    expected_hash = hash_password(settings.SITE_PASSWORD or "")
    return hmac.compare_digest(hash_password(password), expected_hash)


PUBLIC_PATHS = {"/", "/api/auth/login", "/docs", "/openapi.json", "/redoc"}


async def auth_middleware(request: Request, call_next):
    if request.url.path in PUBLIC_PATHS or request.url.path.startswith(("/docs/", "/openapi.json", "/redoc")):
        return await call_next(request)

    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if not token or not verify_token(token):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)
