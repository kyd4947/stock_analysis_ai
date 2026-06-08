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
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { askStockQuestion } from "@/lib/api";
import type { StockScreenResult } from "@/lib/api";

type StockScreenCardProps = {
  item: StockScreenResult;
  compact?: boolean;
  onSelect?: () => void;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function scoreMeta(score: number) {
  if (score >= 0.8)
    return { label: "High", className: "bg-emerald-50 text-emerald-700 border-emerald-100" };
  if (score >= 0.6)
    return { label: "Medium", className: "bg-amber-50 text-amber-700 border-amber-100" };
  return { label: "Low", className: "bg-rose-50 text-rose-700 border-rose-100" };
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

  React.useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatOpen]);

  const contextSummary = [
    `종목: ${item.ticker}`,
    item.price ? `현재가: ${item.price.toLocaleString("ko-KR")}원` : null,
    item.change_rate !== undefined ? `변동: ${item.change_rate}%` : null,
    `AI 점수: ${scorePercent}점 (${score.label})`,
    item.sector ? `섹터: ${item.sector}` : null,
    `PER: ${item.financial.per ?? "-"}, PBR: ${item.financial.pbr ?? "-"}, ROE: ${item.financial.roe ?? "-"}%`,
    `AI 요약: ${item.summary}`,
    item.dart.risk_flags.length > 0
      ? `리스크 공시: ${item.dart.risk_flags.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const answer = await askStockQuestion(item.ticker, q, contextSummary);
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "죄송합니다. 답변 생성에 실패했습니다. 잠시 후 다시 시도해주세요." },
      ]);
    } finally {
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
              <CardTitle className="truncate text-2xl font-bold tracking-tight text-slate-950">
                {item.ticker}
              </CardTitle>
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
                      "max-w-[85%] rounded-lg px-3 py-2.5 text-sm leading-6",
                      msg.role === "user"
                        ? "bg-slate-950 text-white"
                        : "border border-slate-200 bg-white text-slate-700"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
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
