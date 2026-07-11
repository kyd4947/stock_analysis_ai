"use client";

import React, { useEffect } from "react";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Landmark,
  LineChart,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sparkles,
  Star,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MacroSnapshot, EmploymentIndicator } from "@/lib/api";
import { StockSearchBox } from "@/components/StockSearchBox";

export type NavItem = "analysis" | "watchlist" | "profile";

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  onLogoClick?: () => void;
  onTickerSearch: (ticker: string) => void;
  searchLoading: boolean;
  macro: MacroSnapshot | null;
  macroLoading: boolean;
  macroError?: boolean;
  mobileOpen: boolean;
  onMobileToggle: () => void;
};

const NAV_ITEMS: { id: NavItem; label: string; helper: string; icon: React.ElementType }[] = [
  { id: "analysis", label: "실시간 분석", helper: "종목과 거시지표", icon: LineChart },
  { id: "watchlist", label: "관심 종목", helper: "추적 리스트", icon: Star },
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
  const [expandedFear, setExpandedFear] = React.useState<string | null>(null);

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

  function getVixSignal(v: number) {
    if (v >= 40) return { sig: "극심한 공포", cls: "bg-rose-100 text-rose-800", desc: "금융위기급 공포. 시장이 극도의 불안 상태이며, 공격적 매수 기회로 해석되기도 합니다." };
    if (v >= 30) return { sig: "패닉", cls: "bg-rose-50 text-rose-700", desc: "시장이 매우 불안정하며, 급격한 하락이나 반등이 잦아지는 국면입니다." };
    if (v >= 20) return { sig: "주의", cls: "bg-amber-50 text-amber-700", desc: "불확실성이 커지기 시작하며, 투자자들이 방어적으로 변하는 구간입니다." };
    return { sig: "안정", cls: "bg-emerald-50 text-emerald-700", desc: "시장이 낙관적이고 변동성이 낮은 평상시 국면입니다." };
  }

  function getVkospiSignal(v: number) {
    if (v >= 80) return { sig: "초비상/위기", cls: "bg-rose-100 text-rose-800", desc: "금융위기·팬데믹급 극단적 공포. 2008년이나 2020년급 시장 충격 신호입니다." };
    if (v >= 50) return { sig: "심리적 불안", cls: "bg-rose-50 text-rose-700", desc: "큰 악재가 겹치거나 수급이 꼬였을 때 나타나는 수치입니다." };
    if (v >= 20) return { sig: "일반 변동성", cls: "bg-amber-50 text-amber-700", desc: "한국 시장에서 흔히 관찰되는 범위입니다." };
    return { sig: "매우 안정", cls: "bg-emerald-50 text-emerald-700", desc: "한국 시장에서 이 수준이면 엄청난 평온함입니다." };
  }

  const fearItems = [
    macro?.vkospi
      ? { key: "vkospi", label: "한국 공포지수 (VKOSPI)", value: macro.vkospi.price, change: macro.vkospi.change_rate, signal: getVkospiSignal(macro.vkospi.price), ranges: [
        { range: "80~100", label: "초비상/위기", color: "text-rose-700" },
        { range: "50~80", label: "심리적 불안", color: "text-rose-600" },
        { range: "20~50", label: "일반 변동성", color: "text-amber-600" },
        { range: "10~20", label: "매우 안정", color: "text-emerald-600" },
      ]}
      : null,
    macro?.vix
      ? { key: "vix", label: "미국 공포지수 (VIX)", value: macro.vix.price, change: macro.vix.change_rate, signal: getVixSignal(macro.vix.price), ranges: [
        { range: "40+", label: "극심한 공포", color: "text-rose-700" },
        { range: "30~40", label: "패닉", color: "text-rose-600" },
        { range: "20~30", label: "주의", color: "text-amber-600" },
        { range: "0~20", label: "안정", color: "text-emerald-600" },
      ]}
      : null,
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));

  const employment = macro?.employment;
  const empEntries: Array<EmploymentIndicator & { icon: React.ElementType }> = employment
    ? (
        [
          employment.us_unemployment && { ...employment.us_unemployment, icon: Users },
          employment.us_nonfarm_payrolls && { ...employment.us_nonfarm_payrolls, icon: TrendingDown },
          employment.us_initial_claims && { ...employment.us_initial_claims, icon: TrendingDown },
          employment.kr_unemployment && { ...employment.kr_unemployment, icon: Users },
        ] as Array<(EmploymentIndicator & { icon: React.ElementType }) | false>
      ).filter((x): x is EmploymentIndicator & { icon: React.ElementType } => Boolean(x))
    : [];

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

        {fearItems.length > 0 && (
          <>
            <div className="my-1 border-t border-slate-100" />
            {fearItems.map((item) => {
              const isExpanded = expandedFear === item.key;
              return (
                <div key={item.key}>
                  <button
                    type="button"
                    onClick={() => setExpandedFear(isExpanded ? null : item.key)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                        <Activity className="h-4 w-4" />
                      </div>
                      <span className="truncate text-xs font-medium text-slate-500">{item.label}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900">{item.value.toFixed(2)}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.signal.cls}`}>{item.signal.sig}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-10 mt-1 mb-2 space-y-2 rounded-md bg-slate-50 p-2.5 text-xs">
                      <div>
                        <p className="font-semibold text-slate-700 mb-1">해석 기준</p>
                        <div className="space-y-0.5">
                          {item.ranges.map((r) => (
                            <div key={r.range} className="flex items-center justify-between">
                              <span className="font-mono text-slate-500">{r.range}</span>
                              <span className={`font-semibold ${r.color}`}>{r.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-slate-200 pt-2">
                        <p className="font-semibold text-slate-700 mb-0.5">현재 상태</p>
                        <p className="text-slate-600 leading-5">{item.signal.desc}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {empEntries.length > 0 && (
          <>
            <div className="my-1 border-t border-slate-100" />
            {empEntries.map((ind) => {
              const signalCls =
                ind.signal === "호재"
                  ? "bg-emerald-50 text-emerald-700"
                  : ind.signal === "악재"
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700";
              const valueStr =
                (ind.label.includes("고용") && ind.value > 0 ? "+" : "") +
                ind.value.toLocaleString();
              return (
                <div key={ind.label} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                      <ind.icon className="h-4 w-4" />
                    </div>
                    <span className="truncate text-xs font-medium text-slate-500">{ind.label}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">
                      {valueStr}
                      <span className="ml-0.5 text-[11px] font-medium text-slate-400">{ind.unit}</span>
                    </span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${signalCls}`}>
                      {ind.signal}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  activeNav,
  onNavChange,
  onLogoClick,
  onTickerSearch,
  searchLoading,
  macro,
  macroLoading,
  macroError,
  mobileOpen,
  onMobileToggle,
}: AppSidebarProps) {
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      {/* 모바일 오버레이 배경 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileToggle}
        />
      )}

      {/* 모바일 토글 버튼 (항상 상단에) */}
      <button
        type="button"
        onClick={onMobileToggle}
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm lg:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5 text-slate-600" /> : <Menu className="h-5 w-5 text-slate-600" />}
      </button>

      <aside
        className={cn(
          "flex h-[100dvh] shrink-0 flex-col border-r border-slate-200 bg-slate-50/95 shadow-[1px_0_0_rgba(15,23,42,0.03)] transition-all duration-200 overflow-y-auto",
          // 모바일: 오버레이 드로어
          "fixed inset-y-0 left-0 z-50 lg:static lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "w-[72px]" : "w-[292px]"
        )}
      >
      <button
        type="button"
        onClick={() => onLogoClick ? onLogoClick() : onNavChange("analysis")}
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
          <StockSearchBox
            onSelect={onTickerSearch}
            loading={searchLoading}
            placeholder="예: 삼성전자, 005930"
            dropUp
            showLabel
          />
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
    </>
  );
}

export default AppSidebar;
