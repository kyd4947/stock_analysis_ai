"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StockSearchBox } from "@/components/StockSearchBox";
import { useSearchContext } from "@/app/layout";

type WatchlistItem = {
  ticker: string;
  addedAt: string;
  lastScore?: number;
  lastPrice?: number;
  lastSector?: string;
};

function scoreMeta(score: number) {
  if (score >= 0.8) return { label: "High", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
  if (score >= 0.6) return { label: "Med", className: "bg-amber-50 text-amber-700 border-amber-100" };
  return { label: "Low", className: "bg-rose-50 text-rose-700 border-rose-100" };
}

export function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [analyzingTicker, setAnalyzingTicker] = useState<string | null>(null);
  const { handleTickerSearch, setLastTicker, screenResult, screenLoading } = useSearchContext();

  useEffect(() => {
    const saved = localStorage.getItem("watchlist");
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // 분석 결과가 돌아오면 해당 ticker의 캐시 업데이트
  useEffect(() => {
    if (!screenLoading && screenResult && analyzingTicker) {
      const result = screenResult.results.find((r) => r.ticker === analyzingTicker);
      if (result) {
        updateItem(analyzingTicker, {
          lastScore: result.score,
          lastPrice: result.price,
          lastSector: result.sector,
        });
      }
      setAnalyzingTicker(null);
    }
  }, [screenResult, screenLoading, analyzingTicker]);

  function save(updated: WatchlistItem[]) {
    setItems(updated);
    localStorage.setItem("watchlist", JSON.stringify(updated));
  }

  function updateItem(ticker: string, patch: Partial<WatchlistItem>) {
    setItems((prev) => {
      const updated = prev.map((i) => (i.ticker === ticker ? { ...i, ...patch } : i));
      localStorage.setItem("watchlist", JSON.stringify(updated));
      return updated;
    });
  }

  function addTicker(ticker: string) {
    if (!ticker || items.some((i) => i.ticker === ticker)) return;
    save([...items, { ticker, addedAt: new Date().toISOString() }]);
  }

  function removeTicker(ticker: string) {
    save(items.filter((i) => i.ticker !== ticker));
  }

  async function analyze(ticker: string) {
    setAnalyzingTicker(ticker);
    setLastTicker?.(ticker);
    await handleTickerSearch?.(ticker);
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5 px-4 py-5 sm:px-6 lg:py-7">

        <header>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900 sm:text-[28px]">내 관심 종목</h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            추적하고 싶은 종목을 저장하고 원클릭으로 AI 분석을 실행합니다.
          </p>
        </header>

        <StockSearchBox
          onSelect={addTicker}
          loading={false}
          placeholder="종목명 또는 코드로 검색 (예: 삼성전자, 005930)"
          showLabel={false}
          className="w-full"
        />

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200/80 bg-card py-16 shadow-card sm:py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
              <Star className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-bold text-slate-700">관심 종목이 없습니다</p>
            <p className="text-xs text-slate-400">위 검색창에서 종목을 추가해보세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-card">
            {items.map((item) => {
              const isAnalyzing = analyzingTicker === item.ticker && screenLoading;
              const meta = item.lastScore !== undefined ? scoreMeta(item.lastScore) : null;
              return (
                <div
                  key={item.ticker}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1.5 font-mono text-sm font-semibold text-slate-600">
                      {item.ticker}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.lastSector && (
                          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            {item.lastSector}
                          </span>
                        )}
                        {meta && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-bold ${meta.className}`}
                          >
                            {Math.round(item.lastScore! * 100)}점 · {meta.label}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                        <span>{new Date(item.addedAt).toLocaleDateString("ko-KR")} 추가</span>
                        {item.lastPrice && (
                          <span className="font-semibold tabular-nums text-slate-600">
                            {item.lastPrice.toLocaleString("ko-KR")}원
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => analyze(item.ticker)}
                      disabled={isAnalyzing || screenLoading}
                      className="h-8 rounded-lg px-3 text-xs font-semibold"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {isAnalyzing ? "분석 중..." : "AI 분석"}
                    </Button>
                    <a
                      href={`https://finance.naver.com/item/main.naver?code=${item.ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="네이버 금융에서 보기"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                        type="button"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTicker(item.ticker)}
                      className="h-8 w-8 shrink-0 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
