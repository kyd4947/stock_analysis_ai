"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Loader2,
  MessageSquare,
  Send,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  authHeaders,
  fetchEntryExit,
} from "@/lib/api";
import type {
  StockScreenResult,
  EntryExitResult,
} from "@/lib/api";

type StockScreenCardProps = {
  item: StockScreenResult;
  compact?: boolean;
  onSelect?: () => void;
};

type ChatMessage = { role: "user" | "assistant"; content: string; streaming?: boolean };

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link)
      return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary break-all">{link[1]}</a>;
    return part;
  });
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.+)/);
        if (!m) break;
        listItems.push(
          <li key={i} className="flex gap-2.5">
            <span className="text-xs font-bold tabular-nums text-slate-400">{m[1]}.</span>
            <span className="text-slate-700">{renderInline(m[2])}</span>
          </li>
        );
        i++;
      }
      nodes.push(<ol key={`ol-${i}`} className="space-y-1.5">{listItems}</ol>);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-•·]\s+(.+)/);
    if (bulletMatch) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^[-•·]\s+(.+)/);
        if (!m) break;
        listItems.push(
          <li key={i} className="flex gap-2.5">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
            <span className="text-slate-700">{renderInline(m[1])}</span>
          </li>
        );
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="space-y-1.5">{listItems}</ul>);
      continue;
    }

    nodes.push(
      <p key={i} className="text-slate-700 leading-6">{renderInline(trimmed)}</p>
    );
    i++;
  }

  return <div className="space-y-2.5 text-sm">{nodes}</div>;
}

function scoreMeta(score: number) {
  if (score >= 0.8)
    return { label: "High", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
  if (score >= 0.6)
    return { label: "Medium", className: "bg-amber-50 text-amber-700 border-amber-100" };
  return { label: "Low", className: "bg-rose-50 text-rose-700 border-rose-100" };
}

/** 원형 AI 점수 게이지 */
function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "#059669" : pct >= 60 ? "#d97706" : "#e11d48";
  const r = 25;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[64px] w-[64px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e8ebef" strokeWidth="5.5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[16px] font-bold tabular-nums leading-none text-slate-900">{pct}</span>
        <span className="mt-0.5 text-[9px] font-semibold text-slate-400">AI 점수</span>
      </div>
    </div>
  );
}

/** 지표 범위 게이지 바 */
function Gauge({ pct, tone }: { pct: number; tone: "good" | "warn" | "danger" | "neutral" }) {
  const width = Math.max(3, Math.min(100, pct));
  const color =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "warn"
      ? "bg-amber-500"
      : tone === "danger"
      ? "bg-rose-500"
      : "bg-slate-400";
  return (
    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${width}%` }} />
    </div>
  );
}

/** 지표 타일 공통 스타일 */
const tileClass =
  "group w-full rounded-xl border border-slate-200/80 bg-white p-3.5 text-left transition-all hover:border-slate-300 hover:shadow-card";

function TileHintIcon() {
  return (
    <Info className="h-3 w-3 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
  );
}

function SignalBadge({ signal, reason }: { signal?: string; reason?: string }) {
  if (!signal) return null;
  const meta = {
    BUY:   { label: "매수", icon: TrendingUp,   solid: "bg-emerald-500", soft: "border-emerald-100 bg-emerald-50/60" },
    HOLD:  { label: "보유", icon: Info,          solid: "bg-blue-500",    soft: "border-blue-100 bg-blue-50/60" },
    WATCH: { label: "관망", icon: Info,          solid: "bg-amber-500",   soft: "border-amber-100 bg-amber-50/60" },
    SELL:  { label: "매도", icon: TrendingDown,  solid: "bg-rose-500",    soft: "border-rose-100 bg-rose-50/60" },
  }[signal] ?? { label: signal, icon: Info, solid: "bg-slate-500", soft: "border-slate-200 bg-slate-50" };

  const Icon = meta.icon;
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-3.5", meta.soft)}>
      <div className={cn("flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-white", meta.solid)}>
        <Icon className="h-4 w-4" />
        {meta.label} 시그널
      </div>
      {reason && <p className="flex-1 text-sm leading-6 text-slate-600">{reason}</p>}
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

/** 지표 해설 패널 공통 스타일 */
const explainPanelClass = "mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs";

export function StockScreenCard({ item, compact = false, onSelect }: StockScreenCardProps) {
  const score = scoreMeta(item.score);
  const scorePercent = Math.round(item.score * 100);
  const isPositive = (item.change_rate ?? 0) >= 0;

  const [chatOpen, setChatOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const [entryExit, setEntryExit] = React.useState<EntryExitResult | null>(null);
  const [entryExitLoading, setEntryExitLoading] = React.useState(false);
  const [entryExitError, setEntryExitError] = React.useState("");
  const [expandedIndicator, setExpandedIndicator] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatOpen]);

  const newsContext = item.news?.articles
    ?.slice(0, 5)
    .map((a, idx) => `뉴스${idx + 1}: ${a.title} [출처: ${a.source}] [URL: ${a.url}]`)
    .join(" || ");

  const ph = item.price_history;
  const contextSummary = [
    `종목: ${item.ticker}`,
    item.price ? `현재가: ${item.price.toLocaleString("ko-KR")}원` : null,
    item.change_rate != null ? `당일변동: ${item.change_rate}%` : null,
    `AI 점수: ${scorePercent}점 (${score.label})`,
    item.sector ? `섹터: ${item.sector}` : null,
    `PER: ${item.financial.per ?? "-"}, PBR: ${item.financial.pbr ?? "-"}, ROE: ${item.financial.roe ?? "-"}%`,
    ph?.recent_closes?.length
      ? `최근10일종가(오래된순): ${ph.recent_closes.map((v) => v.toLocaleString("ko-KR")).join(", ")}원`
      : null,
    ph?.ma5 && ph?.ma20
      ? `MA5: ${ph.ma5.toLocaleString("ko-KR")}, MA20: ${ph.ma20.toLocaleString("ko-KR")}${ph.ma60 ? `, MA60: ${ph.ma60.toLocaleString("ko-KR")}` : ""}`
      : null,
    ph?.ret_5d !== undefined && ph?.ret_20d !== undefined
      ? `최근수익률 5일: ${ph.ret_5d}%, 20일: ${ph.ret_20d}%`
      : null,
    ph?.pct_from_52w_high !== undefined
      ? `52주고점대비: ${ph.pct_from_52w_high}%`
      : null,
    `AI 요약: ${item.summary}`,
    item.dart.risk_flags.length > 0
      ? `리스크 공시: ${item.dart.risk_flags.join(", ")}`
      : null,
    newsContext ? `관련 뉴스(URL 포함): ${newsContext}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  async function handleEntryExit() {
    setEntryExitLoading(true);
    setEntryExitError("");
    setEntryExit(null);
    try {
      const result = await fetchEntryExit(item.ticker, item.financial);
      if (!result) throw new Error("데이터를 가져오지 못했습니다.");
      setEntryExit(result);
    } catch (e) {
      setEntryExitError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setEntryExitLoading(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || chatLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setChatInput("");
    setChatLoading(true);

    // 스트리밍용 빈 assistant 메시지 미리 추가
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
        body: JSON.stringify({ ticker: item.ticker, question: q, context_summary: contextSummary }),
      });

      if (!res.ok || !res.body) throw new Error("스트림 연결 실패");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const { chunk } = JSON.parse(data);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant" && last.streaming) {
                updated[updated.length - 1] = { ...last, content: last.content + chunk };
              }
              return updated;
            });
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: "죄송합니다. 답변 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
            streaming: false,
          };
        }
        return updated;
      });
    } finally {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          updated[updated.length - 1] = { ...last, streaming: false };
        }
        return updated;
      });
      setChatLoading(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="group w-full rounded-xl border border-slate-200/80 bg-card p-4 text-left shadow-card transition-all hover:border-emerald-300 hover:bg-emerald-50/30"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-slate-900">{item.ticker}</p>
              <Badge variant="outline" className={`text-[11px] font-bold ${score.className}`}>
                {scorePercent} · {score.label}
              </Badge>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">{item.sector || "종목 정보"}</p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{item.summary}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-primary" />
        </div>
      </button>
    );
  }

  return (
    <Card className="rounded-xl border-slate-200/80 shadow-card">
      <CardHeader className="pb-4 sm:pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {item.name && (
                <CardTitle className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {item.name}
                </CardTitle>
              )}
              <span
                className={`rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold ${
                  item.name ? "text-slate-500" : "text-slate-900"
                }`}
              >
                {item.ticker}
              </span>
              <a
                href={`https://finance.naver.com/item/main.naver?code=${item.ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                title="네이버 금융에서 보기"
                className="text-slate-300 transition-colors hover:text-slate-600"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <CardDescription className="mt-1.5 text-sm font-medium text-slate-500">
              {item.sector || "종목 정보"}
            </CardDescription>
          </div>
          <div className="shrink-0 sm:text-right">
            <div className="flex items-baseline gap-1 text-2xl font-bold tabular-nums text-slate-900 sm:justify-end">
              {item.price?.toLocaleString("ko-KR") ?? "-"}
              <span className="text-sm font-medium text-slate-400">원</span>
            </div>
            {item.change_rate != null && (
              <div
                className={`mt-1.5 inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-bold tabular-nums ${
                  isPositive ? "bg-up-soft text-up" : "bg-down-soft text-down"
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {isPositive ? "+" : ""}
                {item.change_rate}%
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* 매수/매도 시그널 */}
        <SignalBadge signal={item.signal} reason={item.signal_reason} />

        {/* AI 분석 요약 */}
        <section className="flex items-start gap-4">
          <ScoreRing score={item.score} />
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-sm font-bold text-slate-900">AI 분석 요약</h3>
            <p className="mt-1.5 text-sm leading-7 text-slate-600">{item.summary}</p>
          </div>
        </section>

        {/* 분석 근거 */}
        {item.reasons.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">분석 근거</h3>
            <ul className="space-y-2">
              {item.reasons.map((reason, index) => (
                <li
                  key={`${item.ticker}-reason-${index}`}
                  className="flex gap-2.5 text-sm leading-6 text-slate-600"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold tabular-nums text-accent-foreground">
                    {index + 1}
                  </span>
                  {reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 재무 지표 */}
        {item.financial && (
          <CollapsibleSection title="재무 지표">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "PER", value: item.financial.per ? `${item.financial.per}배` : "-" },
                { label: "PBR", value: item.financial.pbr ? `${item.financial.pbr}배` : "-" },
                { label: "ROE", value: item.financial.roe ? `${item.financial.roe}%` : "-" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                  <p className="text-[11px] font-semibold text-slate-400">{label}</p>
                  <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            {(item.financial.debt_ratio != null || item.financial.dividend_yield != null) && (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                {item.financial.debt_ratio != null && (
                  <button
                    type="button"
                    onClick={() => setExpandedIndicator(expandedIndicator === "debt" ? null : "debt")}
                    className={tileClass}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-slate-400">부채비율</p>
                      <TileHintIcon />
                    </div>
                    <p
                      className={cn(
                        "mt-1.5 text-lg font-bold tabular-nums",
                        item.financial.debt_ratio >= 200
                          ? "text-rose-600"
                          : item.financial.debt_ratio >= 100
                          ? "text-amber-600"
                          : "text-emerald-600"
                      )}
                    >
                      {item.financial.debt_ratio}%
                    </p>
                    <Gauge
                      pct={Math.min(100, (item.financial.debt_ratio / 300) * 100)}
                      tone={
                        item.financial.debt_ratio >= 200
                          ? "danger"
                          : item.financial.debt_ratio >= 100
                          ? "warn"
                          : "good"
                      }
                    />
                    <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                      {item.financial.debt_ratio >= 200
                        ? "높은 차입 의존"
                        : item.financial.debt_ratio >= 100
                        ? "보통 (업종별 상이)"
                        : "재무 안정적"}
                    </p>
                  </button>
                )}
                {item.financial.dividend_yield != null && (
                  <button
                    type="button"
                    onClick={() => setExpandedIndicator(expandedIndicator === "div" ? null : "div")}
                    className={tileClass}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-slate-400">배당수익률</p>
                      <TileHintIcon />
                    </div>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">
                      {item.financial.dividend_yield}%
                    </p>
                    <Gauge
                      pct={Math.min(100, (item.financial.dividend_yield / 5) * 100)}
                      tone={item.financial.dividend_yield >= 3 ? "good" : "neutral"}
                    />
                    <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                      {item.financial.dividend_yield >= 3 ? "높은 배당 매력" : "배당 보통 수준"}
                    </p>
                  </button>
                )}
              </div>
            )}
            {expandedIndicator === "debt" && item.financial.debt_ratio != null && (
              <div className={explainPanelClass}>
                <p className="font-bold text-slate-700">부채비율</p>
                <p className="leading-5 text-slate-600">총부채를 자기자본으로 나눈 비율로, 기업의 재무 건전성을 평가하는 지표입니다. 높을수록 차입 의존도가 크며 파산 리스크가 높아집니다.</p>
                <div className="space-y-1 rounded-lg bg-white p-2.5">
                  <div className="flex justify-between"><span className="font-mono text-slate-500">100% 이하</span><span className="font-semibold text-emerald-700">안정적 (적정 수준)</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">100~200%</span><span className="font-semibold text-amber-700">보통 (업종에 따라 다름)</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">200% 이상</span><span className="font-semibold text-rose-700">위험 (높은 차입 의존)</span></div>
                </div>
                <p className="text-slate-500">현재 부채비율: <span className="font-bold text-slate-900">{item.financial.debt_ratio}%</span> → {item.financial.debt_ratio >= 200 ? "재무 리스크 높음, 추가 확인 필요" : item.financial.debt_ratio >= 100 ? "보통 수준, 업종 평균과 비교 필요" : "재무 안정적"}</p>
              </div>
            )}
            {expandedIndicator === "div" && item.financial.dividend_yield != null && (
              <div className={explainPanelClass}>
                <p className="font-bold text-slate-700">배당수익률</p>
                <p className="leading-5 text-slate-600">주당배당금을 현재 주가로 나눈 비율로, 투자 대비 연간 배당 수익을 보여줍니다. 높을수록 배당 매력도가 크지만, 지속 가능성도 함께 확인해야 합니다.</p>
                <div className="space-y-1 rounded-lg bg-white p-2.5">
                  <div className="flex justify-between"><span className="font-mono text-slate-500">3% 이상</span><span className="font-semibold text-emerald-700">높은 배당 (배당주 매력)</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">1~3%</span><span className="font-semibold text-slate-700">보통</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">1% 이하</span><span className="font-semibold text-slate-500">낮은 배당</span></div>
                </div>
                <p className="text-slate-500">현재 배당수익률: <span className="font-bold text-slate-900">{item.financial.dividend_yield}%</span> → {item.financial.dividend_yield >= 3 ? "배당 매력 높음" : item.financial.dividend_yield >= 1 ? "보통 수준" : "배당 미미"}</p>
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* 기술적 지표 */}
        {item.price_history && (item.price_history.rsi != null || item.price_history.macd != null || item.price_history.stochastic != null || item.price_history.bollinger != null) && (
          <CollapsibleSection title="기술적 지표">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {item.price_history.rsi != null && (
                <button
                  type="button"
                  onClick={() => setExpandedIndicator(expandedIndicator === "rsi" ? null : "rsi")}
                  className={tileClass}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-400">RSI(14)</p>
                    <TileHintIcon />
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-lg font-bold tabular-nums",
                      item.price_history.rsi >= 70
                        ? "text-rose-600"
                        : item.price_history.rsi <= 30
                        ? "text-emerald-600"
                        : "text-slate-900"
                    )}
                  >
                    {item.price_history.rsi}
                  </p>
                  <Gauge
                    pct={item.price_history.rsi}
                    tone={item.price_history.rsi >= 70 ? "danger" : item.price_history.rsi <= 30 ? "good" : "neutral"}
                  />
                  <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                    {item.price_history.rsi >= 70 ? "과매수 구간" : item.price_history.rsi <= 30 ? "과매도 구간" : "중립 구간"}
                  </p>
                </button>
              )}
              {item.price_history.macd && (
                <button
                  type="button"
                  onClick={() => setExpandedIndicator(expandedIndicator === "macd" ? null : "macd")}
                  className={tileClass}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-400">MACD</p>
                    <TileHintIcon />
                  </div>
                  <p className={cn("mt-1.5 text-lg font-bold tabular-nums", item.price_history.macd.histogram > 0 ? "text-rose-600" : "text-blue-600")}>
                    {item.price_history.macd.macd}
                  </p>
                  <p className="mt-2.5 h-1.5" />
                  <p className={cn("mt-1.5 text-[11px] font-medium", item.price_history.macd.histogram > 0 ? "text-rose-600" : "text-blue-600")}>
                    {item.price_history.macd.histogram > 0 ? "상승 추세" : "하락 추세"}
                  </p>
                </button>
              )}
              {item.price_history.stochastic && (
                <button
                  type="button"
                  onClick={() => setExpandedIndicator(expandedIndicator === "stoch" ? null : "stoch")}
                  className={tileClass}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-400">스토캐스틱</p>
                    <TileHintIcon />
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-lg font-bold tabular-nums",
                      item.price_history.stochastic.k >= 80
                        ? "text-rose-600"
                        : item.price_history.stochastic.k <= 20
                        ? "text-emerald-600"
                        : "text-slate-900"
                    )}
                  >
                    %K {item.price_history.stochastic.k}
                  </p>
                  <Gauge
                    pct={item.price_history.stochastic.k}
                    tone={item.price_history.stochastic.k >= 80 ? "danger" : item.price_history.stochastic.k <= 20 ? "good" : "neutral"}
                  />
                  <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                    {item.price_history.stochastic.k >= 80 ? "과매수 구간" : item.price_history.stochastic.k <= 20 ? "과매도 구간" : "중립 구간"}
                  </p>
                </button>
              )}
              {item.price_history.bollinger && (
                <button
                  type="button"
                  onClick={() => setExpandedIndicator(expandedIndicator === "boll" ? null : "boll")}
                  className={tileClass}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-400">볼린저 밴드</p>
                    <TileHintIcon />
                  </div>
                  <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">
                    {item.price_history.bollinger.position}%
                  </p>
                  <Gauge
                    pct={item.price_history.bollinger.position}
                    tone={
                      item.price_history.bollinger.position >= 80
                        ? "danger"
                        : item.price_history.bollinger.position <= 20
                        ? "good"
                        : "neutral"
                    }
                  />
                  <p className="mt-1.5 text-[11px] font-medium text-slate-400">밴드 내 위치</p>
                </button>
              )}
            </div>
            {expandedIndicator === "rsi" && item.price_history.rsi != null && (
              <div className={explainPanelClass}>
                <p className="font-bold text-slate-700">RSI (상대강도지수)</p>
                <p className="leading-5 text-slate-600">일정 기간 동안 주가가 전일가 대비 얼마나 올랐는지(상승폭)와 얼마나 떨어졌는지(하락폭)를 비교하여 과매수·과매도를 판단하는 지표입니다.</p>
                <div className="space-y-1 rounded-lg bg-white p-2.5">
                  <div className="flex justify-between"><span className="font-mono text-slate-500">70 이상</span><span className="font-semibold text-rose-700">과매수 (매도 고려)</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">30~70</span><span className="font-semibold text-slate-700">중립</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">30 이하</span><span className="font-semibold text-emerald-700">과매도 (매수 고려)</span></div>
                </div>
                <p className="text-slate-500">현재 RSI: <span className="font-bold text-slate-900">{item.price_history.rsi}</span> → {item.price_history.rsi >= 70 ? "과매수 구간으로 하락 가능성" : item.price_history.rsi <= 30 ? "과매도 구간으로 반등 가능성" : "중립 구간"}</p>
              </div>
            )}
            {expandedIndicator === "macd" && item.price_history.macd && (
              <div className={explainPanelClass}>
                <p className="font-bold text-slate-700">MACD (이동평균수렴확산)</p>
                <p className="leading-5 text-slate-600">단기(12일)·장기(26일) 이동평균선의 차이를 추세로 해석하는 지표입니다. 시그널선(9일)과의 교차점에서 매매 신호를 포착합니다.</p>
                <div className="space-y-1 rounded-lg bg-white p-2.5">
                  <div className="flex justify-between"><span className="font-mono text-slate-500">MACD &gt; Signal</span><span className="font-semibold text-rose-700">상승 추세 (매수 신호)</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">MACD &lt; Signal</span><span className="font-semibold text-blue-700">하락 추세 (매도 신호)</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">히스토그램</span><span className="font-semibold text-slate-700">MACD-Signal 차이 (모멘텀 강도)</span></div>
                </div>
                <p className="text-slate-500">현재: MACD <span className="font-bold text-slate-900">{item.price_history.macd.macd}</span>, Signal <span className="font-bold text-slate-900">{item.price_history.macd.signal}</span> → {item.price_history.macd.histogram > 0 ? "상승 추세 유지" : "하락 추세 유지"}</p>
              </div>
            )}
            {expandedIndicator === "stoch" && item.price_history.stochastic && (
              <div className={explainPanelClass}>
                <p className="font-bold text-slate-700">스토캐스틱 오실레이터</p>
                <p className="leading-5 text-slate-600">일정 기간(14일)의 고가~저가 범위 내에서 현재가가 어디에 위치하는지(%)를 보여주는 지표입니다. 과매수·과매도 판단에 활용됩니다.</p>
                <div className="space-y-1 rounded-lg bg-white p-2.5">
                  <div className="flex justify-between"><span className="font-mono text-slate-500">80 이상</span><span className="font-semibold text-rose-700">과매수 (상단 접근)</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">20~80</span><span className="font-semibold text-slate-700">중립</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">20 이하</span><span className="font-semibold text-emerald-700">과매도 (하단 접근)</span></div>
                </div>
                <p className="text-slate-500">현재 %K: <span className="font-bold text-slate-900">{item.price_history.stochastic.k}</span> → {item.price_history.stochastic.k >= 80 ? "고가권 근접, 조정 가능" : item.price_history.stochastic.k <= 20 ? "저가권 근접, 반등 가능" : "중립 구간"}</p>
              </div>
            )}
            {expandedIndicator === "boll" && item.price_history.bollinger && (
              <div className={explainPanelClass}>
                <p className="font-bold text-slate-700">볼린저 밴드</p>
                <p className="leading-5 text-slate-600">이동평균선(MA20)을 중심으로 표준편차(±2σ) 밴드를 그려, 현재가가 밴드 내 어디에 위치하는지 판단하는 지표입니다. 변동성과 가격의 상대적 위치를 동시에 파악할 수 있습니다.</p>
                <div className="space-y-1 rounded-lg bg-white p-2.5">
                  <div className="flex justify-between"><span className="font-mono text-slate-500">상단 밴드</span><span className="font-bold tabular-nums text-slate-900">{item.price_history.bollinger.upper.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">중간선(MA20)</span><span className="font-bold tabular-nums text-slate-900">{item.price_history.bollinger.middle.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">하단 밴드</span><span className="font-bold tabular-nums text-slate-900">{item.price_history.bollinger.lower.toLocaleString()}원</span></div>
                  <div className="flex justify-between"><span className="font-mono text-slate-500">밴드폭</span><span className="font-semibold tabular-nums text-slate-700">{item.price_history.bollinger.bandwidth}%</span></div>
                </div>
                <p className="text-slate-500">현재 위치: <span className="font-bold text-slate-900">{item.price_history.bollinger.position}%</span> → {item.price_history.bollinger.position >= 80 ? "상단 접근, 과매수 가능" : item.price_history.bollinger.position <= 20 ? "하단 접근, 과매도 가능" : "밴드 중간 위치"}</p>
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* 거시경제 지표 */}
        {item.macro && (
          <CollapsibleSection title="거시경제 지표">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                <p className="text-[11px] font-semibold text-slate-400">USD/KRW</p>
                <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">
                  {item.macro.exchange_rate_usdkrw?.toLocaleString("ko-KR", {
                    maximumFractionDigits: 1,
                  }) ?? "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                <p className="text-[11px] font-semibold text-slate-400">한국 금리</p>
                <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">
                  {item.macro.policy_rate != null ? `${item.macro.policy_rate}%` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                <p className="text-[11px] font-semibold text-slate-400">물가 YoY</p>
                <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">
                  {item.macro.inflation_yoy != null ? `${item.macro.inflation_yoy}%` : "-"}
                </p>
              </div>
              {item.macro.fed_funds_rate != null && (
                <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                  <p className="text-[11px] font-semibold text-slate-400">미국 금리</p>
                  <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">{item.macro.fed_funds_rate}%</p>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* DART 리스크 공시 */}
        {item.dart.risk_flags.length > 0 && (
          <CollapsibleSection title="DART 리스크 공시">
            <div className="flex flex-wrap gap-2">
              {item.dart.risk_flags.map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-rose-200 bg-up-soft px-2.5 py-1 text-xs font-semibold text-rose-700"
                >
                  {flag}
                </span>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* 뉴스 */}
        {item.news?.articles && item.news.articles.length > 0 && (
          <CollapsibleSection title="관련 뉴스">
            <div className="space-y-1">
              {item.news.articles.slice(0, 4).map((article, i) => (
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
                  <ExternalLink className="mt-1.5 h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* 주요 주주 */}
        {item.shareholders && item.shareholders.length > 0 && (
          <CollapsibleSection title="주요 주주">
            <div className="space-y-1.5">
              {item.shareholders.slice(0, 5).map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-700">{s.name}</span>
                  <span className="font-bold tabular-nums text-slate-900">{s.share}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* 타점 분석 */}
        <div className="border-t border-slate-100 pt-5 space-y-3">
          <Button
            variant="outline"
            onClick={handleEntryExit}
            disabled={entryExitLoading}
            className="h-10 w-full rounded-lg border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            {entryExitLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Target className="mr-2 h-4 w-4 text-primary" />
            )}
            {entryExitLoading ? "AI가 타점 계산 중..." : "AI 타점 분석 (매수·매도 구간)"}
          </Button>

          {entryExitError && (
            <p className="rounded-lg bg-up-soft px-3 py-2 text-xs text-rose-600">{entryExitError}</p>
          )}

          {entryExit && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-white">
                    <Target className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-bold text-slate-900">AI 타점 분석</span>
                  <span className="text-xs tabular-nums text-slate-500">현재가 {entryExit.currency === "USD" ? "$" + entryExit.current_price.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.current_price.toLocaleString("ko-KR") + "원"}</span>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${
                  entryExit.confidence === "high"
                    ? "bg-emerald-500"
                    : entryExit.confidence === "medium"
                    ? "bg-amber-500"
                    : "bg-slate-500"
                }`}>
                  신뢰도 {entryExit.confidence === "high" ? "높음" : entryExit.confidence === "medium" ? "보통" : "낮음"}
                </span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
                <div className="p-4">
                  <p className="text-xs font-bold text-emerald-600">매수 구간</p>
                  <p className="mt-1.5 text-sm font-bold tabular-nums text-slate-900">
                    {entryExit.currency === "USD" ? "$" + entryExit.entry_low.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.entry_low.toLocaleString("ko-KR")}
                    <span className="mx-1 font-medium text-slate-300">~</span>
                    {entryExit.currency === "USD" ? "$" + entryExit.entry_high.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.entry_high.toLocaleString("ko-KR")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{entryExit.currency === "USD" ? "USD" : "원"}</p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-bold text-blue-600">1차 목표가</p>
                  <p className="mt-1.5 text-sm font-bold tabular-nums text-slate-900">
                    {entryExit.currency === "USD" ? "$" + entryExit.target_1.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.target_1.toLocaleString("ko-KR")}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-emerald-600">
                    +{(((entryExit.target_1 - entryExit.current_price) / entryExit.current_price) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-bold text-blue-400">2차 목표가</p>
                  {entryExit.target_2 ? (
                    <>
                      <p className="mt-1.5 text-sm font-bold tabular-nums text-slate-900">
                        {entryExit.currency === "USD" ? "$" + entryExit.target_2.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.target_2.toLocaleString("ko-KR")}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-emerald-600">
                        +{(((entryExit.target_2 - entryExit.current_price) / entryExit.current_price) * 100).toFixed(1)}%
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-sm text-slate-400">—</p>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs font-bold text-rose-600">손절가</p>
                  <p className="mt-1.5 text-sm font-bold tabular-nums text-slate-900">
                    {entryExit.currency === "USD" ? "$" + entryExit.stop_loss.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.stop_loss.toLocaleString("ko-KR")}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-rose-500">
                    {(((entryExit.stop_loss - entryExit.current_price) / entryExit.current_price) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-xs leading-5 text-slate-600">{entryExit.basis}</p>
                <p className="mt-1 text-[10px] text-slate-400">⚠ 투자 판단은 본인 책임이며, AI 분석은 참고용입니다.</p>
              </div>
            </div>
          )}
        </div>

        {/* Q&A 채팅 토글 버튼 */}
        <div className="border-t border-slate-100 pt-5">
          <Button
            variant="outline"
            onClick={() => setChatOpen((v) => !v)}
            className="h-10 w-full rounded-lg border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            {chatOpen ? "AI 질문 닫기" : `${item.ticker}에 대해 AI에게 질문하기`}
          </Button>
        </div>

        {/* Q&A 채팅 패널 */}
        {chatOpen && (
          <section className="rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <MessageSquare className="h-4 w-4 text-primary" />
                AI Q&A — {item.ticker}
              </h3>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className={cn(
                "space-y-3 overflow-y-auto px-4 py-3",
                messages.length > 0 ? "min-h-[120px] max-h-[320px]" : ""
              )}
            >
              {messages.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-4">
                  종목 분석 데이터를 바탕으로 궁금한 점을 질문하세요.
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] px-3.5 py-2.5",
                      msg.role === "user"
                        ? "rounded-2xl rounded-br-md bg-primary text-sm leading-6 text-white"
                        : "rounded-2xl rounded-bl-md border border-slate-200 bg-white shadow-card"
                    )}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : msg.streaming ? (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {msg.content || <span className="text-slate-400">...</span>}
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-slate-400 align-middle" />
                      </p>
                    ) : (
                      <>
                        <MarkdownMessage content={msg.content} />
                        <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                          투자 판단은 사용자 본인의 몫입니다.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && !messages.some((m) => m.streaming) && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-400 shadow-card">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    AI가 답변 중입니다...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={sendMessage}
              className="flex gap-2 border-t border-slate-200 bg-white px-4 py-3"
            >
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="예: 이 종목 지금 매수 타이밍인가요?"
                className="h-9 rounded-lg border-slate-200 bg-white text-sm focus-visible:ring-primary/30"
                disabled={chatLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={chatLoading || !chatInput.trim()}
                className="h-9 w-9 shrink-0 rounded-lg"
              >
                {chatLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
