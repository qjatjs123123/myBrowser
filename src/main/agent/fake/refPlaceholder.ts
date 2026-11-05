/**
 * [가짜 모델] 시나리오 input 의 `"$ref(role:name)"` 을 마지막 snapshot 결과의 실제 ref 로 바꾼다.
 * 픽스처 페이지의 ref 번호를 시나리오 파일에 박지 않으려는 장치 — e2e·테스트 전용.
 */

const PLACEHOLDER_PATTERN = /^\$ref\(([^:()]+):([^()]*)\)$/;
const FALLBACK_REF = 'e0';

/** input 안의 모든 자리표시자(중첩 포함)를 치환한 새 값 — messageList 는 요청 본문의 messages */
export function resolveRefPlaceholders(input: unknown, messageList: unknown[]): unknown {
  const snapshotText = findLastSnapshotText(messageList);
  return replaceDeep(input, snapshotText);
}

function replaceDeep(value: unknown, snapshotText: string): unknown {
  if (typeof value === 'string') return replacePlaceholder(value, snapshotText);
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, snapshotText));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceDeep(item, snapshotText)]));
  }
  return value;
}

function replacePlaceholder(value: string, snapshotText: string): string {
  const matched = PLACEHOLDER_PATTERN.exec(value);
  if (!matched) return value;
  const [, role = '', name = ''] = matched;
  return findRef(snapshotText, role.trim(), name) ?? FALLBACK_REF;
}

/** `- {role} "{name}" … [ref=eN]` 줄의 eN */
function findRef(snapshotText: string, role: string, name: string): string | null {
  const pattern = new RegExp(`-\\s+${escapeRegExp(role)}\\s+"${escapeRegExp(name)}"[^\\n]*?\\[ref=(e\\d+)\\]`);
  return pattern.exec(snapshotText)?.[1] ?? null;
}

/** snapshot tool_use 에 대한 마지막 tool_result 의 텍스트 — 없으면 '' */
function findLastSnapshotText(messageList: unknown[]): string {
  const snapshotIdSet = new Set<string>();
  let lastText = '';
  for (const block of messageList.flatMap(getContentBlockList)) {
    if (block.type === 'tool_use' && block.name === 'snapshot' && typeof block.id === 'string') {
      snapshotIdSet.add(block.id);
    }
    if (block.type === 'tool_result' && snapshotIdSet.has(String(block.tool_use_id))) {
      lastText = getResultText(block.content);
    }
  }
  return lastText;
}

function getContentBlockList(message: unknown): Record<string, unknown>[] {
  if (!isRecord(message) || !Array.isArray(message.content)) return [];
  return message.content.filter(isRecord);
}

function getResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isRecord)
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
