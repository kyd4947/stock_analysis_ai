"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  LineChart,
  Loader2,
  MessageSquare,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchMarketNews, fetchMarketInsight, fetchPrices, fetchRecommendation } from "@/lib/api";
import type { MarketInsight, RecommendResult } from "@/lib/api";
import { StockScreenCard } from "@/components/StockScreenCard";
import { WatchlistPage } from "@/components/WatchlistPage";
import { ProfilePage } from "@/components/ProfilePage";
import { PortfolioPage } from "@/components/PortfolioPage";
import { StockSearchBox } from "@/components/StockSearchBox";
import { useSearchContext } from "./layout";

type DashboardItem = {
  ticker: string;
  name?: string;
  change?: string;
  price?: number;
  tag?: string;
  isFromWatchlist?: boolean;
};

const KR_STOCK_NAMES: Record<string, string> = {
  "005930": "삼성전자", "000660": "SK하이닉스", "035420": "NAVER",
  "207940": "삼성바이오로직스", "005380": "현대자동차", "051910": "LG화학",
  "006400": "삼성SDI", "035720": "카카오", "000270": "기아",
  "105560": "KB금융", "055550": "신한지주", "096770": "SK이노베이션",
  "003550": "LG", "017670": "SK텔레콤", "030200": "KT",
};

const SAMPLE_ITEMS: DashboardItem[] = [
  { ticker: "005930", name: "삼성전자", tag: "반도체" },
  { ticker: "000660", name: "SK하이닉스", tag: "AI 메모리" },
  { ticker: "035420", name: "NAVER", tag: "플랫폼" },
  { ticker: "207940", name: "삼성바이오로직스", tag: "바이오" },
];

const SECTOR_STOCKS: Record<string, Array<{ ticker: string; name: string }>> = {
  "반도체/AI": [
    { ticker: "005930", name: "삼성전자" },
    { ticker: "000660", name: "SK하이닉스" },
  ],
  "플랫폼/IT": [
    { ticker: "035420", name: "NAVER" },
    { ticker: "035720", name: "카카오" },
    { ticker: "017670", name: "SK텔레콤" },
    { ticker: "030200", name: "KT" },
  ],
  "자동차": [
    { ticker: "005380", name: "현대차" },
    { ticker: "000270", name: "기아" },
    { ticker: "012330", name: "현대모비스" },
  ],
  "배터리/소재": [
    { ticker: "006400", name: "삼성SDI" },
    { ticker: "051910", name: "LG화학" },
    { ticker: "373220", name: "LG에너지솔루션" },
    { ticker: "247540", name: "에코프로비엠" },
  ],
  "바이오": [
    { ticker: "207940", name: "삼성바이오로직스" },
    { ticker: "068270", name: "셀트리온" },
  ],
  "금융": [
    { ticker: "105560", name: "KB금융" },
    { ticker: "055550", name: "신한지주" },
  ],
  "에너지/인프라": [
    { ticker: "267260", name: "HD현대일렉트릭" },
    { ticker: "034020", name: "두산에너빌리티" },
    { ticker: "096770", name: "SK이노베이션" },
    { ticker: "005490", name: "POSCO홀딩스" },
  ],
  "가전/소비재": [
    { ticker: "066570", name: "LG전자" },
    { ticker: "003550", name: "LG" },
  ],
};

const signals = [
  "미국 기준금리 동결 가능성이 성장주 밸류에이션 부담을 완화했습니다.",
  "원/달러 환율 변동성이 커져 수출주와 원가 민감 업종을 분리해서 볼 필요가 있습니다.",
  "최근 뉴스 감성은 반도체, 전력 인프라, 바이오 CDMO 쪽으로 강하게 기울어 있습니다.",
];

type NewsArticle = { title: string; url: string; source: string; publishedAt?: string };

export default function Page() {
  const [dashboardItems, setDashboardItems] = useState<DashboardItem[]>(SAMPLE_ITEMS);
  const [dashboardAutoLoading, setDashboardAutoLoading] = useState(false);
  const [marketNews, setMarketNews] = useState<NewsArticle[]>([]);
  const [marketInsight, setMarketInsight] = useState<MarketInsight | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendResult | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const autoFetchedKeyRef = useRef<string>("");
  const {
    screenResult,
    screenLoading,
    screenError,
    lastTicker,
    handleTickerSearch,
    setLastTicker,
    clearResult,
    activeNav,
    macro,
    userProfile,
  } = useSearchContext();

  async function handleRecommend() {
    setRecommendLoading(true);
    setRecommendation(null);
    try {
      const result = await fetchRecommendation(userProfile);
      setRecommendation(result);
    } finally {
      setRecommendLoading(false);
    }
  }

  // localStorage 관심 종목 → 대시보드 목록 동기화
  useEffect(() => {
    try {
      const stored = localStorage.getItem("watchlist");
      if (stored) {
        const items: Array<{ ticker: string; lastPrice?: number; lastSector?: string }> =
          JSON.parse(stored);
        if (items.length > 0) {
          setDashboardItems(
            items.map((item) => ({
              ticker: item.ticker,
              name: KR_STOCK_NAMES[item.ticker],
              price: item.lastPrice,
              tag: item.lastSector,
              isFromWatchlist: true,
            }))
          );
          return;
        }
      }
    } catch {}
    setDashboardItems(SAMPLE_ITEMS);
  }, []);

  // AI 시장 해석 → 추천 종목으로 대시보드 갱신 (관심 종목 없을 때만)
  useEffect(() => {
    if (!marketInsight?.recommended_tickers?.length) return;
    setDashboardItems((prev) => {
      if (prev.some((item) => item.isFromWatchlist)) return prev;
      return marketInsight.recommended_tickers!.map((t) => ({
        ticker: t.ticker,
        name: t.name,
        tag: t.sector,
      }));
    });
  }, [marketInsight]);

  // 대시보드 티커 목록이 바뀔 때 가격/AI 스코어 자동 로드
  const dashboardTickerKey = useMemo(
    () => dashboardItems.map((i) => i.ticker).join(","),
    [dashboardItems]
  );

  useEffect(() => {
    if (!dashboardTickerKey || dashboardTickerKey === autoFetchedKeyRef.current) return;
    autoFetchedKeyRef.current = dashboardTickerKey;

    setDashboardAutoLoading(true);
    const tickers = dashboardTickerKey.split(",");
    fetchPrices(tickers)
      .then((results) => {
        setDashboardItems((prev) =>
          prev.map((item) => {
            const r = results.find((s) => s.ticker === item.ticker);
            if (!r) return item;
            return {
              ...item,
              name: r.name ?? item.name ?? KR_STOCK_NAMES[item.ticker],
              price: r.price,
              change:
                r.change_rate !== undefined
                  ? `${r.change_rate >= 0 ? "+" : ""}${r.change_rate.toFixed(1)}%`
                  : item.change,
            };
          })
        );
      })
      .catch((e) => console.error("[Dashboard] Auto-fetch failed:", e))
      .finally(() => setDashboardAutoLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardTickerKey]);

  // 시장 뉴스 로드 (5분마다 갱신)
  useEffect(() => {
    fetchMarketNews().then(setMarketNews);
    const id = setInterval(() => fetchMarketNews().then(setMarketNews), 300_000);
    return () => clearInterval(id);
  }, []);

  // AI 시장 해석 로드 (매일 8시 갱신 — 서버 캐시 의존)
  useEffect(() => {
    fetchMarketInsight().then((data) => { if (data) setMarketInsight(data); });
  }, []);

  // 분석 결과가 돌아오면 해당 종목 캐시 업데이트
  useEffect(() => {
    if (!screenResult) return;
    setDashboardItems((prev) =>
      prev.map((item) => {
        const r = screenResult.results.find((s) => s.ticker === item.ticker);
        if (!r) return item;
        return {
          ...item,
          name: r.name ?? item.name ?? KR_STOCK_NAMES[item.ticker],
          price: r.price,
          tag: r.sector ?? item.tag,
          change:
            r.change_rate !== undefined
              ? `${r.change_rate >= 0 ? "+" : ""}${r.change_rate.toFixed(1)}%`
              : item.change,
        };
      })
    );
  }, [screenResult]);



  // 탭 라우팅
  if (activeNav === "watchlist") return <WatchlistPage />;
  if (activeNav === "portfolio") return <PortfolioPage />;
  if (activeNav === "profile") return <ProfilePage />;

  const marketCards = [
    {
      label: "KOSPI",
      value: macro?.kospi
        ? macro.kospi.price.toLocaleString("ko-KR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "—",
      change: macro?.kospi
        ? `${macro.kospi.change_rate >= 0 ? "+" : ""}${macro.kospi.change_rate.toFixed(2)}%`
        : "—",
      positive: macro?.kospi ? macro.kospi.positive : true,
    },
    {
      label: "KOSDAQ",
      value: macro?.kosdaq
        ? macro.kosdaq.price.toLocaleString("ko-KR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "—",
      change: macro?.kosdaq
        ? `${macro.kosdaq.change_rate >= 0 ? "+" : ""}${macro.kosdaq.change_rate.toFixed(2)}%`
        : "—",
      positive: macro?.kosdaq ? macro.kosdaq.positive : false,
    },
    {
      label: "USD/KRW",
      value: macro?.usd_krw
        ? macro.usd_krw.price.toLocaleString("ko-KR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })
        : "—",
      change: macro?.usd_krw
        ? `${macro.usd_krw.change_rate >= 0 ? "+" : ""}${macro.usd_krw.change_rate.toFixed(2)}%`
        : "—",
      positive: macro?.usd_krw ? macro.usd_krw.positive : false,
    },
  ];

  const hasResult =
    !screenLoading && !screenError && screenResult && screenResult.results.length > 0;
  const showDashboard = !screenLoading && !screenResult && !screenError;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6 py-5 lg:px-8">

        {/* ── 헤더 ── */}
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge className="border-0 bg-slate-950 text-white">AI 투자 분석</Badge>
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                실시간 시장 컨텍스트 반영
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {hasResult && lastTicker ? `${lastTicker} 종목 AI 분석` : "오늘의 투자 대시보드"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {hasResult && lastTicker
                ? "거시경제 지표, 재무, 공시 데이터를 종합한 AI 분석 리포트입니다."
                : "종목 가격, 거시경제 지표, 뉴스 흐름을 한 화면에서 확인하고 AI 스코어로 우선순위를 정리합니다."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-10 bg-slate-950 px-4 text-white hover:bg-slate-800"
              onClick={() => clearResult?.()}
            >
              <Sparkles className="h-4 w-4" />
              새 분석 시작
            </Button>
          </div>
        </header>

        {/* ── 시장 지수 카드 ── */}
        <section className="grid gap-3 md:grid-cols-3">
          {marketCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">{card.label}</span>
                {card.change !== "—" && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
                      card.positive ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {card.positive ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {card.change}
                  </span>
                )}
              </div>
              <p className="mt-4 text-2xl font-bold text-slate-950">{card.value}</p>
            </div>
          ))}
        </section>

        {/* ── 분석 로딩 중 ── */}
        {screenLoading && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-slate-200 bg-white py-20 shadow-sm">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            <p className="text-sm font-semibold text-slate-500">
              <span className="font-bold text-slate-950">{lastTicker}</span> 종목을 AI가 분석
              중입니다...
            </p>
            <p className="text-xs text-slate-400">
              거시경제, 재무지표, 공시 데이터를 수집하고 있습니다.
            </p>
          </div>
        )}

        {/* ── 분석 에러 ── */}
        {!screenLoading && screenError && (
          <div className="flex items-start gap-4 rounded-lg border border-rose-100 bg-rose-50 p-5 shadow-sm">
            <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-500" />
            <div className="flex-1">
              <p className="font-semibold text-rose-700">분석 오류</p>
              <p className="mt-1 text-sm text-rose-600">{screenError}</p>
            </div>
            {lastTicker && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-rose-200 text-rose-700 hover:bg-rose-100"
                onClick={() => handleTickerSearch?.(lastTicker)}
              >
                다시 시도
              </Button>
            )}
          </div>
        )}

        {/* ── 종목 분석 결과 ── */}
        {hasResult && (
          <main className="space-y-6">
            {screenResult!.results.map((item) => (
              <StockScreenCard key={item.ticker} item={item} />
            ))}
          </main>
        )}

        {/* ── 기본 대시보드 (검색 전) ── */}
        {showDashboard && (
          <main className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-6">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                      <BrainCircuit className="h-5 w-5 text-slate-700" />
                      AI 추천 우선순위
                      {dashboardAutoLoading && (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      )}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {dashboardAutoLoading
                        ? "AI가 실시간으로 데이터를 불러오는 중입니다..."
                        : "관심 종목을 점수와 리스크 기준으로 정렬했습니다."}
                    </p>
                  </div>
                  <StockSearchBox
                    onSelect={(ticker) => handleTickerSearch?.(ticker)}
                    loading={screenLoading}
                    placeholder="예: 삼성, 005930"
                    showLabel={false}
                    className="w-full max-w-sm"
                  />
                </div>

                <div className="divide-y divide-slate-100">
                  {dashboardItems.length === 0 ? (
                    <p className="p-6 text-sm text-slate-400">
                      관심 종목 탭에서 종목을 추가하면 여기에 표시됩니다.
                    </p>
                  ) : (
                    dashboardItems.map((item) => {
                      const isPositive = item.change?.startsWith("+");
                      return (
                        <button
                          key={item.ticker}
                          type="button"
                          onClick={() => handleTickerSearch?.(item.ticker)}
                          className="grid w-full gap-4 p-5 text-left transition-colors hover:bg-slate-50 md:grid-cols-[1fr_130px_110px]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.name && (
                                <span className="text-base font-bold text-slate-950">{item.name}</span>
                              )}
                              <span className={`text-sm font-semibold ${item.name ? "text-slate-400" : "text-base font-bold text-slate-950"}`}>
                                {item.ticker}
                              </span>
                              {item.tag && (
                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                                  {item.tag}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              클릭하면 AI 분석을 실행합니다.
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-slate-400">현재가</p>
                            {item.price ? (
                              <p className="mt-1 text-sm font-bold text-slate-950">
                                {item.price.toLocaleString("ko-KR")}원
                              </p>
                            ) : dashboardAutoLoading ? (
                              <Loader2 className="mt-1.5 h-4 w-4 animate-spin text-slate-300" />
                            ) : (
                              <p className="mt-1 text-sm text-slate-400">—</p>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-slate-400">등락률</p>
                            {item.change ? (
                              <p className={`mt-1 text-sm font-bold ${isPositive ? "text-rose-600" : "text-blue-600"}`}>
                                {item.change}
                              </p>
                            ) : dashboardAutoLoading ? (
                              <Loader2 className="mt-1.5 h-4 w-4 animate-spin text-slate-300" />
                            ) : (
                              <p className="mt-1 text-sm text-slate-400">—</p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-950">
                      <MessageSquare className="h-5 w-5 text-slate-700" />
                      AI 종목 추천
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      내 투자 설정 기반으로 AI가 지금 유망한 종목을 추천해 드립니다.
                    </p>
                  </div>
                  <Button
                    onClick={handleRecommend}
                    disabled={recommendLoading}
                    className="shrink-0 bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {recommendLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {recommendLoading ? "분석 중..." : "추천 받기"}
                  </Button>
                </div>

                {recommendation && (
                  <div className="mt-5 space-y-4">
                    <div className="flex gap-3 rounded-xl bg-slate-950 p-4">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
                        <Sparkles className="h-3.5 w-3.5 text-white" />
                      </div>
                      <p className="text-sm leading-6 text-slate-200">{recommendation.message}</p>
                    </div>

                    <div className="space-y-2">
                      {recommendation.stocks.map((stock) => (
                        <button
                          key={stock.ticker}
                          type="button"
                          onClick={() => handleTickerSearch?.(stock.ticker)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-950">{stock.name}</span>
                              <span className="text-xs text-slate-400">{stock.ticker}</span>
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                                {stock.sector}
                              </span>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                stock.signal === "BUY"
                                  ? "bg-rose-50 text-rose-600"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {stock.signal}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{stock.reason}</p>
                          <p className="mt-1.5 text-xs font-medium text-slate-400">
                            상세 AI 분석 보기 →
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">시장 해석</h2>
                  <LineChart className="h-5 w-5 text-slate-300" />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {marketInsight?.interpretation ?? "거시경제 데이터를 AI가 분석 중입니다..."}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white/10 p-3">
                    <p className="text-xs text-slate-300">위험 신호</p>
                    <p className="mt-1 text-base font-bold leading-tight">
                      {marketInsight?.risk_appetite ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/10 p-3">
                    <p className="text-xs text-slate-300">추천 비중</p>
                    <p className="mt-1 text-xl font-bold">
                      {marketInsight ? `${marketInsight.recommended_weight}%` : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-white/10 p-3">
                  <p className="text-xs text-slate-300 mb-2">추천 섹터</p>
                  {marketInsight?.sectors?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {[...marketInsight.sectors]
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 4)
                        .map(({ name, score }) => (
                          <span
                            key={name}
                            className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white"
                          >
                            {name} {score}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">—</p>
                  )}
                </div>
                {marketInsight?.generated_at && (
                  <p className="mt-3 text-xs text-slate-500">
                    AI 분석 기준: {new Date(marketInsight.generated_at).toLocaleDateString("ko-KR")}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                  <TrendingUp className="h-5 w-5" />
                  실시간 시장 뉴스
                </h2>
                <div className="mt-4 space-y-2">
                  {marketNews.length > 0 ? (
                    marketNews.map((article, i) => (
                      <a
                        key={i}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex gap-3 rounded-lg bg-slate-50 p-3 hover:bg-slate-100 transition-colors"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0">
                          <p className="text-sm leading-5 text-slate-700 line-clamp-2">{article.title}</p>
                          <p className="mt-1 text-xs text-slate-400">{article.source}</p>
                        </div>
                      </a>
                    ))
                  ) : (
                    signals.map((signal) => (
                      <div key={signal} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="text-sm leading-6 text-slate-600">{signal}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                  <Layers className="h-5 w-5" />
                  섹터 탐색
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.keys(SECTOR_STOCKS).map((sector) => (
                    <button
                      key={sector}
                      onClick={() => setSelectedSector((s) => (s === sector ? null : sector))}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        selectedSector === sector
                          ? "bg-slate-950 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {sector}
                      {selectedSector === sector ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                  ))}
                </div>
                {selectedSector && (
                  <div className="mt-3 space-y-1">
                    {SECTOR_STOCKS[selectedSector].map(({ ticker, name }) => (
                      <button
                        key={ticker}
                        onClick={() => handleTickerSearch?.(ticker)}
                        className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 text-left transition-colors hover:bg-slate-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-950">{name}</span>
                          <span className="text-xs text-slate-400">{ticker}</span>
                        </div>
                        <span className="text-xs font-medium text-slate-400">AI 분석 →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                  <BarChart3 className="h-5 w-5" />
                  다음 액션
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  좌측 사이드바 검색창에 종목 코드를 입력하면 AI가 실시간으로 분석 리포트를
                  생성합니다.
                </p>
              </div>
            </aside>
          </main>
        )}
      </div>
    </div>
  );
}
