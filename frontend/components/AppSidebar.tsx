"use client";

import React from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Landmark,
  LineChart,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  Settings2,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MacroSnapshot } from "@/lib/api";

export type NavItem = "analysis" | "watchlist" | "portfolio" | "profile";

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  tickerInput: string;
  onTickerInputChange: (value: string) => void;
  onTickerSearch: (e: React.FormEvent) => void;
  searchLoading: boolean;
  macro: MacroSnapshot | null;
  macroLoading: boolean;
  macroError?: boolean;
};

const NAV_ITEMS: { id: NavItem; label: string; helper: string; icon: React.ElementType }[] = [
  { id: "analysis", label: "실시간 분석", helper: "종목과 거시지표", icon: LineChart },
  { id: "watchlist", label: "관심 종목", helper: "추적 리스트", icon: Star },
  { id: "portfolio", label: "내 포트폴리오", helper: "보유 종목 현황", icon: Wallet },
];

function formatNumber(value?: number, digits = 1) {
  if (value === undefined || value === null) return "-";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function MacroPanel({
  macro,
  loading,
  error,
  compact,
}: {
  macro: MacroSnapshot | null;
  loading: boolean;
  error?: boolean;
  compact?: boolean;
}) {
  const rows = [
    {
      label: "USD/KRW",
      value: formatNumber(macro?.usd_krw?.price ?? macro?.exchange_rate_usdkrw),
      unit: "원",
      icon: DollarSign,
    },
    {
      label: "한국 기준금리",
      value: macro?.policy_rate?.toFixed(2) ?? "-",
      unit: "%",
      icon: Landmark,
    },
    {
      label: "미국 기준금리",
      value: macro?.fed_funds_rate?.toFixed(2) ?? "-",
      unit: "%",
      icon: BarChart3,
    },
  ];

  if (compact) {
    return (
      <div className="space-y-2 border-t border-slate-200/70 px-2 py-3">
        {rows.map((row) => (
          <div
            key={row.label}
            title={error ? `${row.label}: API 연결 안 됨` : `${row.label}: ${row.value}${row.unit}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <row.icon className="h-4 w-4" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="mx-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">시장 스냅샷</p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            error ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
          )}
        >
          {error ? "API OFF" : "Live"}
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <row.icon className="h-4 w-4" />
              </div>
              <span className="truncate text-xs font-medium text-slate-500">{row.label}</span>
            </div>
            <div className="flex items-baseline gap-1 text-sm font-bold text-slate-900">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : error ? "-" : row.value}
              {!loading && !error && <span className="text-[11px] font-medium text-slate-400">{row.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  activeNav,
  onNavChange,
  tickerInput,
  onTickerInputChange,
  onTickerSearch,
  searchLoading,
  macro,
  macroLoading,
  macroError,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-slate-200 bg-slate-50/95 shadow-[1px_0_0_rgba(15,23,42,0.03)] transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-[292px]"
      )}
    >
      <button
        type="button"
        onClick={() => onNavChange("analysis")}
        className={cn("flex w-full items-center gap-3 px-3 py-4 transition-opacity hover:opacity-75", collapsed && "justify-center")}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0 text-left">
            <h1 className="truncate text-sm font-bold text-slate-950">Stock Analysis AI</h1>
            <p className="text-xs text-slate-500">거시경제 기반 투자 분석</p>
          </div>
        )}
      </button>

      <div className={cn("px-3", collapsed && "px-2")}>
        <Button
          type="button"
          variant="outline"
          onClick={onToggleCollapse}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className={cn(
            "h-9 w-full border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-100",
            collapsed ? "px-0" : "justify-between px-3"
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <span className="text-xs font-semibold">작업 공간</span>}
          {!collapsed && <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <nav className={cn("mt-4 space-y-1 px-3", collapsed && "px-2")}>
        {!collapsed && <p className="px-2 pb-1 text-[11px] font-semibold uppercase text-slate-400">Menu</p>}
        {NAV_ITEMS.map(({ id, label, helper, icon: Icon }) => {
          const active = activeNav === id;
          return (
            <button
              key={id}
              type="button"
              title={collapsed ? label : undefined}
              onClick={() => onNavChange(id)}
              className={cn(
                "group flex w-full items-center rounded-lg text-left transition-colors",
                collapsed ? "h-10 justify-center px-0" : "h-12 gap-3 px-3",
                active
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-slate-500")} />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{label}</span>
                    <span className={cn("block truncate text-xs", active ? "text-slate-300" : "text-slate-400")}>
                      {helper}
                    </span>
                  </span>
                  {active ? <ChevronRight className="h-4 w-4 text-slate-300" /> : null}
                </>
              )}
            </button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1" />

      <MacroPanel macro={macro} loading={macroLoading} error={macroError} compact={collapsed} />

      <div className={cn("border-t border-slate-200/70 p-3", collapsed && "px-2")}>
        {collapsed ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="종목 검색"
            onClick={onToggleCollapse}
            className="h-10 w-10 border-slate-200 bg-white text-slate-600 shadow-sm"
          >
            <Search className="h-4 w-4" />
          </Button>
        ) : (
          <form onSubmit={onTickerSearch} className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Search className="h-3.5 w-3.5" />
              종목 빠른 검색
            </label>
            <div className="flex gap-2">
              <Input
                value={tickerInput}
                onChange={(event) => onTickerInputChange(event.target.value)}
                placeholder="예: 005930"
                className="h-10 border-slate-200 bg-white text-sm shadow-sm focus-visible:ring-slate-400"
              />
              <Button
                type="submit"
                size="icon"
                disabled={searchLoading || !tickerInput.trim()}
                className="h-10 w-10 shrink-0 bg-slate-950 text-white hover:bg-slate-800"
              >
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        )}
      </div>

      {!collapsed && (
        <div className="border-t border-slate-200/70 px-3 py-3">
          <button
            type="button"
            onClick={() => onNavChange("profile")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-white hover:text-slate-950"
          >
            <Settings2 className="h-4 w-4" />
            분석 설정
            <ChevronLeft className="ml-auto h-4 w-4 rotate-180 text-slate-300" />
          </button>
        </div>
      )}
    </aside>
  );
}

export default AppSidebar;
