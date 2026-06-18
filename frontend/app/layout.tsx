"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { LoginPage } from "@/components/LoginPage";
import type { NavItem } from "@/components/AppSidebar";
import { fetchMacro, screenStocks } from "@/lib/api";

import type { MacroSnapshot, ScreenResponse } from "@/lib/api";
import "./globals.css";

export type UserProfileType = {
  risk_tolerance: "low" | "medium" | "high";
  preferred_style: Array<"lowPER" | "lowPBR" | "highROE" | "value" | "quality" | "quant">;
  horizon: "short" | "mid" | "long";
};

const DEFAULT_USER_PROFILE: UserProfileType = {
  risk_tolerance: "medium",
  preferred_style: ["value", "quality"],
  horizon: "mid",
};

export type SearchContextType = {
  screenResult: ScreenResponse | null;
  screenLoading: boolean;
  screenError: string | null;
  lastTicker: string;
  handleTickerSearch?: (input: string | React.FormEvent) => Promise<void>;
  setLastTicker?: (val: string) => void;
  clearResult?: () => void;
  activeNav: NavItem;
  setActiveNav: (nav: NavItem) => void;
  userProfile: UserProfileType;
  setUserProfile: (profile: UserProfileType) => void;
  macro: MacroSnapshot | null;
  macroLoading: boolean;
};

export const SearchContext = createContext<SearchContextType>({
  screenResult: null,
  screenLoading: false,
  screenError: null,
  lastTicker: "",
  activeNav: "analysis",
  setActiveNav: () => {},
  userProfile: DEFAULT_USER_PROFILE,
  setUserProfile: () => {},
  macro: null,
  macroLoading: false,
});

export function useSearchContext() {
  return useContext(SearchContext);
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNavState] = useState<NavItem>("analysis");
  const [searchLoading, setSearchLoading] = useState(false);
  const [macro, setMacro] = useState<MacroSnapshot | null>(null);
  const [macroLoading, setMacroLoading] = useState(false);

  useEffect(() => {
    setAuthChecked(true);
  }, []);

  const [screenResult, setScreenResult] = useState<ScreenResponse | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [lastTicker, setLastTicker] = useState("");

  const [userProfile, setUserProfileState] = useState<UserProfileType>(DEFAULT_USER_PROFILE);

  useEffect(() => {
    const stored = localStorage.getItem("user_profile");
    if (stored) {
      try { setUserProfileState(JSON.parse(stored)); } catch {}
    }
    const savedNav = localStorage.getItem("active_nav") as NavItem | null;
    const validNavs: NavItem[] = ["analysis", "watchlist", "portfolio", "profile"];
    if (savedNav && validNavs.includes(savedNav)) {
      setActiveNavState(savedNav);
    }
  }, []);

  function setActiveNav(nav: NavItem) {
    setActiveNavState(nav);
    localStorage.setItem("active_nav", nav);
  }

  useEffect(() => {
    if (!authenticated) return;
    let firstLoad = true;
    async function loadMacro() {
      if (firstLoad) setMacroLoading(true);
      try {
        setMacro(await fetchMacro());
      } finally {
        if (firstLoad) {
          setMacroLoading(false);
          firstLoad = false;
        }
      }
    }
    loadMacro();
    const id = setInterval(loadMacro, 15_000);
    return () => clearInterval(id);
  }, [authenticated]);

  async function handleTickerSearch(input: string | React.FormEvent) {
    if (typeof input !== "string") {
      input.preventDefault();
    }

    const ticker = typeof input === "string" ? input.trim() : "";
    if (!ticker) return;

    setSearchLoading(true);
    setScreenLoading(true);
    setScreenError(null);
    setLastTicker(ticker);
    setActiveNav("analysis");

    try {
      const result = await screenStocks({
        id: crypto.randomUUID(),
        tickers: [ticker],
        user_profile: userProfile,
        preferences: {
          min_score: 0,
          top_k: 1,
          require_liquidity: true,
        },
      });
      if (result.results.length === 0) {
        setScreenError("종목 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요. (데이터 서버 일시 오류)");
        setScreenResult(null);
      } else {
        sessionStorage.setItem("lastSearchTicker", ticker);
        setScreenResult(result);
        if (result.results[0].name) {
          setLastTicker(result.results[0].name);
        }
      }
    } catch (error) {
      console.error("Ticker screen failed:", error);
      const isConnErr =
        error instanceof TypeError &&
        (error.message.includes("fetch") || error.message.includes("Failed to fetch") || error.message.includes("NetworkError"));
      setScreenError(
        isConnErr
          ? "백엔드 서버에 연결할 수 없습니다. Railway/Render에 배포 후 Vercel 환경변수 NEXT_PUBLIC_API_BASE_URL을 설정해주세요."
          : "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
      );
    } finally {
      setSearchLoading(false);
      setScreenLoading(false);
    }
  }

  function setUserProfile(profile: UserProfileType) {
    setUserProfileState(profile);
    localStorage.setItem("user_profile", JSON.stringify(profile));
  }

  function clearResult() {
    setScreenResult(null);
    setScreenError(null);
    setLastTicker("");
    sessionStorage.removeItem("lastSearchTicker");
  }

  // 새로고침 복원: 마지막 검색 종목 자동 재조회
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = sessionStorage.getItem("lastSearchTicker");
    if (saved) handleTickerSearch(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authChecked) {
    return (
      <html lang="ko" className="h-full">
        <body className="h-full bg-slate-100" />
      </html>
    );
  }

  if (!authenticated) {
    return (
      <html lang="ko" className="h-full">
        <body className="h-full bg-slate-100">
          <LoginPage onLogin={() => { setAuthenticated(true); }} />
        </body>
      </html>
    );
  }

  return (
    <html lang="ko" className="h-full">
      <body className="h-full overflow-hidden bg-slate-100 text-slate-950 antialiased">
        <div className="flex h-screen w-screen overflow-hidden">
          <AppSidebar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((v) => !v)}
            activeNav={activeNav}
            onNavChange={setActiveNav}
            onLogoClick={() => { clearResult(); setActiveNav("analysis"); }}
            onTickerSearch={handleTickerSearch}
            searchLoading={searchLoading}
            macro={macro}
            macroLoading={macroLoading}
          />
          <SearchContext.Provider
            value={{
              screenResult,
              screenLoading,
              screenError,
              lastTicker,
              handleTickerSearch,
              setLastTicker,
              clearResult,
              activeNav,
              setActiveNav,
              userProfile,
              setUserProfile,
              macro,
              macroLoading,
            }}
          >
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          </SearchContext.Provider>
        </div>
      </body>
    </html>
  );
}
