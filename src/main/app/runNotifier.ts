import type { TAgentEvent } from '@shared/ipc/agent';

/** 알림 본문 최대 글자 수 — 넘으면 자르고 … (spec 021 FR-13) */
export const NOTIFICATION_BODY_MAX = 120;

const ELLIPSIS = '…';

/** OS 알림 한 건 */
export interface IRunNotification {
  title: string;
  body: string;
}

export interface IRunNotifierDeps {
  /** 알림마다 호출 시점에 읽는다 — 캐시하지 않는다 */
  isWindowFocused: () => boolean;
  show: (notification: IRunNotification & { onClick: () => void }) => void;
  /** 알림을 누르면 — 창 복원·표시·포커스 (FR-14). 승인·거부는 하지 않는다 (SR-1) */
  focusWindow: () => void;
}

/**
 * [실행 알림 문구] agent 이벤트 → 알림 제목·본문. 알릴 이벤트가 아니면 null.
 * 이벤트에 이미 있는 display·질문·요약·이유만 쓴다 — 사용자가 입력한 값은 싣지 않는다 (SR-2).
 */
export function toRunNotification(event: TAgentEvent): IRunNotification | null {
  switch (event.type) {
    case 'approval_required':
      return toNotification('승인이 필요합니다', toApprovalBody(event.request.display));
    case 'question':
      return toNotification('에이전트 질문', event.question.text);
    case 'done':
      return toNotification('작업을 마쳤습니다', event.summary);
    case 'failed':
      return toNotification('작업이 실패했습니다', event.reason);
    default:
      return null;
  }
}

/** [실행 알림] 창에 포커스가 없을 때만 알린다 (FR-13·14) */
export function createRunNotifier({ isWindowFocused, show, focusWindow }: IRunNotifierDeps) {
  return {
    handleEvent: (event: TAgentEvent) => {
      const notification = toRunNotification(event);
      if (!notification || isWindowFocused()) return;
      show({ ...notification, onClick: focusWindow });
    },
  };
}

/** kind=model 은 target 이 빈 문자열이라 action 만 쓴다 */
function toApprovalBody({ action, target }: { action: string; target: string }): string {
  return target === '' ? action : `${action} — ${target}`;
}

function toNotification(title: string, body: string): IRunNotification {
  return { title, body: truncate(body) };
}

function truncate(text: string): string {
  if (text.length <= NOTIFICATION_BODY_MAX) return text;
  return `${text.slice(0, NOTIFICATION_BODY_MAX - ELLIPSIS.length)}${ELLIPSIS}`;
}
