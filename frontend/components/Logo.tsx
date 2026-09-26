import { cn } from "@/lib/utils";

/** 양봉 모티프의 심볼 마크 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
    >
      <path
        d="M7.5 3.5v2.2M7.5 14.3v2.2M16.5 6.5v2.2M16.5 17.3v2.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="4.8" y="5.7" width="5.4" height="8.6" rx="1.6" fill="currentColor" />
      <rect
        x="13.8"
        y="8.7"
        width="5.4"
        height="8.6"
        rx="1.6"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

/** 그라디언트 배경의 로고 뱃지 (사이드바·로그인 공용) */
export function LogoBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-card",
        className
      )}
    >
      <LogoMark className="h-5 w-5" />
    </div>
  );
}
