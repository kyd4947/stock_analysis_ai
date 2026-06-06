"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, BrainCircuit, ChevronRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StockScreenResult } from "@/lib/api";

type StockScreenCardProps = {
  item: StockScreenResult;
  compact?: boolean;
  onSelect?: () => void;
};

function scoreMeta(score: number) {
  if (score >= 0.8) return { label: "High", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
  if (score >= 0.6) return { label: "Medium", className: "bg-amber-50 text-amber-700 border-amber-100" };
  return { label: "Low", className: "bg-rose-50 text-rose-700 border-rose-100" };
}

export function StockScreenCard({ item, compact = false, onSelect }: StockScreenCardProps) {
  const score = scoreMeta(item.score);
  const scorePercent = Math.round(item.score * 100);
  const isPositive = (item.change_rate ?? 0) >= 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="group w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-slate-950">{item.ticker}</p>
              <Badge variant="outline" className={`text-[11px] font-bold ${score.className}`}>
                {scorePercent} · {score.label}
              </Badge>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">{item.sector || "종목 정보"}</p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{item.summary}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-700" />
        </div>
      </button>
    );
  }

  return (
    <Card className="rounded-lg border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate text-2xl font-bold tracking-tight text-slate-950">{item.ticker}</CardTitle>
            <CardDescription className="mt-1 text-sm font-medium text-slate-500">
              {item.sector || "종목 정보"}
            </CardDescription>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-baseline justify-end gap-1 text-2xl font-bold text-slate-950">
              {item.price?.toLocaleString("ko-KR") ?? "-"}
              <span className="text-sm font-medium text-slate-400">원</span>
            </div>
            {item.change_rate !== undefined && (
              <div
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  isPositive ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                }`}
              >
                {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {isPositive ? "+" : ""}
                {item.change_rate}%
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <BrainCircuit className="h-4 w-4" />
              AI 분석 요약
            </h3>
            <Badge variant="outline" className={`text-xs font-bold ${score.className}`}>
              AI Score {scorePercent}% · {score.label}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-slate-600">{item.summary}</p>
        </section>

        {item.macro && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
              <BarChart3 className="h-4 w-4" />
              거시경제 지표
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
              <span>환율: <strong>{item.macro.exchange_rate_usdkrw}</strong></span>
              <span>한국 금리: <strong>{item.macro.policy_rate}%</strong></span>
              <span>물가 YoY: <strong>{item.macro.inflation_yoy}%</strong></span>
              {item.macro.fed_funds_rate && <span>미국 금리: <strong>{item.macro.fed_funds_rate}%</strong></span>}
            </div>
          </section>
        )}

        {item.financial && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
              <Info className="h-4 w-4" />
              재무 지표
            </h3>
            <div className="grid grid-cols-3 gap-2 text-sm text-slate-600">
              <span>PER <strong>{item.financial.per}</strong></span>
              <span>PBR <strong>{item.financial.pbr}</strong></span>
              <span>ROE <strong>{item.financial.roe}%</strong></span>
            </div>
          </section>
        )}

        {item.reasons.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
              <BrainCircuit className="h-4 w-4" />
              분석 근거
            </h3>
            <ul className="space-y-2">
              {item.reasons.map((reason, index) => (
                <li key={`${item.ticker}-reason-${index}`} className="flex gap-2 text-sm leading-6 text-slate-600">
                  <span className="font-bold text-slate-400">{index + 1}.</span>
                  {reason}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
