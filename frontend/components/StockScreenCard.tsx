"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
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
  fetchEntryExit,
  fetchTossOrderbook,
  fetchTossTrades,
  fetchTossPriceLimits,
  fetchTossCandles,
} from "@/lib/api";
import type {
  StockScreenResult,
  EntryExitResult,
  TossOrderbook,
  TossTrade,
  TossPriceLimit,
  TossCandle,
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

  const [priceLimit, setPriceLimit] = React.useState<TossPriceLimit | null>(null);
  const [orderbook, setOrderbook] = React.useState<TossOrderbook | null>(null);
  const [trades, setTrades] = React.useState<TossTrade[]>([]);
  const [candles, setCandles] = React.useState<TossCandle[]>([]);
  const [tossLoading, setTossLoading] = React.useState(true);
  const [orderbookLoading, setOrderbookLoading] = React.useState(false);

  React.useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatOpen]);

  React.useEffect(() => {
    async function loadTossData() {
      setTossLoading(true);
      const [pl, c, t] = await Promise.all([
        fetchTossPriceLimits(item.ticker),
        fetchTossCandles(item.ticker, "1d", 20),
        fetchTossTrades(item.ticker, 15),
      ]);
      if (pl) setPriceLimit(pl);
      if (c.length > 0) setCandles(c);
      if (t.length > 0) setTrades(t);
      setTossLoading(false);
    }
    loadTossData();
  }, [item.ticker]);

  async function handleLoadOrderbook() {
    setOrderbookLoading(true);
    const ob = await fetchTossOrderbook(item.ticker);
    if (ob) setOrderbook(ob);
    setOrderbookLoading(false);
  }

  const newsContext = item.news?.articles
    ?.slice(0, 5)
    .map((a, idx) => `뉴스${idx + 1}: ${a.title} [출처: ${a.source}] [URL: ${a.url}]`)
    .join(" || ");

  const ph = item.price_history;
  const contextSummary = [
    `종목: ${item.ticker}`,
    item.price ? `현재가: ${item.price.toLocaleString("ko-KR")}원` : null,
    item.change_rate !== undefined ? `당일변동: ${item.change_rate}%` : null,
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
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
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
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {item.name && (
                <CardTitle className="truncate text-2xl font-bold tracking-tight text-slate-950">
                  {item.name}
                </CardTitle>
              )}
              <span className={`font-semibold ${item.name ? "text-base text-slate-400" : "text-2xl font-bold text-slate-950"}`}>
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
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              <Info className="h-4 w-4" />
              재무 지표
            </h3>
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
          </section>
        )}

        {/* 거시경제 지표 */}
        {item.macro && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              <BarChart3 className="h-4 w-4" />
              거시경제 지표
            </h3>
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
          </section>
        )}

        {/* DART 리스크 공시 */}
        {item.dart.risk_flags.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-700">
              <Info className="h-4 w-4" />
              DART 리스크 공시
            </h3>
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
          </section>
        )}

        {/* 뉴스 */}
        {item.news?.articles && item.news.articles.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              <Newspaper className="h-4 w-4" />
              관련 뉴스
            </h3>
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
          </section>
        )}

        {/* 주요 주주 */}
        {item.shareholders && item.shareholders.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              <Users className="h-4 w-4" />
              주요 주주
            </h3>
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
          </section>
        )}

        {/* ── Toss 시장 데이터 ────────────────────────────────────────────── */}
        {!tossLoading && (
          <section className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <BarChart3 className="h-4 w-4" />
              Toss 시장 데이터
            </h3>

            {/* 상/하한가 */}
            {priceLimit && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] font-semibold text-rose-500">상한가</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {priceLimit.upperLimit.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">기준가</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {priceLimit.basePrice.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-blue-500">하한가</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {priceLimit.lowerLimit.toLocaleString("ko-KR")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 호가 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-500">호가</p>
                <button
                  type="button"
                  onClick={handleLoadOrderbook}
                  disabled={orderbookLoading}
                  className="text-[11px] text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {orderbookLoading ? "로딩 중..." : orderbook ? "새로고침" : "호가 불러오기"}
                </button>
              </div>
              {orderbook && (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold text-slate-400 pb-1 border-b border-slate-200">
                    <span>매도호가</span>
                    <span>수량</span>
                    <span>매수호가</span>
                    <span>수량</span>
                  </div>
                  {orderbook.asks.slice(0, 5).map((ask, i) => {
                    const bid = orderbook.bids[i];
                    return (
                      <div key={i} className="flex justify-between text-slate-700">
                        <span className="text-blue-600 font-medium">{ask.price.toLocaleString("ko-KR")}</span>
                        <span className="text-slate-500">{ask.quantity.toLocaleString()}</span>
                        <span className="text-rose-600 font-medium">{bid ? bid.price.toLocaleString("ko-KR") : "-"}</span>
                        <span className="text-slate-500">{bid ? bid.quantity.toLocaleString() : "-"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 최근 체결 내역 */}
            {trades.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">최근 체결</p>
                <div className="max-h-[160px] overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">가격</th>
                        <th className="px-2 py-1.5 text-right font-medium">수량</th>
                        <th className="px-2 py-1.5 text-right font-medium">체결</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 15).map((t, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className={`px-2 py-1 font-medium ${t.side === "BUY" ? "text-rose-600" : "text-blue-600"}`}>
                            {t.price.toLocaleString("ko-KR")}
                          </td>
                          <td className="px-2 py-1 text-right text-slate-600">{t.quantity.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right text-slate-400">
                            {t.side === "BUY" ? "매수" : "매도"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 캔들 차트 요약 */}
            {candles.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">최근 {candles.length}일 종가</p>
                <div className="flex items-end gap-0.5 h-20">
                  {candles.slice(-20).map((c, i) => {
                    const prices = candles.slice(-20).map((x) => x.close);
                    const max = Math.max(...prices);
                    const min = Math.min(...prices);
                    const range = max - min || 1;
                    const h = ((c.close - min) / range) * 100;
                    const isUp = c.close >= (candles.slice(-20)[Math.max(0, i - 1)]?.close ?? c.close);
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm"
                        style={{ height: `${Math.max(h, 3)}%` }}
                        title={`${new Date(c.timestamp).toLocaleDateString("ko-KR")} ${c.close.toLocaleString("ko-KR")}원`}
                      >
                        <div
                          className={`h-full w-full rounded-t-sm ${isUp ? "bg-rose-400" : "bg-blue-400"}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
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
                  <span className="text-xs text-slate-400">현재가 {entryExit.current_price.toLocaleString("ko-KR")}원</span>
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
                    {entryExit.entry_low.toLocaleString("ko-KR")}
                    <span className="mx-1 text-slate-400">~</span>
                    {entryExit.entry_high.toLocaleString("ko-KR")}
                  </p>
                  <p className="text-[10px] text-slate-400">원</p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-blue-600">1차 목표가</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {entryExit.target_1.toLocaleString("ko-KR")}
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
                        {entryExit.target_2.toLocaleString("ko-KR")}
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
                    {entryExit.stop_loss.toLocaleString("ko-KR")}
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
