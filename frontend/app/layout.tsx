"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import type { NavItem } from "@/components/AppSidebar";
import { fetchMacro, screenStocks } from "@/lib/api";
import type { MacroSnapshot, ScreenResponse } from "@/lib/api";
import "./globals.css";

export type SearchContextType = {
  screenResult: ScreenResponse | null;
  screenLoading: boolean;
  screenError: string | null;
  lastTicker: string;
  handleTickerSearch?: (input: string | React.FormEvent) => Promise<void>;
  setLastTicker?: (val: string) => void;
};

export const SearchContext = createContext<SearchContextType>({
  screenResult: null,
  screenLoading: false,
  screenError: null,
  lastTicker: "",
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

  async function handleTickerSearch(input: string | React.FormEvent) {
    if (typeof input !== "string") {
      input.preventDefault();
    }
    
    const ticker = typeof input === "string" ? input : tickerInput.trim();
    if (!ticker) return;

    if (typeof input !== "string") setTickerInput(""); // 입력창 초기화
    
    setSearchLoading(true);
    setScreenLoading(true);
    setScreenError(null);
    setLastTicker(ticker);

    try {
      const result = await screenStocks({
        id: crypto.randomUUID(),
        tickers: [ticker],
        user_profile: {
          risk_tolerance: "medium",
          preferred_style: ["value", "quality"],
          horizon: "mid",
        },
        preferences: {
          min_score: 0,
          top_k: 1,
          require_liquidity: true,
        },
      });
      setScreenResult(result);
    } catch (error) {
      console.error("Ticker screen failed:", error);
      setScreenError("분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSearchLoading(false);
      setScreenLoading(false);
    }
  }

  return (
    <html lang="ko" className="h-full">
      <body className="h-full overflow-hidden bg-slate-100 text-slate-950 antialiased">
        <div className="flex h-screen w-screen overflow-hidden">
          <AppSidebar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((value) => !value)}
            activeNav={activeNav}
            onNavChange={setActiveNav}
            tickerInput={tickerInput}
            onTickerInputChange={setTickerInput}
            onTickerSearch={handleTickerSearch}
            searchLoading={searchLoading}
            macro={macro}
            macroLoading={macroLoading}
          />
          <SearchContext.Provider value={{ 
            screenResult, 
            screenLoading, 
            screenError, 
            lastTicker, 
            handleTickerSearch, 
            setLastTicker 
          }}>
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          </SearchContext.Provider>
        </div>
      </body>
    </html>
  );
}
