import type { BrowserWindow, Rectangle } from 'electron';

import type { TWindowState } from '@shared/ipc/window';

/** 최대화 bounds 를 다시 읽는 간격 — maximize 이벤트가 bounds 반영보다 먼저 온다 (WSLg 실측) */
export const MAXIMIZE_POLL_MS = 20;
/** 이 시간 안에 bounds 가 바뀌지 않으면 디스플레이 workArea 를 쓴다 (창 관리자가 없는 xvfb 등) */
export const MAXIMIZE_MEASURE_LIMIT_MS = 500;
/**
 * 창 관리자는 unmaximize 뒤 늦게(WSLg 실측 ~80ms) 창을 예전 위치로 되돌린다 — 이 시간 뒤 다르면 1회 다시 적용한다.
 * 매번 되돌리면 setBounds 가 다시 move 를 낳아 창 관리자와 핑퐁한다 — 한 번만.
 */
export const RESTORE_SETTLE_MS = 200;

/** 최대화기가 쓰는 창 메서드 — 부를 때마다 창에서 찾는다(e2e 가 인스턴스에 대역을 심는다) */
export type TMaximizeWindow = Pick<
  BrowserWindow,
  'on' | 'getBounds' | 'setBounds' | 'getNormalBounds' | 'maximize' | 'unmaximize'
>;

/** 앱이 관리하는 최대화 상태 (spec 017) */
export interface IBoundsMaximizer {
  isMaximized: () => boolean;
  /** 최대화 중이면 최대화 직전 bounds, 아니면 지금 bounds */
  getNormalBounds: () => Rectangle;
  /** 최대화 ↔ 직전 bounds */
  toggle: () => void;
  /** 위치는 그대로 두고 최대화 상태만 푼다 — 최대화 중 끌기 복원용 (부르는 쪽이 setBounds 한다) */
  release: () => void;
}

interface IBoundsMaximizerOptions {
  onChange: (state: TWindowState) => void;
  /** bounds 가 걸친 디스플레이의 작업 영역 — 측정 실패 시 대체값 */
  getWorkArea: (bounds: Rectangle) => Rectangle;
  /** 테스트가 타이머를 주입한다 */
  schedule?: (callback: () => void, delayMs: number) => void;
}

/**
 * [Linux 최대화] 창 관리자 최대화 상태로 두지 않고, 창 관리자가 정한 최대화 bounds(=모니터 작업 영역)로 setBounds 한 일반 창으로 바꾼다 (spec 017).
 * WSLg 는 최대화된 프레임 없는 X 창의 내용을 ~32px 밀어 그려 화면과 입력 좌표가 어긋난다 — 일반 창 setBounds 는 (0,0) 에 맞게 그린다.
 * 어떤 최대화든(더블클릭·버튼·OS 단축키) maximize 이벤트에서 바꾸고, 최대화 여부는 이 모듈이 들고 onChange 로 알린다.
 */
export function createBoundsMaximizer(
  window: TMaximizeWindow,
  {
    onChange,
    getWorkArea,
    schedule = (callback, delayMs) => void setTimeout(callback, delayMs),
  }: IBoundsMaximizerOptions,
): IBoundsMaximizer {
  /** 최대화 중이면 직전 bounds, 아니면 null */
  let normalBounds: Rectangle | null = null;
  /** toggle 이 maximize() 직전에 기억한 bounds — 변환 시작에 꺼내고 비운다 */
  let requestedNormal: Rectangle | null = null;
  let isConverting = false;

  /** 작업 영역 bounds 의 일반 창으로 바꾸고, 늦은 복원 확인이 끝나면 최대화 상태를 알린다 */
  const finishConversion = (normal: Rectangle, area: Rectangle): void => {
    window.unmaximize();
    window.setBounds(area);
    schedule(() => {
      if (!isSameBounds(window.getBounds(), area)) window.setBounds(area);
      normalBounds = normal;
      isConverting = false;
      onChange({ isMaximized: true });
    }, RESTORE_SETTLE_MS);
  };

  /** 창 관리자가 정한 최대화 bounds 를 기다린다 — 최대화 전 bounds(normal)와 달라지면 그것이 작업 영역이다 */
  const measure = (normal: Rectangle, elapsedMs: number): void => {
    const bounds = window.getBounds();
    if (!isSameBounds(bounds, normal)) return finishConversion(normal, bounds);
    if (elapsedMs >= MAXIMIZE_MEASURE_LIMIT_MS) return finishConversion(normal, getWorkArea(normal));
    schedule(() => measure(normal, elapsedMs + MAXIMIZE_POLL_MS), MAXIMIZE_POLL_MS);
  };

  window.on('maximize', () => {
    if (isConverting) return;
    isConverting = true;
    // 이미 앱 최대화 상태(OS 단축키 등 — 창 관리자는 일반 창으로 안다)면 직전 bounds 는 그대로, 지금 bounds 가 작업 영역이다
    if (normalBounds) return finishConversion(normalBounds, window.getBounds());
    const normal = requestedNormal ?? window.getNormalBounds();
    requestedNormal = null;
    measure(normal, 0);
  });

  return {
    isMaximized: () => normalBounds !== null,
    getNormalBounds: () => normalBounds ?? window.getBounds(),
    toggle: () => {
      if (isConverting) return;
      if (normalBounds) {
        window.setBounds(normalBounds);
        normalBounds = null;
        onChange({ isMaximized: false });
        return;
      }
      requestedNormal = window.getBounds();
      window.maximize();
    },
    release: () => {
      if (!normalBounds) return;
      normalBounds = null;
      onChange({ isMaximized: false });
    },
  };
}

function isSameBounds(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
