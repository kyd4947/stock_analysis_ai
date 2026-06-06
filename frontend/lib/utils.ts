import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Why:
 * - Shadcn UI 계열은 `cn()` 유틸로 className 합성을 표준화합니다.
 * - tailwind-merge로 충돌 클래스(예: bg-* 같은 것)를 정리합니다.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

