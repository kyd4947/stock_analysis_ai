"use client";

import React, { useState } from "react";
import { login } from "@/lib/auth";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoBadge } from "@/components/Logo";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password) { setError("비밀번호를 입력해주세요."); return; }
    setLoading(true);
    try {
      await login(password);
      onLogin();
    } catch {
      setError("비밀번호가 올바르지 않습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-pop"
      >
        <div className="flex flex-col items-center">
          <LogoBadge className="h-12 w-12 rounded-2xl" />
          <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Stock Analysis AI</h1>
          <p className="mt-1 text-sm text-slate-500">비밀번호를 입력해 접속하세요</p>
        </div>

        <div className="relative mt-8">
          <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="h-11 w-full rounded-xl border border-input bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
            autoFocus
          />
        </div>
        {error && <p className="mt-2.5 text-sm font-medium text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="mt-5 h-11 w-full rounded-xl text-[15px] font-semibold"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "접속하기"}
        </Button>

        <p className="mt-6 text-center text-[11px] leading-4 text-slate-400">
          접속 후 7일간 로그인이 유지됩니다.
        </p>
      </form>
    </div>
  );
}
