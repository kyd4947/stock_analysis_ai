# Stock Analysis AI

주식 투자 분석 AI 웹앱 — 거시경제, 재무제표, 기술적 지표, 뉴스를 종합해 Google Gemini가 한국·미국 주식을 분석합니다.

- **Backend**: Python FastAPI (Fly.io, 도쿄 리전)
- **Frontend**: Next.js 14 + Tailwind CSS + Shadcn/UI (Vercel)
- **AI**: Google Gemini (5개 모델 fallback 체인)
- **인증**: 비밀번호 로그인 + 자체 구현 JWT (7일 유효)

## 디렉토리 구조

```
stock_analysis_ai/
├── backend/
│   ├── core/
│   │   ├── main.py           # FastAPI 앱, CORS, 인증 미들웨어, 라우터 마운트
│   │   ├── config.py         # 환경변수 로드 (pydantic-settings)
│   │   ├── auth.py           # JWT 생성/검증, 비밀번호 해싱 (SHA-256)
│   │   └── limiter.py        # Rate limiting (slowapi)
│   ├── services/
│   │   ├── stock.py          # 한국 종목: NAVER Finance + Yahoo fallback, 기술지표 계산
│   │   ├── us_stock.py       # 미국 종목: Yahoo Finance
│   │   ├── gemini.py         # Gemini AI: 분석/추천/타점/Q&A (기술지표 포함 프롬프트)
│   │   ├── dart.py           # DART: 공시, 재무제표, 주주, 실적일정
│   │   ├── news.py           # 뉴스: Google RSS/NAVER/연합뉴스/NewsAPI + 관련성·스팸 필터
│   │   ├── macro_service.py  # 거시경제: KOSPI, 환율, 금리, 물가, VIX/VKOSPI
│   │   └── market_insight.py # 시장 인사이트: AI 일일 분석
│   └── routers/
│       ├── screen.py         # POST /api/screen (핵심 분석) — 5회/min
│       ├── chat.py           # POST /api/chat, /api/chat/stream — 10회/min
│       ├── macro.py          # GET /api/macro, /api/market-news
│       ├── entry_exit.py     # POST /api/entry-exit — 5회/min
│       ├── recommend.py      # POST /api/recommend — 5회/min
│       ├── search.py         # GET /api/search
│       ├── prices.py         # POST /api/prices — 30회/min
│       ├── market_insight.py # GET /api/market-insight
│       └── auth.py           # POST /api/auth/login
├── frontend/
│   ├── app/
│   │   ├── layout.tsx        # 루트 레이아웃, 인증 게이트, 매크로 폴링(15초)
│   │   ├── page.tsx          # 메인 대시보드
│   │   ├── manifest.ts       # PWA 매니페스트
│   │   └── icon.tsx, apple-icon.tsx
│   ├── components/
│   │   ├── AppSidebar.tsx      # 사이드바, 매크로 패널, VIX/VKOSPI 공포지수
│   │   ├── StockSearchBox.tsx  # 검색 자동완성 (디바운스 300ms)
│   │   ├── StockScreenCard.tsx # 분석 결과 카드 (재무/기술지표/뉴스/채팅)
│   │   ├── LoginPage.tsx       # 비밀번호 로그인
│   │   ├── WatchlistPage.tsx   # 관심 종목 (localStorage)
│   │   ├── ProfilePage.tsx     # 투자 성향 설정
│   │   └── PortfolioPage.tsx   # Toss 연동 (예정)
│   ├── lib/
│   │   ├── api.ts           # API 호출 함수 (JWT 헤더 포함)
│   │   ├── auth.ts          # 로그인, 토큰 관리 (sessionStorage)
│   │   └── utils.ts         # cn() 유틸리티
├── .env                      # API 키, SITE_PASSWORD, JWT_SECRET (gitignore)
├── fly.toml                  # Fly.io 배포 설정 (도쿄, 포트 8080)
├── Dockerfile, Procfile
└── requirements.txt
```

## 종목 분석 데이터 흐름

```
1. 사용자 종목 입력 → POST /api/screen { tickers, user_profile }
       ↓
2. 병렬 데이터 수집
   ├── NAVER Finance → 주가, PER, PBR, ROE, EPS, BPS
   ├── Yahoo Finance → 1년 OHLCV 가격 이력
   ├── DART → 공시 리스크, 재무제표, 주주, 실적일정
   ├── 뉴스 → Google RSS + NewsAPI (관련성/스팸 필터 적용)
   ├── 거시경제 → 환율, 금리, 물가, 지수
   └── 투자자 동향 → 외국인/기관 5일 순매수
       ↓
3. 기술적 지표 계산
   ├── RSI(14), MACD(12/26/9), 스토캐스틱(14), 볼린저(20, ±2σ)
   ├── 52주 고저 위치, MA5/20/60, 거래량 비율, 5일/20일 수익률
   └── 최근 종가 60일 보관
       ↓
4. Gemini AI 분석 — 기술지표 포함 프롬프트
   ├── 점수(0~100%), 시그널(BUY/HOLD/WATCH/SELL)
   ├── AI 요약 + 근거 + 리스크 경고
   └── 모델 fallback: 2.5-flash → 3.5-flash → 3.1-flash-lite → 2.5-flash-lite → 3.0-flash
       ↓
5. 결과 메모리 캐시 (30분 TTL)
       ↓
6. StockScreenCard 렌더링
```

## 주요 기능

| 기능 | 상세 |
|------|------|
| **종목 분석** | AI 시그널 + 점수, 재무 지표(PER/PBR/ROE/부채비율/배당수익률), 기술 지표(RSI/MACD/스토캐스틱/볼린저 — 클릭 시 해석), 52주 위치, 거래량, 외국인·기관 동향, DART 리스크 공시, 주요 주주, 관련 뉴스 |
| **AI 타점 분석** | 매수/매도 구간, 목표가, 손절가 — `/api/entry-exit` |
| **Q&A 채팅** | 종목 컨텍스트 기반 실시간 질문 (SSE 스트리밍) — `/api/chat/stream` |
| **시장 인사이트** | 20개 후보 종목 → AI 섹터별 추천, 일일 캐시 (오전 8시 갱신) |
| **거시경제** | KOSPI/KOSDAQ, 원달러(6개 fallback), 한·미 금리, CPI, 실업률, 비농업고용, 국채수익률 |
| **공포지수** | VIX(미국)·VKOSPI(한국) 별도 해석 + 클릭 시 범위표 |
| **뉴스 필터** | ① 제목에 종목명/티커 필수 ② 스팸 키워드(리딩방/수익보장 등) 제외 ③ 자체 플랫폼 기사(네이버프리미엄의 타종목 기사 등) 제외 ④ 관련 기사 없으면 빈 목록 |
| **AI 종목 추천** | 투자 성향 기반 추천 — `/api/recommend` |
| **인증** | `SITE_PASSWORD` 로그인 → JWT(7일), 모든 API 미들웨어 검증, `/api/auth/login`·`/docs`만 공개 |
| **PWA** | 모바일 설치 가능, 반응형 UI |

## 외부 API / 환경변수

| 변수 | 용도 | API |
|------|------|-----|
| `GEMINI_API_KEY` | AI 분석 | Google Gemini |
| `DART_API_KEY` | 공시/재무제표 | DART OpenAPI |
| `ECOS_API_KEY` | 한국 금리/물가 | 한국은행 ECOS |
| `FRED_API_KEY` | 미국 금리/고용 | FRED |
| `NEWS_API_KEY` | 보완 뉴스 | NewsAPI.org |
| `SITE_PASSWORD` / `JWT_SECRET` | 인증 | — |
| `NEXT_PUBLIC_API_BASE_URL` | 백엔드 주소 | Vercel 환경변수 |

키 불필요: NAVER Finance(비공식), Yahoo Finance, Google News RSS, 연합뉴스 RSS, Dunamu/Stooq/ExchangeRate-API(환율 fallback)

## 배포

| 구성 | 플랫폼 | 비고 |
|------|--------|------|
| 프론트엔드 | Vercel | `vercel.json`, standalone output, PWA |
| 백엔드 | Fly.io | 도쿄 리전, 포트 8080, 256MB RAM, 상시 가동 |
| 백엔드 대안 | Heroku/Railway | `Procfile` |

## API 엔드포인트

| 메서드 | 경로 | 설명 | 제한 |
|--------|------|------|------|
| POST | `/api/auth/login` | 로그인 (JWT 발급) | — |
| GET | `/api/search` | 종목 검색 (한국+미국) | 전역 60/min |
| POST | `/api/screen` | AI 종목 분석 | 5/min |
| POST | `/api/chat` | 종목 Q&A | 10/min |
| POST | `/api/chat/stream` | Q&A (SSE) | 10/min |
| GET | `/api/macro` | 거시경제 스냅샷 | — |
| GET | `/api/market-news` | 시장 뉴스 | — |
| GET | `/api/market-insight` | 일일 AI 인사이트 (캐시) | — |
| POST | `/api/market-insight/refresh` | 인사이트 캐시 강제 갱신 | — |
| POST | `/api/prices` | 배치 주가 조회 | 30/min |
| POST | `/api/recommend` | AI 종목 추천 | 5/min |
| POST | `/api/entry-exit` | 매수/매도 타점 분석 | 5/min |
