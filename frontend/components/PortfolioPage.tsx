"use client";

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Lock, Wallet, TrendingUp, ShieldCheck, RefreshCw, BarChart3, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/auth";

const UPCOMING_FEATURES = [
  { icon: RefreshCw, label: "보유 종목 자동 동기화", desc: "증권사 계좌의 종목을 실시간으로 불러옵니다." },
  { icon: TrendingUp, label: "매수 평균가 기반 수익률", desc: "매수가 대비 현재 수익률을 계산합니다." },
  { icon: ShieldCheck, label: "포트폴리오 리스크 진단", desc: "섹터 편중, 변동성 리스크를 분석합니다." },
  { icon: BarChart3, label: "AI 리밸런싱 추천", desc: "투자 성향에 맞는 비중 조정을 제안합니다." },
];

type Holding = {
  ticker: string;
  name: string;
  quantity: number;
  avg_price: number;
  currency?: string;
};

export function PortfolioPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const res = await fetch(`${API_BASE}/api/holdings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        alert(`연동 실패: ${errBody.detail ?? res.statusText}`);
        return;
      }
      const data = await res.json();
      const items = data?.holdings ?? data?.result?.items ?? [];
      if (!items.length) {
        alert("계좌에 보유 종목이 없습니다. 계좌를 확인해주세요.");
        return;
      }
      const mapped: Holding[] = items.map((item: any) => ({
        ticker: item.symbol ?? item.ticker,
        name: item.name ?? "",
        quantity: Number(item.quantity ?? 0),
        avg_price: Number(item.averagePurchasePrice ?? item.avg_price ?? 0),
        currency: item.currency ?? "KRW",
      }));
      setHoldings(mapped);
      setIsConnected(true);
    } catch (e) {
      alert("연동 실패: 백엔드 서버가 켜져 있는지 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6">

        <header className="border-b border-slate-200 pb-4 sm:pb-5">
          <div className="mb-2 flex items-center gap-2">
            <Badge className="border-0 bg-slate-950 text-white">내 포트폴리오</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">보유 종목 현황</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            증권사 계좌를 연동하면 실제 보유 종목을 기반으로 AI 분석을 자동 실행합니다.
          </p>
        </header>

        {/* 연동 상태 섹션 */}
        <div className="flex flex-col items-center gap-5 rounded-lg border border-slate-200 bg-white px-4 py-10 shadow-sm sm:px-0 sm:py-14">
          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${isConnected ? "bg-emerald-100" : "bg-slate-100"}`}>
            {isConnected 
              ? <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              : <Wallet className="h-8 w-8 text-slate-400" />}
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-slate-950">
              {isConnected ? "계좌 연동 완료" : "계좌 연동이 필요합니다"}
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
              {isConnected 
                ? "최근 동기화: 방금 전"
                : "아래 버튼을 눌러 연동을 시작하세요."}
            </p>
            {!isConnected && (
              <Button 
                onClick={handleConnect} 
                disabled={loading}
                className="mt-6 bg-slate-950 text-white hover:bg-slate-800"
              >
                {loading ? "연동 중..." : "지금 계좌 연동하기"}
              </Button>
            )}
          </div>
        </div>

        {/* 실제 보유 종목 리스트 표시 */}
        {isConnected && holdings.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-950">실제 보유 종목 ({holdings.length})</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {holdings.map((stock) => (
                <div key={stock.ticker} className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-500">
                      {stock.ticker.slice(-3)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-950">{stock.name}</p>
                      <p className="text-xs text-slate-500">{stock.ticker}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{stock.quantity} 주</p>
                    <p className="text-[11px] text-slate-400">
                      평단: {stock.currency === "USD" ? "$" : ""}
                      {stock.avg_price.toLocaleString()}
                      {stock.currency === "USD" ? "" : "원"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 예정 기능 */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-950">연동 후 사용 가능한 기능</h2>
          <div className="space-y-3">
            {UPCOMING_FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white shadow-sm">
                  <Lock className="h-3.5 w-3.5 text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
