export type ScreenRequest = {
  id: string;
  tickers: string[];
  user_profile: {
    risk_tolerance: "low" | "medium" | "high";
    preferred_style: Array<"lowPER" | "lowPBR" | "highROE" | "value" | "quality" | "quant">;
    horizon: "short" | "mid" | "long";
  };
  preferences: {
    min_score: number;
    top_k: number;
    require_liquidity: boolean;
  };
};

export type StockScreenResult = {
  ticker: string;
  name?: string;
  score: number;
  signal?: "BUY" | "SELL" | "HOLD";
  signal_reason?: string;
  summary: string;
  reasons: string[];
  price?: number;
  change_rate?: number;
  change_value?: number;
  sector?: string;
  macro: {
    exchange_rate_usdkrw: number;
    policy_rate: number;
    inflation_yoy: number;
    us_10y_yield?: number;
    fed_funds_rate?: number;
  };
  financial: {
    per: number | null;
    pbr: number | null;
    roe: number | null;
  };
  dart: {
    risk_flags: string[];
    highlights: string[];
  };
  news?: {
    articles: Array<{
      title: string;
      url: string;
      source: string;
    }>;
  };
  shareholders?: Array<{
    name: string;
    share: string;
  }>;
};

export type ScreenResponse = {
  request_id: string;
  results: StockScreenResult[];
};

export type IndexSnapshot = {
  price: number;
  change_val: number;
  change_rate: number;
  positive: boolean;
};

export type MacroSnapshot = {
  exchange_rate_usdkrw?: number;
  policy_rate?: number;
  fed_funds_rate?: number;
  kospi?: IndexSnapshot;
  kosdaq?: IndexSnapshot;
  usd_krw?: IndexSnapshot;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * Why:
 * - 백엔드와의 통신 포인트를 한 곳(`lib/api.ts`)으로 모아두면,
 *   API 경로/에러처리 방식을 나중에 쉽게 일괄 변경할 수 있습니다.
 */
export async function screenStocks(request: ScreenRequest): Promise<ScreenResponse> {
  try{
    const res = await fetch(`${API_BASE_URL}/api/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept" : "application/json"},
      // Why:
      // - 브라우저에서 실행되는 경우 쿠키 인증 등이 필요할 수 있어 credentials 옵션을 고려할 수 있습니다.
      // - 스켈레톤에서는 기본 false로 두어 CORS 설정을 최소화합니다.
      // credentials: "omit",
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to screen stocks: ${res.status} ${errorText}`);
    }

    return await res.json();
  } catch (error) {
    console.error("통신 실패 : ", error);
    throw error;
  }

}

export async function fetchMacro(): Promise<MacroSnapshot> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/macro`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`Macro API returned ${res.status}`);
      return {};
    }

    return res.json();
  } catch (error) {
    console.warn("Macro fetch failed:", error);
    return {};
  }
}

export async function fetchMarketNews(): Promise<
  Array<{ title: string; url: string; source: string; publishedAt?: string }>
> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/market-news`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.articles ?? [];
  } catch {
    return [];
  }
}

export type MarketInsight = {
  interpretation: string;
  risk_appetite: string;
  recommended_weight: number;
  sectors: Array<{ name: string; score: number }>;
  recommended_tickers?: Array<{ ticker: string; name: string; sector: string }>;
  generated_at?: string | null;
};

export async function fetchMarketInsight(): Promise<MarketInsight | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/market-insight`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export type PriceResult = {
  ticker: string;
  name?: string;
  price?: number;
  change_rate?: number;
  change_value?: number;
};

export async function fetchPrices(tickers: string[]): Promise<PriceResult[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ tickers }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function searchStocks(
  query: string
): Promise<Array<{ ticker: string; name: string }>> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}&limit=10`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function askStockQuestion(
  ticker: string,
  question: string,
  contextSummary?: string
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ticker,
      question,
      context_summary: contextSummary,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to ask question: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return data.answer;
}