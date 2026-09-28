"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  Plus,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchMarketNews, fetchMarketInsight, fetchPrices, fetchRecommendation } from "@/lib/api";
import type { MarketInsight, RecommendResult } from "@/lib/api";
import { StockScreenCard } from "@/components/StockScreenCard";
import { WatchlistPage } from "@/components/WatchlistPage";
import { ProfilePage } from "@/components/ProfilePage";
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

/** 상승/하락 통일 표기 (한국 증시 규칙: 상승 레드 / 하락 블루) */
function ChangePill({ change, positive, size = "sm" }: { change: string; positive: boolean; size?: "sm" | "md" }) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md font-bold tabular-nums",
        size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[11px]",
        positive ? "bg-up-soft text-up" : "bg-down-soft text-down"
      )}
    >
      <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {change}
    </span>
  );
}

export default function Page() {
  const [dashboardItems, setDashboardItems] = useState<DashboardItem[]>(SAMPLE_ITEMS);
  const [dashboardAutoLoading, setDashboardAutoLoading] = useState(false);
  const [marketNews, setMarketNews] = useState<NewsArticle[]>([]);
  const [marketInsight, setMarketInsight] = useState<MarketInsight | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendResult | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
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

  const loadDashboardPrices = useCallback(
    async (tickers: string[], isFirst: boolean) => {
      if (isFirst) setDashboardAutoLoading(true);
      try {
        const results = await fetchPrices(tickers);
        if (results.length === 0) return;
        setDashboardItems((prev) =>
          prev.map((item) => {
            const r = results.find((s) => s.ticker === item.ticker);
            if (!r) return item;
            return {
              ...item,
              name: r.name ?? item.name ?? KR_STOCK_NAMES[item.ticker],
              price: r.price,
              change:
                r.change_rate != null
                  ? `${r.change_rate >= 0 ? "+" : ""}${r.change_rate.toFixed(1)}%`
                  : item.change,
            };
          })
        );
      } catch (e) {
        console.error("[Dashboard] Price fetch failed:", e);
      } finally {
        if (isFirst) setDashboardAutoLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!dashboardTickerKey) return;
    const tickers = dashboardTickerKey.split(",");
    loadDashboardPrices(tickers, true);
    const id = setInterval(() => loadDashboardPrices(tickers, false), 30_000);
    return () => clearInterval(id);
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
            r.change_rate != null
              ? `${r.change_rate >= 0 ? "+" : ""}${r.change_rate.toFixed(1)}%`
              : item.change,
        };
      })
    );
  }, [screenResult]);



  // 탭 라우팅
  if (activeNav === "watchlist") return <WatchlistPage />;
  if (activeNav === "profile") return <ProfilePage />;

  const marketCards = [
    {
      label: "KOSPI",
      value: macro?.kospi
        ? macro.kospi.price.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—",
      change: macro?.kospi ? `${macro.kospi.change_rate >= 0 ? "+" : ""}${macro.kospi.change_rate.toFixed(2)}%` : "—",
      positive: macro?.kospi ? macro.kospi.positive : true,
    },
    {
      label: "KOSDAQ",
      value: macro?.kosdaq
        ? macro.kosdaq.price.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—",
      change: macro?.kosdaq ? `${macro.kosdaq.change_rate >= 0 ? "+" : ""}${macro.kosdaq.change_rate.toFixed(2)}%` : "—",
      positive: macro?.kosdaq ? macro.kosdaq.positive : false,
    },
    {
      label: "USD/KRW",
      value: macro?.usd_krw
        ? macro.usd_krw.price.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : "—",
      change: macro?.usd_krw ? `${macro.usd_krw.change_rate >= 0 ? "+" : ""}${macro.usd_krw.change_rate.toFixed(2)}%` : "—",
      positive: macro?.usd_krw ? macro.usd_krw.positive : false,
    },
  ];

  const usMarketCards = [
    {
      label: "S&P 500",
      value: macro?.sp500
        ? macro.sp500.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—",
      change: macro?.sp500 ? `${macro.sp500.change_rate >= 0 ? "+" : ""}${macro.sp500.change_rate.toFixed(2)}%` : "—",
      positive: macro?.sp500 ? macro.sp500.positive : true,
    },
    {
      label: "NASDAQ",
      value: macro?.nasdaq
        ? macro.nasdaq.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—",
      change: macro?.nasdaq ? `${macro.nasdaq.change_rate >= 0 ? "+" : ""}${macro.nasdaq.change_rate.toFixed(2)}%` : "—",
      positive: macro?.nasdaq ? macro.nasdaq.positive : false,
    },
    {
      label: "Dow Jones",
      value: macro?.dji
        ? macro.dji.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—",
      change: macro?.dji ? `${macro.dji.change_rate >= 0 ? "+" : ""}${macro.dji.change_rate.toFixed(2)}%` : "—",
      positive: macro?.dji ? macro.dji.positive : false,
    },
  ];

  const hasResult =
    !screenLoading && !screenError && screenResult && screenResult.results.length > 0;
  const showDashboard = !screenLoading && !screenResult && !screenError;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 lg:px-8 lg:py-7">

        {/* ── 헤더 ── */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-slate-900 sm:text-[28px]">
              {hasResult && lastTicker ? `${lastTicker} 종목 AI 분석` : "오늘의 투자 대시보드"}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
              {hasResult && lastTicker
                ? "거시경제 지표, 재무, 공시 데이터를 종합한 AI 분석 리포트입니다."
                : "종목 가격, 거시경제 지표, 뉴스 흐름을 한 화면에서 확인하고 AI 스코어로 우선순위를 정리합니다."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-10 rounded-lg px-4"
              onClick={() => clearResult?.()}
            >
              <Plus className="h-4 w-4" />
              새 분석 시작
            </Button>
          </div>
        </header>

        {/* ── 시장 지수 카드 ── */}
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
          {marketCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200/80 bg-card p-3.5 shadow-card sm:p-4">
              <p className="text-xs font-semibold text-slate-400">{card.label}</p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="text-lg font-bold tabular-nums text-slate-900 sm:text-xl">{card.value}</p>
                {card.change !== "—" && <ChangePill change={card.change} positive={card.positive} />}
              </div>
            </div>
          ))}
          {usMarketCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200/60 bg-white/70 p-3.5 sm:p-4">
              <p className="text-xs font-semibold text-slate-400">{card.label}</p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="text-lg font-bold tabular-nums text-slate-600 sm:text-xl">{card.value}</p>
                {card.change !== "—" && <ChangePill change={card.change} positive={card.positive} />}
              </div>
            </div>
          ))}
        </section>

        {/* ── 분석 로딩 중 ── */}
        {screenLoading && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200/80 bg-card py-20 shadow-card">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">
                <span className="font-bold text-primary">{lastTicker}</span> 종목을 AI가 분석 중입니다...
              </p>
              <p className="mt-1 text-xs text-slate-400">
                거시경제, 재무지표, 공시 데이터를 수집하고 있습니다.
              </p>
            </div>
          </div>
        )}

        {/* ── 분석 에러 ── */}
        {!screenLoading && screenError && (
          <div className="flex items-start gap-4 rounded-xl border border-rose-200 bg-up-soft p-5">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="flex-1">
              <p className="font-bold text-rose-700">분석 오류</p>
              <p className="mt-1 text-sm leading-6 text-rose-600">{screenError}</p>
            </div>
            {lastTicker && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
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
          <main className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-6">
              <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-card">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      AI 추천 우선순위
                      {dashboardAutoLoading && (
                        <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-slate-300" />
                      )}
                    </h2>
                    <p className="mt-1 text-[13px] leading-5 text-slate-500">
                      {dashboardAutoLoading
                        ? "AI가 실시간으로 데이터를 불러오는 중입니다..."
                        : "관심 종목을 점수와 리스크 기준으로 정렬했습니다. 종목을 클릭하면 AI 분석이 시작됩니다."}
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
                          className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_130px_100px_28px]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.name && (
                                <span className="text-[15px] font-bold text-slate-900">{item.name}</span>
                              )}
                              <span
                                className={cn(
                                  "rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold",
                                  item.name ? "text-slate-500" : "text-slate-900"
                                )}
                              >
                                {item.ticker}
                              </span>
                              {item.tag && (
                                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                  {item.tag}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 모바일: 우측 정렬 */}
                          <div className="flex flex-col items-end justify-center sm:hidden">
                            {item.price ? (
                              <p className="text-sm font-bold tabular-nums text-slate-900">
                                {item.price.toLocaleString("ko-KR")}원
                              </p>
                            ) : dashboardAutoLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />
                            ) : (
                              <p className="text-sm text-slate-400">—</p>
                            )}
                            {item.change && (
                              <p
                                className={cn(
                                  "mt-0.5 text-xs font-bold tabular-nums",
                                  isPositive ? "text-up" : "text-down"
                                )}
                              >
                                {item.change}
                              </p>
                            )}
                          </div>

                          {/* 데스크톱: 현재가 */}
                          <div className="hidden text-right sm:block">
                            {item.price ? (
                              <p className="text-sm font-bold tabular-nums text-slate-900">
                                {item.price.toLocaleString("ko-KR")}원
                              </p>
                            ) : dashboardAutoLoading ? (
                              <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-slate-300" />
                            ) : (
                              <p className="text-sm text-slate-400">—</p>
                            )}
                          </div>

                          {/* 데스크톱: 등락률 */}
                          <div className="hidden text-right sm:block">
                            {item.change ? (
                              <p
                                className={cn(
                                  "text-sm font-bold tabular-nums",
                                  isPositive ? "text-up" : "text-down"
                                )}
                              >
                                {item.change}
                              </p>
                            ) : dashboardAutoLoading ? (
                              <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-slate-300" />
                            ) : (
                              <p className="text-sm text-slate-400">—</p>
                            )}
                          </div>

                          <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-card p-5 shadow-card">
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">AI 종목 추천</h2>
                    <p className="mt-1 text-[13px] leading-5 text-slate-500">
                      내 투자 설정 기반으로 AI가 지금 유망한 종목을 추천합니다.
                    </p>
                  </div>
                  <Button
                    onClick={handleRecommend}
                    disabled={recommendLoading}
                    className="w-full shrink-0 rounded-lg disabled:opacity-60 sm:w-auto"
                  >
                    {recommendLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lightbulb className="h-4 w-4" />
                    )}
                    {recommendLoading ? "분석 중..." : "추천 받기"}
                  </Button>
                </div>

                {recommendation && (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-xl border border-emerald-200/70 bg-accent p-4">
                      <p className="text-sm leading-6 text-accent-foreground">{recommendation.message}</p>
                    </div>

                    <p className="text-xs leading-5 text-slate-400">
                      ※ 아래 시그널은 기초 재무 지표(PER·PBR·ROE) 기반 예비 추천입니다. 클릭하면 뉴스·기술 지표를 포함한 종합 AI 분석을 확인할 수 있습니다.
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {recommendation.stocks.map((stock) => (
                        <button
                          key={stock.ticker}
                          type="button"
                          onClick={() => handleTickerSearch?.(stock.ticker)}
                          className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-emerald-300 hover:bg-emerald-50/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-bold text-slate-900">{stock.name}</span>
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500">
                                {stock.ticker}
                              </span>
                              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                {stock.sector}
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                              AI 추천
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{stock.reason}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-400 transition-colors group-hover:text-primary">
                            종합 AI 분석 확인 →
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              {/* 시장 해석 */}
              <section className="relative overflow-hidden rounded-xl bg-ink p-5 text-white shadow-card">
                <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-50" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold">시장 해석</h2>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-emerald-200/90">
                      AI 데일리 브리핑
                    </span>
                  </div>
                  <p className="mt-3 min-h-[84px] text-[13px] leading-6 text-slate-200/90">
                    {marketInsight?.interpretation ?? "거시경제 데이터를 AI가 분석 중입니다..."}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-white/[0.08] p-3">
                      <p className="text-[11px] font-medium text-slate-300/80">위험 신호</p>
                      <p className="mt-1 text-[15px] font-bold leading-tight">
                        {marketInsight?.risk_appetite ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/[0.08] p-3">
                      <p className="text-[11px] font-medium text-slate-300/80">추천 비중</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">
                        {marketInsight ? `${marketInsight.recommended_weight}%` : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 rounded-xl bg-white/[0.08] p-3">
                    <p className="mb-2 text-[11px] font-medium text-slate-300/80">추천 섹터</p>
                    {marketInsight?.sectors?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {[...marketInsight.sectors]
                          .sort((a, b) => b.score - a.score)
                          .slice(0, 4)
                          .map(({ name, score }) => (
                            <span
                              key={name}
                              className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white"
                            >
                              {name}{" "}
                              <span className="tabular-nums text-emerald-300/90">{score}</span>
                            </span>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">—</p>
                    )}
                  </div>
                  {marketInsight?.generated_at && (
                    <p className="mt-3 text-[11px] text-slate-400">
                      AI 분석 기준: {new Date(marketInsight.generated_at).toLocaleDateString("ko-KR")}
                    </p>
                  )}
                </div>
              </section>

              {/* 실시간 시장 뉴스 */}
              <div className="rounded-xl border border-slate-200/80 bg-card p-5 shadow-card">
                <h2 className="text-base font-bold text-slate-900">실시간 시장 뉴스</h2>
                <div className="mt-3 space-y-1">
                  {marketNews.length > 0 ? (
                    marketNews.map((article, i) => (
                      <a
                        key={i}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-slate-50"
                      >
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 transition-colors group-hover:bg-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium leading-6 text-slate-700 line-clamp-2 group-hover:text-slate-900">
                            {article.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{article.source}</p>
                        </div>
                        <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    ))
                  ) : (
                    signals.map((signal) => (
                      <div key={signal} className="flex items-start gap-3 rounded-lg p-2.5">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <p className="text-[13px] leading-6 text-slate-600">{signal}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 섹터 탐색 */}
              <div className="rounded-xl border border-slate-200/80 bg-card p-5 shadow-card">
                <h2 className="text-base font-bold text-slate-900">섹터 탐색</h2>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {Object.keys(SECTOR_STOCKS).map((sector) => {
                    const selected = selectedSector === sector;
                    return (
                      <button
                        key={sector}
                        onClick={() => setSelectedSector((s) => (s === sector ? null : sector))}
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          selected
                            ? "border-primary bg-primary text-white shadow-card"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                        )}
                      >
                        {sector}
                        {selected ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedSector && (
                  <div className="mt-3 space-y-1">
                    {SECTOR_STOCKS[selectedSector].map(({ ticker, name }) => (
                      <button
                        key={ticker}
                        onClick={() => handleTickerSearch?.(ticker)}
                        className="group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{name}</span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500">
                            {ticker}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-400 transition-colors group-hover:text-primary">
                          AI 분석 →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </main>
        )}
      </div>
    </div>
  );
}
