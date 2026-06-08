"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Lock, Wallet, TrendingUp, ShieldCheck, RefreshCw, BarChart3 } from "lucide-react";

const UPCOMING_FEATURES = [
  { icon: RefreshCw, label: "보유 종목 자동 동기화", desc: "Toss 계좌의 종목을 실시간으로 불러옵니다." },
  { icon: TrendingUp, label: "매수 평균가 기반 수익률", desc: "매수가 대비 현재 수익률을 계산합니다." },
  { icon: ShieldCheck, label: "포트폴리오 리스크 진단", desc: "섹터 편중, 변동성 리스크를 분석합니다." },
  { icon: BarChart3, label: "AI 리밸런싱 추천", desc: "투자 성향에 맞는 비중 조정을 제안합니다." },
];

export function PortfolioPage() {
  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-6 py-5">

        <header className="border-b border-slate-200 pb-5">
          <div className="mb-2 flex items-center gap-2">
            <Badge className="border-0 bg-slate-950 text-white">내 포트폴리오</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">보유 종목 현황</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Toss 계좌를 연동하면 실제 보유 종목을 기반으로 AI 분석을 자동 실행합니다.
          </p>
        </header>

        {/* 준비 중 안내 */}
        <div className="flex flex-col items-center gap-5 rounded-lg border border-slate-200 bg-white py-14 shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Wallet className="h-8 w-8 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-slate-950">Toss 계좌 연동 준비 중</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Toss Open Banking API 연동이 완료되면 보유 종목을 자동으로 불러와
              AI 분석에 바로 활용할 수 있습니다.
            </p>
          </div>
        </div>

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
