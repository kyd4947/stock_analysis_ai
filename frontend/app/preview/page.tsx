"use client";

import React from "react";
import { StockScreenCard } from "@/components/StockScreenCard";
import { ProfilePage } from "@/components/ProfilePage";
import type { StockScreenResult } from "@/lib/api";

const MOCK: StockScreenResult = {
  ticker: "005930",
  name: "삼성전자",
  score: 0.82,
  signal: "BUY",
  signal_reason:
    "HBM 수주 확대와 외국인 순매수 전환이 겹쳤습니다. 다만 현재 주가는 52주 고점권이라 추격 매수보다 조정 눌림목 진입이 안전합니다.",
  summary:
    "메모리 사이클 회복이 실적 개선으로 이어지는 국면입니다. HBM3E 양산 가동률 상승으로 3분기 영업이익이 전분기 대비 개선될 전망이고, 밸류에이션 부담도 3년 만의 저PER 구간으로 내려왔습니다.",
  reasons: [
    "3분기 영업이익 컨센서스가 전분기 대비 +18%로 상향 조정되었습니다.",
    "외국인 투자자 5일 누적 순매수 전환으로 수급 부담이 완화됐습니다.",
    "PER 12.1배로 3년 만의 저평가 구간 진입",
    "자사주 소각 계획 공시로 주당가치 개선 기대",
  ],
  price: 78400,
  change_rate: 1.84,
  change_value: 1420,
  sector: "반도체",
  macro: {
    exchange_rate_usdkrw: 1382.4,
    policy_rate: 2.5,
    inflation_yoy: 1.9,
    us_10y_yield: 4.21,
    fed_funds_rate: 4.5,
  },
  financial: {
    per: 12.1,
    pbr: 1.05,
    roe: 8.4,
    debt_ratio: 38.2,
    dividend_yield: 2.1,
  },
  dart: {
    risk_flags: ["자사주 소각 계획 공시", "영업이익 추정치 하회 공시(과거)"],
    highlights: ["3분기 실적 전망"],
  },
  news: {
    articles: [
      {
        title: "삼성전자, HBM3E 양산 가동률 90% 돌파…후면 전력 공급 확대",
        url: "https://finance.naver.com",
        source: "조선비즈",
      },
      {
        title: "외국인, 삼성전자 5일 만에 순매수 전환…기관 매도세는 둔화",
        url: "https://finance.naver.com",
        source: "연합뉴스",
      },
    ],
  },
  shareholders: [
    { name: "외국인 및 외환보유자", share: "17.83%" },
    { name: "국민연금", share: "8.42%" },
    { name: "삼성생명", share: "5.15%" },
  ],
  price_history: {
    high_52w: 96300,
    low_52w: 49500,
    position_52w: 61.3,
    pct_from_52w_high: -18.6,
    ma5: 76800,
    ma20: 75200,
    ma60: 71400,
    ret_5d: 3.2,
    ret_20d: 8.7,
    recent_closes: [74000, 75200, 74800, 76300, 77000, 78400],
    rsi: 68.4,
    macd: { macd: 1240.5, signal: 980.2, histogram: 260.3 },
    stochastic: { k: 82.1, d: 76.4 },
    bollinger: { upper: 82100, middle: 75200, lower: 68300, bandwidth: 18.3, position: 84 },
  },
};

export default function PreviewPage() {
  const [report, setReport] = React.useState("측정 중...");
  React.useEffect(() => {
    try {
      const vw = window.innerWidth;
      const bad: string[] = [];
      document.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1) {
          bad.push(
            `${el.tagName} .${String(el.className).slice(0, 60)} | w=${Math.round(r.width)} r=${Math.round(r.right)}`
          );
        }
      });
      setReport(
        `VW=${vw} DOC=${document.documentElement.scrollWidth} BODY=${document.body.scrollWidth} || ${bad
          .slice(0, 8)
          .join(" || ")}`
      );
    } catch (e) {
      setReport("measure error: " + String(e));
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-8 px-4 py-6 sm:px-6">
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-neutral-900 p-3 text-[11px] leading-4 text-emerald-300">
        {report}
      </pre>
      <StockScreenCard item={MOCK} />
      <ProfilePage />
    </div>
  );
}
