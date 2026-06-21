"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, Save, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSearchContext } from "@/app/layout";
import type { UserProfileType } from "@/app/layout";

const RISK_OPTIONS: { id: UserProfileType["risk_tolerance"]; label: string; desc: string }[] = [
  { id: "low", label: "보수적", desc: "안정성 우선, 리스크 최소화" },
  { id: "medium", label: "중립적", desc: "수익과 안정의 균형" },
  { id: "high", label: "공격적", desc: "높은 수익 추구, 변동성 수용" },
];

const STYLE_OPTIONS: {
  id: UserProfileType["preferred_style"][number];
  label: string;
  desc: string;
  tooltip?: string;
}[] = [
  { id: "lowPER", label: "저PER", desc: "저평가 주식" },
  { id: "lowPBR", label: "저PBR", desc: "자산 대비 저평가" },
  { id: "highROE", label: "고ROE", desc: "높은 수익성" },
  { id: "value", label: "가치투자", desc: "내재 가치 중심" },
  { id: "quality", label: "퀄리티", desc: "우량 기업 중심" },
  {
    id: "quant",
    label: "퀀트",
    desc: "수치 기반 체계적 선별",
    tooltip: "PER·PBR·ROE·모멘텀 등 여러 재무 지표를 수식·통계 모델로 조합해 감정 없이 종목을 선별하는 방식입니다.",
  },
];

const HORIZON_OPTIONS: { id: UserProfileType["horizon"]; label: string; desc: string }[] = [
  { id: "short", label: "단기", desc: "3개월 이내" },
  { id: "mid", label: "중기", desc: "6~12개월" },
  { id: "long", label: "장기", desc: "1년 이상" },
];

export function ProfilePage() {
  const { userProfile, setUserProfile } = useSearchContext();
  const [local, setLocal] = useState<UserProfileType>(userProfile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocal(userProfile);
  }, [userProfile]);

  function toggleStyle(style: UserProfileType["preferred_style"][number]) {
    setLocal((prev) => ({
      ...prev,
      preferred_style: prev.preferred_style.includes(style)
        ? prev.preferred_style.filter((s) => s !== style)
        : [...prev.preferred_style, style],
    }));
  }

  function handleSave() {
    setUserProfile(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isDirty = JSON.stringify(local) !== JSON.stringify(userProfile);

  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6">

        <header className="border-b border-slate-200 pb-4 sm:pb-5">
          <div className="mb-2 flex items-center gap-2">
            <Badge className="border-0 bg-slate-950 text-white">투자 프로필</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">나의 투자 성향</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            설정한 투자 성향이 AI 분석 점수와 종목 추천에 반영됩니다.
          </p>
        </header>

        <div className="space-y-5">
          {/* 리스크 허용도 */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-950">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              리스크 허용도
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              {RISK_OPTIONS.map((opt) => {
                const active = local.risk_tolerance === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLocal((p) => ({ ...p, risk_tolerance: opt.id }))}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors sm:p-4",
                      active
                        ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <p className="text-sm font-bold">{opt.label}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs leading-5",
                        active ? "text-slate-300" : "text-slate-400"
                      )}
                    >
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 투자 스타일 */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-950">
              <TrendingUp className="h-5 w-5 text-slate-700" />
              투자 스타일
              <span className="text-xs font-normal text-slate-400">(복수 선택 가능)</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((opt) => {
                const active = local.preferred_style.includes(opt.id);
                return (
                  <div key={opt.id} className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => toggleStyle(opt.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors",
                        active
                          ? "border-slate-950 bg-slate-950 font-semibold text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                      <span>{opt.label}</span>
                      <span className={cn("text-xs", active ? "text-slate-300" : "text-slate-400")}>
                        {opt.desc}
                      </span>
                    </button>
                    {opt.tooltip && (
                      <p className="max-w-[220px] px-1 text-xs leading-5 text-slate-400">
                        {opt.tooltip}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 투자 기간 */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-950">
              <Clock className="h-5 w-5 text-slate-700" />
              투자 기간
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              {HORIZON_OPTIONS.map((opt) => {
                const active = local.horizon === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLocal((p) => ({ ...p, horizon: opt.id }))}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors sm:p-4",
                      active
                        ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <p className="text-sm font-bold">{opt.label}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        active ? "text-slate-300" : "text-slate-400"
                      )}
                    >
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={!isDirty && !saved}
          className={cn(
            "h-11 transition-colors",
            saved
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50"
          )}
        >
          <Save className="mr-2 h-4 w-4" />
          {saved ? "저장됨! 다음 분석부터 반영됩니다" : "프로필 저장"}
        </Button>
      </div>
    </div>
  );
}
