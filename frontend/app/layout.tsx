"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import type { NavItem } from "@/components/AppSidebar";
import { fetchMacro, screenStocks } from "@/lib/api";
import type { MacroSnapshot, ScreenResponse } from "@/lib/api";
import "./globals.css";

export type UserProfileType = {
  risk_tolerance: "low" | "medium" | "high";
  preferred_style: Array<"lowPER" | "lowPBR" | "highROE" | "value" | "quality">;
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
});

export function useSearchContext() {
  return useContext(SearchContext);
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<NavItem>("analysis");
  const [tickerInput, setTickerInput] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [macro, setMacro] = useState<MacroSnapshot | null>(null);
  const [macroLoading, setMacroLoading] = useState(false);

  const [screenResult, setScreenResult] = useState<ScreenResponse | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [lastTicker, setLastTicker] = useState("");

  const [userProfile, setUserProfileState] = useState<UserProfileType>(DEFAULT_USER_PROFILE);

  useEffect(() => {
    const stored = localStorage.getItem("user_profile");
    if (stored) {
      try {
        setUserProfileState(JSON.parse(stored));
      } catch {}
    }
  }, []);

  useEffect(() => {
    async function loadMacro() {
      setMacroLoading(true);
      try {
        setMacro(await fetchMacro());
      } finally {
        setMacroLoading(false);
      }
    }
    loadMacro();
  }, []);

  // 한글 종목명 → 티커 변환 맵
  const KR_NAME_TO_TICKER: Record<string, string> = {
    "삼성전자": "005930", "sk하이닉스": "000660", "SK하이닉스": "000660",
    "하이닉스": "000660", "naver": "035420", "NAVER": "035420", "네이버": "035420",
    "삼성바이오로직스": "207940", "현대자동차": "005380", "현대차": "005380",
    "lg화학": "051910", "LG화학": "051910", "삼성sdi": "006400", "삼성SDI": "006400",
    "카카오": "035720", "기아": "000270", "kb금융": "105560", "KB금융": "105560",
    "신한지주": "055550", "sk이노베이션": "096770", "SK이노베이션": "096770",
    "lg": "003550", "LG": "003550", "sk텔레콤": "017670", "SK텔레콤": "017670",
    "kt": "030200", "KT": "030200", "셀트리온": "068270", "kakao": "035720",
    "포스코홀딩스": "005490", "포스코": "005490", "현대모비스": "012330",
    "lg전자": "066570", "LG전자": "066570", "삼성물산": "028260",
  };

  async function handleTickerSearch(input: string | React.FormEvent) {
    if (typeof input !== "string") {
      input.preventDefault();
    }

    const raw = typeof input === "string" ? input : tickerInput.trim();
    if (!raw) return;

    // 한글 이름이면 티커로 변환, 아니면 그대로 대문자로 정규화
    const ticker = KR_NAME_TO_TICKER[raw] ?? KR_NAME_TO_TICKER[raw.toLowerCase()] ?? raw.trim();
    if (!ticker) return;

    if (typeof input !== "string") setTickerInput("");

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
      setScreenResult(result);
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
            tickerInput={tickerInput}
            onTickerInputChange={setTickerInput}
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
            }}
          >
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          </SearchContext.Provider>
        </div>
      </body>
    </html>
  );
}
