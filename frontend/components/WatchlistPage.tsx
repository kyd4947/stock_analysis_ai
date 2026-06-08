"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, Search, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [input, setInput] = useState("");
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

  function addTicker(e: React.FormEvent) {
    e.preventDefault();
    const ticker = input.trim().toUpperCase();
    if (!ticker || items.some((i) => i.ticker === ticker)) {
      setInput("");
      return;
    }
    save([...items, { ticker, addedAt: new Date().toISOString() }]);
    setInput("");
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
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-5">

        <header className="border-b border-slate-200 pb-5">
          <div className="mb-2 flex items-center gap-2">
            <Badge className="border-0 bg-slate-950 text-white">관심 종목</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">내 관심 종목</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            추적하고 싶은 종목을 저장하고 원클릭으로 AI 분석을 실행합니다.
          </p>
        </header>

        <form onSubmit={addTicker} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="종목 코드 입력 (예: 005930)"
            className="h-10 border-slate-200 bg-white"
          />
          <Button
            type="submit"
            className="h-10 shrink-0 bg-slate-950 px-4 text-white hover:bg-slate-800"
            disabled={!input.trim()}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            추가
          </Button>
        </form>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white py-20 shadow-sm">
            <Star className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">관심 종목이 없습니다</p>
            <p className="text-xs text-slate-400">위에서 종목 코드를 입력해 추가하세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
            {items.map((item) => {
              const isAnalyzing = analyzingTicker === item.ticker && screenLoading;
              const meta = item.lastScore !== undefined ? scoreMeta(item.lastScore) : null;
              return (
                <div
                  key={item.ticker}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                      {item.ticker.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-bold text-slate-950">{item.ticker}</p>
                        {item.lastSector && (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-white text-xs text-slate-500"
                          >
                            {item.lastSector}
                          </Badge>
                        )}
                        {meta && (
                          <Badge
                            variant="outline"
                            className={`text-xs font-bold ${meta.className}`}
                          >
                            {Math.round(item.lastScore! * 100)}점 · {meta.label}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                        <span>{new Date(item.addedAt).toLocaleDateString("ko-KR")} 추가</span>
                        {item.lastPrice && (
                          <span className="font-medium text-slate-600">
                            {item.lastPrice.toLocaleString("ko-KR")}원
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => analyze(item.ticker)}
                      disabled={isAnalyzing || screenLoading}
                      className="h-8 border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                      )}
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
                        className="h-8 w-8 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                        type="button"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTicker(item.ticker)}
                      className="h-8 w-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
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
