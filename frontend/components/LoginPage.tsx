"use client";

import React, { useState } from "react";
import { login } from "@/lib/auth";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950">
          <Lock className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-950">Stock Analysis AI</h1>
        <p className="-mt-4 text-sm text-slate-500">비밀번호를 입력하여 접속하세요.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-950"
          autoFocus
        />
        {error && <p className="-mt-2 text-sm text-red-500">{error}</p>}
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-950 text-white hover:bg-slate-800"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "접속하기"}
        </Button>
      </form>
    </div>
  );
}
