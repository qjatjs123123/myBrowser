import type { BrowserWindow, Rectangle } from 'electron';

import type { TWindowState } from '@shared/ipc/window';

/** 최대화 bounds 를 다시 읽는 간격 — maximize 이벤트가 bounds 반영보다 먼저 온다 (WSLg 실측) */
export const MAXIMIZE_POLL_MS = 20;
/** 이 시간 안에 bounds 가 바뀌지 않으면 디스플레이 workArea 를 쓴다 (창 관리자가 없는 xvfb 등) */
export const MAXIMIZE_MEASURE_LIMIT_MS = 500;
/**
 * 창 관리자는 unmaximize 뒤 늦게 창을 예전 위치로 되돌린다 — 시점이 일정하지 않다 (WSLg 실측 unmaximize 이벤트 뒤 ~80ms·~340ms).
 * 배치 후 이 시간 동안 move·resize 로 작업 영역에서 벗어나면 다시 적용한다 (spec 018).
 */
export const RESTORE_GUARD_MS = 1000;
/** 지키는 동안 다시 적용하는 최대 횟수 — 창 관리자와 끝없이 핑퐁하지 않게 */
export const RESTORE_REAPPLY_LIMIT = 3;

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
  /** 모니터별로 기억한 최대화 bounds 를 비운다 — 디스플레이 구성이 바뀌면 (spec 018) */
  forgetAreas: () => void;
}

interface IBoundsMaximizerOptions {
  onChange: (state: TWindowState) => void;
  /** bounds 가 걸친 디스플레이의 작업 영역 — 측정 실패 시 대체값 */
  getWorkArea: (bounds: Rectangle) => Rectangle;
  /** bounds 가 걸친 디스플레이 id — 최대화 bounds 를 모니터별로 기억한다 (spec 018) */
  getDisplayId: (bounds: Rectangle) => number;
  /** 테스트가 타이머를 주입한다 */
  schedule?: (callback: () => void, delayMs: number) => void;
}

/**
 * [Linux 최대화] 창 관리자 최대화 상태로 두지 않고, 창 관리자가 정한 최대화 bounds(=모니터 작업 영역)로 setBounds 한 일반 창으로 바꾼다 (spec 017).
 * WSLg 는 최대화된 프레임 없는 X 창의 내용을 ~32px 밀어 그려 화면과 입력 좌표가 어긋난다 — 일반 창 setBounds 는 (0,0) 에 맞게 그린다.
 * 어떤 최대화든(더블클릭·버튼·OS 단축키) maximize 이벤트에서 바꾸고, 최대화 여부는 이 모듈이 들고 onChange 로 알린다.
 * 측정한 bounds 는 모니터별로 기억해 두 번째부터는 창 관리자 최대화 없이 바로 배치한다 — 깜빡임 줄이기 (spec 018).
 */
export function createBoundsMaximizer(
  window: TMaximizeWindow,
  {
    onChange,
    getWorkArea,
    getDisplayId,
    schedule = (callback, delayMs) => void setTimeout(callback, delayMs),
  }: IBoundsMaximizerOptions,
): IBoundsMaximizer {
  /** 최대화 중이면 직전 bounds, 아니면 null */
  let normalBounds: Rectangle | null = null;
  /** toggle 이 maximize() 직전에 기억한 bounds — 변환 시작에 꺼내고 비운다 */
  let requestedNormal: Rectangle | null = null;
  let isConverting = false;
  /** 디스플레이 id → 측정한 최대화 bounds (실행 동안만) */
  const areaMap = new Map<number, Rectangle>();
  /** 창 관리자의 늦은 복원에서 지키는 작업 영역 — 지키는 시간이 끝나거나 최대화가 풀리면 null */
  let guard: { area: Rectangle; reapplyCount: number } | null = null;

  /** 배치한 작업 영역을 RESTORE_GUARD_MS 동안 지킨다 */
  const startGuard = (area: Rectangle): void => {
    const current = { area, reapplyCount: 0 };
    guard = current;
    schedule(() => {
      if (guard === current) guard = null;
    }, RESTORE_GUARD_MS);
  };

  /** 지키는 동안 창이 작업 영역에서 벗어나면(창 관리자의 늦은 복원) 다시 적용한다 */
  const keepArea = (): void => {
    if (!guard || isSameBounds(window.getBounds(), guard.area)) return;
    if (guard.reapplyCount >= RESTORE_REAPPLY_LIMIT) return;
    guard.reapplyCount += 1;
    window.setBounds(guard.area);
  };
  window.on('move', keepArea);
  window.on('resize', keepArea);

  /** 작업 영역 bounds 의 일반 창으로 바꾸고 최대화 상태를 알린다 — 늦은 복원은 keepArea 가 덮는다 */
  const finishConversion = (normal: Rectangle, area: Rectangle): void => {
    window.unmaximize();
    window.setBounds(area);
    normalBounds = normal;
    isConverting = false;
    onChange({ isMaximized: true });
    startGuard(area);
  };

  /** 최대화를 푼다 — 지키던 작업 영역도 놓는다 */
  const leaveMaximized = (): void => {
    normalBounds = null;
    guard = null;
    onChange({ isMaximized: false });
  };

  /** 창 관리자가 정한 최대화 bounds 를 기다린다 — 최대화 전 bounds(normal)와 달라지면 그것이 작업 영역이다 */
  const measure = (normal: Rectangle, elapsedMs: number): void => {
    const bounds = window.getBounds();
    if (!isSameBounds(bounds, normal)) {
      areaMap.set(getDisplayId(normal), bounds);
      return finishConversion(normal, bounds);
    }
    if (elapsedMs >= MAXIMIZE_MEASURE_LIMIT_MS) return finishConversion(normal, getWorkArea(normal));
    schedule(() => measure(normal, elapsedMs + MAXIMIZE_POLL_MS), MAXIMIZE_POLL_MS);
  };

  /** 기억한 최대화 bounds 로 바로 배치한다 — 창 관리자 최대화를 거치지 않으니 늦은 복원도 없다 */
  const applyKnownArea = (normal: Rectangle, area: Rectangle): void => {
    window.setBounds(area);
    normalBounds = normal;
    onChange({ isMaximized: true });
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
        return leaveMaximized();
      }
      const current = window.getBounds();
      const knownArea = areaMap.get(getDisplayId(current));
      if (knownArea) return applyKnownArea(current, knownArea);
      requestedNormal = current;
      window.maximize();
    },
    release: () => {
      if (normalBounds) leaveMaximized();
    },
    forgetAreas: () => areaMap.clear(),
  };
}

function isSameBounds(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
