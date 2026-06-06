# 📈 개인화된 거시경제 기반 주식 분석 AI 비서

사용자의 투자 성향과 실시간 거시경제 지표를 결합하여, 종목별 투자 전망을 분석하고 제공하는 개인화 AI 비서 서비스입니다.

## 🚀 프로젝트 개요
단순 재무제표 분석을 넘어, 한국은행(ECOS), FRED, 실시간 뉴스 데이터를 종합하여 사용자의 투자 성향에 최적화된 종목 분석 리포트를 제공합니다.

## 🛠 주요 기술 스택
- **Backend:** Python, FastAPI (비동기 처리)
- **Frontend:** Next.js (App Router), Tailwind CSS, Shadcn UI
- **AI/LLM:** Google Gemini API (분석 및 개인화 답변)
- **Database:** Supabase (PostgreSQL)
- **External API:** Toss Securities API, ECOS(한국은행), DART, FRED, NewsAPI

## 🏗 시스템 아키텍처
1. **데이터 레이어:** ECOS, FRED, DART, 뉴스 API로부터 실시간 데이터 수집.
2. **분석 레이어:** Pydantic을 이용한 데이터 검증 및 Gemini AI를 활용한 거시경제-종목 상관관계 분석.
3. **개인화 엔진:** Supabase에 저장된 사용자 투자 성향(리스크 선호도, 투자 스타일) 기반 프롬프트 주입.
4. **UI 레이어:** Next.js를 통해 분석 결과 실시간 시각화.



## 📋 로드맵
- [x] 프로젝트 구조 설정 및 환경 구성
- [ ] 거시경제(FRED/ECOS) API 연동
- [ ] 사용자 프로필 및 분석 이력 DB(Supabase) 설계
- [ ] Gemini API를 이용한 종합 분석 파이프라인 구축
- [ ] 실시간 종목 분석 대시보드 UI 구현

## 💻 로컬 실행 방법

### Backend (FastAPI)
```bash
# 프로젝트 루트(stock_analysis_ai)에서 실행
# 가상환경 활성화
.\venv\Scripts\Activate.ps1

# 서버 실행
python -m uvicorn backend.core.main:app --reload

### Frotend (Next.js)
cd frontend
npm install
npm run dev

### 💡 수정 팁
1. ** 태그:** 이 태그는 나중에 제가 이미지를 생성해 드릴 수 있는 자리입니다. 프로젝트의 구조를 설명하는 다이어그램이 필요하시면 말씀해 주세요.
2. **환경 변수 파일:** `README.md`에는 `.env` 예시 파일 구조를 포함하는 것도 좋지만, 실제 키값은 절대 공개하지 않도록 주의하세요!