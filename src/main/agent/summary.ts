/**
 * [step 요약] 타임라인 한 줄의 사람 말 — main 이 만들고 renderer 는 도구 JSON 을 해석하지 않는다.
 * type_text 는 입력값을 넣지 않는다 (비밀 노출 방지, SR-2·SR-6).
 */
import { normalizeText } from '@shared/guard/rules';
import type { IGuardTarget } from '@shared/tools';

const LABEL_MAX = 40;

/** 고정 문구 도구 */
const FIXED_SUMMARY: Partial<Record<string, string>> = {
  snapshot: '페이지 읽기',
  read_text: '글 읽기',
  go_back: '뒤로 가기',
  scroll: '스크롤',
  wait_for: '기다리기',
  list_tabs: '탭 목록 보기',
  switch_tab: '탭 전환',
  open_tab: '새 탭 열기',
  // 픽셀 computer toolset 멤버 — type 의 글자는 넣지 않는다 (SR-5)
  'computer.screenshot': '화면 보기',
  'computer.left_click': '좌표 클릭',
  'computer.double_click': '좌표 더블클릭',
  'computer.type': '글자 입력',
  'computer.scroll': '화면 스크롤',
  'computer.mouse_move': '커서 이동',
  'computer.wait': '기다리기',
};

/** 도구 호출 한 번의 요약 — tool 은 step 도구 이름(구조 도구·사람 개입 도구·`computer.{member}`), target 은 가드용으로 해석한 대상 */
export function summarizeStep(tool: string, input: unknown, target?: IGuardTarget | null): string {
  const fixed = FIXED_SUMMARY[tool];
  if (fixed) return fixed;
  switch (tool) {
    case 'navigate':
      return `${getHost(readField(input, 'url'))} 열기`;
    case 'click':
      return withLabel(target?.name || target?.text, '클릭');
    case 'type_text':
      return withLabel(target?.name || target?.label || target?.fieldName, '입력', '에');
    case 'select_option':
      return withLabel(target?.name || target?.label, '선택');
    case 'press_key':
      return `${readField(input, 'key') || '키'} 키`;
    case 'computer.key':
      return `키 ${normalizeText(readField(input, 'text')).slice(0, LABEL_MAX)}`.trim();
    case 'ask_user':
      return `질문: ${normalizeText(readField(input, 'question')).slice(0, LABEL_MAX)}`;
    case 'request_approval':
      return `확인 요청: ${normalizeText(readField(input, 'action')).slice(0, LABEL_MAX)}`;
    default:
      return tool;
  }
}

/** ‘라벨’ 동사 — 라벨이 없으면 동사만 */
function withLabel(raw: string | undefined, verb: string, particle = ''): string {
  const label = normalizeText(raw ?? '').slice(0, LABEL_MAX);
  return label ? `‘${label}’${particle} ${verb}` : verb;
}

function getHost(url: string): string {
  try {
    return new URL(url).host || '페이지';
  } catch {
    return '페이지';
  }
}

function readField(input: unknown, key: string): string {
  if (typeof input !== 'object' || input === null) return '';
  const value: unknown = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}
