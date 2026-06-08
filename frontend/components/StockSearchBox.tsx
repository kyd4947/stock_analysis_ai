"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchStocks } from "@/lib/api";

type SearchResult = { ticker: string; name: string };

type Props = {
  onSelect: (ticker: string) => void;
  loading?: boolean;
  placeholder?: string;
  dropUp?: boolean;
  className?: string;
  showLabel?: boolean;
};

export function StockSearchBox({
  onSelect,
  loading,
  placeholder = "종목명 또는 티커 입력",
  dropUp = false,
  className,
  showLabel = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchStocks(query.trim());
        setResults(data);
        setOpen(data.length > 0);
        setFocusedIdx(-1);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (result: SearchResult) => {
    setQuery("");
    setOpen(false);
    onSelect(result.ticker);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (focusedIdx >= 0 && results[focusedIdx]) {
      select(results[focusedIdx]);
    } else if (results.length > 0) {
      select(results[0]);
    } else if (query.trim()) {
      const raw = query.trim();
      setQuery("");
      onSelect(raw);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit} className="space-y-1.5">
        {showLabel && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Search className="h-3.5 w-3.5" />
            종목 빠른 검색
          </label>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="h-10 border-slate-200 bg-white text-sm shadow-sm focus-visible:ring-slate-400"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-slate-400" />
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={loading || !query.trim()}
            className="h-10 w-10 shrink-0 bg-slate-950 text-white hover:bg-slate-800"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>

      {open && results.length > 0 && (
        <div
          className={cn(
            "absolute left-0 right-0 z-50 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl",
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {results.map((r, i) => (
            <button
              key={r.ticker}
              type="button"
              onMouseDown={() => select(r)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors",
                i === focusedIdx ? "bg-slate-100" : "hover:bg-slate-50",
                i !== results.length - 1 && "border-b border-slate-100"
              )}
            >
              <span className="text-sm font-semibold text-slate-950">{r.name}</span>
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
                {r.ticker}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
