import type { BaseWindow } from 'electron';
import { describe, expectTypeOf, it } from 'vitest';

import type { TTabsSnapshot } from '@shared/ipc/tabs';

import type { createElectronTabView } from '../electronTabView';
import type { ITabHost, ITabRect, ITabView, TTabViewFactory } from '../tabType';

// 타입 계약 테스트 — tsc(type-check)와 vitest 의 expectTypeOf 가 함께 검사한다
describe('tabType 계약', () => {
  it('메인 창의 contentView 는 ITabHost 로 넘길 수 있다', () => {
    expectTypeOf<BaseWindow['contentView']>().toExtend<ITabHost>();
  });

  it('createElectronTabView 는 ITabView 를 돌려준다', () => {
    expectTypeOf<ReturnType<typeof createElectronTabView>>().toEqualTypeOf<ITabView>();
  });

  it('TTabViewFactory 는 인자 없이 ITabView 를 만든다', () => {
    expectTypeOf<TTabViewFactory>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<TTabViewFactory>().returns.toEqualTypeOf<ITabView>();
  });

  it('ITabView 상태는 스냅샷의 탭 상태와 같은 필드 타입을 쓴다', () => {
    type TSnapshotTab = TTabsSnapshot['tabList'][number];
    expectTypeOf<ReturnType<ITabView['getState']>>().toExtend<
      Pick<TSnapshotTab, 'url' | 'title' | 'faviconUrl' | 'isLoading' | 'canGoBack' | 'canGoForward'>
    >();
  });

  it('ITabRect 는 정수 좌표 4개를 갖는다', () => {
    expectTypeOf<keyof ITabRect>().toEqualTypeOf<'x' | 'y' | 'width' | 'height'>();
  });
});
