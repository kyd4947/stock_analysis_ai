"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Loader2,
  MessageSquare,
  Newspaper,
  Send,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Activity,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  askStockQuestion,
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
      return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800 break-all">{link[1]}</a>;
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
            <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">{m[1]}.</span>
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
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
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

function SignalBadge({ signal, reason }: { signal?: string; reason?: string }) {
  if (!signal) return null;
  const meta = {
    BUY:   { label: "매수",  icon: TrendingUp,   bg: "bg-emerald-500", text: "text-white" },
    HOLD:  { label: "보유",  icon: Info,          bg: "bg-blue-500",    text: "text-white" },
    WATCH: { label: "관망",  icon: Info,          bg: "bg-amber-500",   text: "text-white" },
    SELL:  { label: "매도",  icon: TrendingDown,  bg: "bg-rose-500",    text: "text-white" },
  }[signal] ?? { label: signal, icon: Info, bg: "bg-slate-200", text: "text-slate-700" };

  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${meta.bg} ${meta.text}`}>
          <Icon className="h-4 w-4" />
          {meta.label} 시그널
        </div>
        {reason && <p className="text-sm text-slate-600">{reason}</p>}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, defaultOpen = true, children }: { title: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 sm:pointer-events-none sm:cursor-default"
      >
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Icon className="h-4 w-4 shrink-0" />
          {title}
        </h3>
        <ChevronDown className={`h-4 w-4 text-slate-400 sm:hidden transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {item.name && (
                <CardTitle className="truncate text-lg font-bold tracking-tight text-slate-950 sm:text-2xl">
                  {item.name}
                </CardTitle>
              )}
              <span className={`font-semibold ${item.name ? "text-sm text-slate-400 sm:text-base" : "text-lg sm:text-2xl font-bold text-slate-950"}`}>
                {item.ticker}
              </span>
              <a
                href={`https://finance.naver.com/item/main.naver?code=${item.ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                title="네이버 금융에서 보기"
                className="text-slate-400 hover:text-slate-700"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <CardDescription className="mt-1 text-sm font-medium text-slate-500">
              {item.sector || "종목 정보"}
            </CardDescription>
          </div>
          <div className="shrink-0 sm:text-right">
            <div className="flex items-baseline gap-1 text-xl font-bold text-slate-950 sm:justify-end sm:text-2xl">
              {item.price?.toLocaleString("ko-KR") ?? "-"}
              <span className="text-sm font-medium text-slate-400">원</span>
            </div>
            {item.change_rate != null && (
              <div
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  isPositive ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
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

      <CardContent className="space-y-5">

        {/* 매수/매도 시그널 */}
        <SignalBadge signal={item.signal} reason={item.signal_reason} />

        {/* AI 분석 요약 */}
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

        {/* 분석 근거 */}
        {item.reasons.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
              <BrainCircuit className="h-4 w-4" />
              분석 근거
            </h3>
            <ul className="space-y-2">
              {item.reasons.map((reason, index) => (
                <li
                  key={`${item.ticker}-reason-${index}`}
                  className="flex gap-2 text-sm leading-6 text-slate-600"
                >
                  <span className="font-bold text-slate-400">{index + 1}.</span>
                  {reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 재무 지표 */}
        {item.financial && (
          <CollapsibleSection title="재무 지표" icon={Info}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "PER", value: item.financial.per ? `${item.financial.per}배` : "-" },
                { label: "PBR", value: item.financial.pbr ? `${item.financial.pbr}배` : "-" },
                { label: "ROE", value: item.financial.roe ? `${item.financial.roe}%` : "-" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">{label}</p>
                  <p className="mt-1 text-base font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
            {(item.financial.debt_ratio != null || item.financial.dividend_yield != null) && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {item.financial.debt_ratio != null && (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-400">부채비율</p>
                    <p className="mt-1 text-base font-bold text-slate-950">{item.financial.debt_ratio}%</p>
                  </div>
                )}
                {item.financial.dividend_yield != null && (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-400">배당수익률</p>
                    <p className="mt-1 text-base font-bold text-slate-950">{item.financial.dividend_yield}%</p>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* 기술적 지표 */}
        {item.price_history && (item.price_history.rsi != null || item.price_history.macd != null || item.price_history.stochastic != null || item.price_history.bollinger != null) && (
          <CollapsibleSection title="기술적 지표" icon={Activity}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {item.price_history.rsi != null && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">RSI(14)</p>
                  <p className={`mt-1 text-base font-bold ${item.price_history.rsi >= 70 ? "text-rose-600" : item.price_history.rsi <= 30 ? "text-emerald-600" : "text-slate-950"}`}>
                    {item.price_history.rsi}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {item.price_history.rsi >= 70 ? "과매수" : item.price_history.rsi <= 30 ? "과매도" : "중립"}
                  </p>
                </div>
              )}
              {item.price_history.macd && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">MACD</p>
                  <p className={`mt-1 text-base font-bold ${item.price_history.macd.histogram > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {item.price_history.macd.macd}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    시그널 {item.price_history.macd.signal} · 히스토그램 {item.price_history.macd.histogram > 0 ? "+" : ""}{item.price_history.macd.histogram}
                  </p>
                </div>
              )}
              {item.price_history.stochastic && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">스토캐스틱</p>
                  <p className={`mt-1 text-base font-bold ${item.price_history.stochastic.k >= 80 ? "text-rose-600" : item.price_history.stochastic.k <= 20 ? "text-emerald-600" : "text-slate-950"}`}>
                    %K {item.price_history.stochastic.k}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {item.price_history.stochastic.k >= 80 ? "과매수" : item.price_history.stochastic.k <= 20 ? "과매도" : "중립"}
                  </p>
                </div>
              )}
              {item.price_history.bollinger && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">볼린저 밴드</p>
                  <p className="mt-1 text-base font-bold text-slate-950">
                    {item.price_history.bollinger.position}%
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    상단 {item.price_history.bollinger.upper.toLocaleString()} · 하단 {item.price_history.bollinger.lower.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* 거시경제 지표 */}
        {item.macro && (
          <CollapsibleSection title="거시경제 지표" icon={BarChart3}>
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">USD/KRW</p>
                <p className="mt-1 font-bold text-slate-900">
                  {item.macro.exchange_rate_usdkrw?.toLocaleString("ko-KR", {
                    maximumFractionDigits: 1,
                  }) ?? "-"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">한국 금리</p>
                <p className="mt-1 font-bold text-slate-900">
                  {item.macro.policy_rate != null ? `${item.macro.policy_rate}%` : "-"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">물가 YoY</p>
                <p className="mt-1 font-bold text-slate-900">
                  {item.macro.inflation_yoy != null ? `${item.macro.inflation_yoy}%` : "-"}
                </p>
              </div>
              {item.macro.fed_funds_rate != null && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">미국 금리</p>
                  <p className="mt-1 font-bold text-slate-900">{item.macro.fed_funds_rate}%</p>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* DART 리스크 공시 */}
        {item.dart.risk_flags.length > 0 && (
          <CollapsibleSection title="DART 리스크 공시" icon={Info}>
            <div className="flex flex-wrap gap-2">
              {item.dart.risk_flags.map((flag) => (
                <Badge
                  key={flag}
                  variant="outline"
                  className="border-rose-100 bg-rose-50 text-xs text-rose-700"
                >
                  {flag}
                </Badge>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* 뉴스 */}
        {item.news?.articles && item.news.articles.length > 0 && (
          <CollapsibleSection title="관련 뉴스" icon={Newspaper}>
            <div className="space-y-2">
              {item.news.articles.slice(0, 4).map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 transition-colors hover:bg-slate-100"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-5 text-slate-800 line-clamp-2">
                      {article.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{article.source}</p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                </a>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* 주요 주주 */}
        {item.shareholders && item.shareholders.length > 0 && (
          <CollapsibleSection title="주요 주주" icon={Users}>
            <div className="space-y-2">
              {item.shareholders.slice(0, 5).map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-700">{s.name}</span>
                  <span className="font-bold text-slate-950">{s.share}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* 타점 분석 */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <Button
            variant="outline"
            onClick={handleEntryExit}
            disabled={entryExitLoading}
            className="h-9 w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {entryExitLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Target className="mr-2 h-4 w-4" />
            )}
            {entryExitLoading ? "AI가 타점 계산 중..." : "AI 타점 분석 (매수·매도 구간)"}
          </Button>

          {entryExitError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{entryExitError}</p>
          )}

          {entryExit && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between bg-slate-950 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-white" />
                  <span className="text-sm font-bold text-white">AI 타점 분석</span>
                  <span className="text-xs text-slate-400">현재가 {entryExit.currency === "USD" ? "$" + entryExit.current_price.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.current_price.toLocaleString("ko-KR") + "원"}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  entryExit.confidence === "high"
                    ? "bg-emerald-500 text-white"
                    : entryExit.confidence === "medium"
                    ? "bg-amber-500 text-white"
                    : "bg-slate-500 text-white"
                }`}>
                  신뢰도 {entryExit.confidence === "high" ? "높음" : entryExit.confidence === "medium" ? "보통" : "낮음"}
                </span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
                <div className="p-4">
                  <p className="text-xs font-semibold text-emerald-600">매수 구간</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {entryExit.currency === "USD" ? "$" + entryExit.entry_low.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.entry_low.toLocaleString("ko-KR")}
                    <span className="mx-1 text-slate-400">~</span>
                    {entryExit.currency === "USD" ? "$" + entryExit.entry_high.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.entry_high.toLocaleString("ko-KR")}
                  </p>
                  <p className="text-[10px] text-slate-400">{entryExit.currency === "USD" ? "USD" : "원"}</p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-blue-600">1차 목표가</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {entryExit.currency === "USD" ? "$" + entryExit.target_1.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.target_1.toLocaleString("ko-KR")}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    +{(((entryExit.target_1 - entryExit.current_price) / entryExit.current_price) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-blue-400">2차 목표가</p>
                  {entryExit.target_2 ? (
                    <>
                      <p className="mt-1 text-sm font-bold text-slate-950">
                        {entryExit.currency === "USD" ? "$" + entryExit.target_2.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.target_2.toLocaleString("ko-KR")}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        +{(((entryExit.target_2 - entryExit.current_price) / entryExit.current_price) * 100).toFixed(1)}%
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">—</p>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-rose-600">손절가</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {entryExit.currency === "USD" ? "$" + entryExit.stop_loss.toLocaleString("en-US", {minimumFractionDigits: 2}) : entryExit.stop_loss.toLocaleString("ko-KR")}
                  </p>
                  <p className="text-[10px] text-rose-400">
                    {(((entryExit.stop_loss - entryExit.current_price) / entryExit.current_price) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs leading-5 text-slate-600">{entryExit.basis}</p>
                <p className="mt-1 text-[10px] text-slate-400">⚠ 투자 판단은 본인 책임이며, AI 분석은 참고용입니다.</p>
              </div>
            </div>
          )}
        </div>

        {/* Q&A 채팅 토글 버튼 */}
        <div className="border-t border-slate-100 pt-4">
          <Button
            variant="outline"
            onClick={() => setChatOpen((v) => !v)}
            className="h-9 w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            {chatOpen ? "AI 질문 닫기" : `${item.ticker}에 대해 AI에게 질문하기`}
          </Button>
        </div>

        {/* Q&A 채팅 패널 */}
        {chatOpen && (
          <section className="rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <MessageSquare className="h-4 w-4" />
                AI Q&amp;A — {item.ticker}
              </h3>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
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
                      "max-w-[85%] rounded-lg px-3 py-2.5",
                      msg.role === "user"
                        ? "bg-slate-950 text-sm leading-6 text-white"
                        : "border border-slate-200 bg-white"
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
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    AI가 답변 중입니다...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={sendMessage}
              className="flex gap-2 border-t border-slate-200 px-4 py-3"
            >
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="예: 이 종목 지금 매수 타이밍인가요?"
                className="h-9 border-slate-200 bg-white text-sm"
                disabled={chatLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={chatLoading || !chatInput.trim()}
                className="h-9 w-9 shrink-0 bg-slate-950 text-white hover:bg-slate-800"
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
