/**
 * 기록 목록의 시작 시각 문구 `M월 D일 HH:mm` — 로컬 시간대 기준 (spec 012 FR-2).
 * 읽을 수 없는 값이면 빈 문자열 (목록 한 줄이 깨지지 않게).
 */
export function toRunTimeText(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${hour}:${minute}`;
}
