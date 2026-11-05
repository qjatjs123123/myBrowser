import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * [cn] 조건부 클래스를 합치고 충돌하는 Tailwind 클래스는 뒤쪽을 남긴다 — shadcn 부품과 화면 컴포넌트가 함께 쓴다.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
