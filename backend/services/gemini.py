"""
Gemini AI를 이용한 종목 분석 및 Q&A.
google-genai SDK 사용. 모델 할당량 초과 시 순서대로 fallback.
"""
import json
import re
import time
from google import genai

from backend.core.config import settings

_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
]

_STYLE_MAP = {
    "lowPER": "저PER 가치투자",
    "lowPBR": "저PBR 자산가치",
    "highROE": "고ROE 수익성",
    "value": "가치투자",
    "quality": "퀄리티",
    "quant": "퀀트(PER·PBR·ROE·모멘텀 등 다중 지표 기반 체계적 선별)",
}
_HORIZON_MAP = {"short": "단기(3개월 이내)", "mid": "중기(6~12개월)", "long": "장기(1년 이상)"}
_RISK_MAP = {"low": "보수적", "medium": "중립적", "high": "공격적"}


def _client() -> genai.Client:
    return genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options={"api_version": "v1"},
    )


def _generate(prompt: str) -> str:
    """모델 fallback 포함 텍스트 생성. 모든 오류에서 다음 모델 시도."""
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다")
    client = _client()
    last_err: Exception | None = None
    for model in _MODELS:
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            return response.text.strip()
        except Exception as e:
            err_str = str(e)
            print(f"[Gemini] {model} failed: {type(e).__name__}: {err_str}", flush=True)
            last_err = e
            # RPM(분당 한도) 초과면 잠깐 대기, RPD(일일 한도) 초과면 즉시 다음 모델로
            if "429" in err_str or "quota" in err_str.lower():
                if "daily" in err_str.lower() or "per_day" in err_str.lower() or "quota_exceeded" in err_str.lower():
                    print(f"[Gemini] {model} 일일 한도 초과 → 다음 모델로", flush=True)
                else:
                    time.sleep(1)
            continue
    raise RuntimeError(f"모든 Gemini 모델 오류: {last_err}")


def analyze_stock(
    ticker: str,
    user_profile: dict,
    macro: dict,
    financial: dict,
    dart: dict,
    news_articles: list[dict],
    price: float,
) -> dict:
    style = ", ".join(_STYLE_MAP.get(s, s) for s in user_profile.get("preferred_style", []))
    horizon = _HORIZON_MAP.get(user_profile.get("horizon", "mid"), "중기")
    risk = _RISK_MAP.get(user_profile.get("risk_tolerance", "medium"), "중립적")

    news_text = "\n".join(f"- {a['title']}" for a in news_articles[:3]) or "뉴스 없음"
    risk_text = ", ".join(dart.get("risk_flags", [])) or "없음"
    highlights_text = "\n".join(f"- {h}" for h in dart.get("highlights", [])) or "없음"

    def _fmt_fin(v) -> str:
        if v is None or v == 0:
            return "데이터 없음"
        return str(v)

    prompt = f"""당신은 한국 주식 투자 AI 애널리스트입니다. 아래 데이터를 종합하여 {ticker} 종목을 분석하세요.

[투자자 프로필]
리스크 선호: {risk} | 투자 스타일: {style or "없음"} | 투자 기간: {horizon}

[거시경제]
USD/KRW: {macro.get("exchange_rate_usdkrw", "N/A")} | 한국 기준금리: {macro.get("policy_rate", "N/A")}% | 미국 기준금리: {macro.get("fed_funds_rate", "N/A")}% | 인플레이션(YoY): {macro.get("inflation_yoy", "N/A")}%

[재무]
현재가: {price:,.0f}원 | PER: {_fmt_fin(financial.get("per"))} | PBR: {_fmt_fin(financial.get("pbr"))} | ROE: {_fmt_fin(financial.get("roe"))}{'%' if financial.get('roe') else ''}

[DART 공시 하이라이트]
{highlights_text}

[DART 리스크 공시]
{risk_text}

[최근 뉴스]
{news_text}

위 데이터를 분석하여 아래 JSON 형식으로만 응답하세요. 마크다운(```)을 절대 사용하지 마세요. JSON 외 다른 텍스트를 포함하지 마세요.

{{"score": 0.75, "signal": "BUY", "signal_reason": "매수 판단 근거 1~2문장", "summary": "종합 의견 2~3문장", "reasons": ["근거1", "근거2", "근거3"]}}

score는 0.0~1.0 사이 실수, signal은 BUY/SELL/HOLD 중 하나, 모든 텍스트는 한국어로 작성하세요."""

    try:
        text = _generate(prompt)
        text = re.sub(r"```(?:json)?\s*", "", text)
        text = re.sub(r"```", "", text).strip()
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
        return json.loads(text)
    except Exception as e:
        print(f"[Gemini] analyze_stock {ticker} error: {type(e).__name__}: {e}", flush=True)
        return {
            "score": 0.5,
            "signal": "HOLD",
            "signal_reason": "AI 분석 중 오류가 발생했습니다. 데이터를 재수집 후 다시 시도해주세요.",
            "summary": f"{ticker} 분석 데이터를 수집했습니다. AI 분석 중 오류가 발생했습니다.",
            "reasons": ["데이터 수집 완료", "AI 분석 재시도 필요"],
        }


def answer_question(ticker: str, question: str, context_summary: str = "") -> str:
    ctx = f"\n[분석 컨텍스트]\n{context_summary}" if context_summary else ""
    prompt = f"""당신은 한국 주식 투자 전문가 AI입니다.{ctx}

종목 {ticker}에 관한 질문에 한국어로 명확하고 간결하게 답변하세요.

질문: {question}"""

    try:
        return _generate(prompt)
    except Exception:
        return "답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
