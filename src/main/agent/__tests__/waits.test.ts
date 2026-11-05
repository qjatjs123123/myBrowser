import { describe, expect, it } from 'vitest';

import { createWaitRegistry } from '../waits';

describe('createWaitRegistry', () => {
  it('requestId 는 run 안에서 req-1, req-2 … 로 늘어난다', () => {
    const registry = createWaitRegistry();
    expect([registry.createRequestId(), registry.createRequestId()]).toEqual(['req-1', 'req-2']);
  });

  it('open 한 대기는 resolve 한 답으로 풀린다', async () => {
    const registry = createWaitRegistry();
    const promise = registry.open({ requestId: 'req-1', kind: 'guard' });
    expect(registry.resolve('req-1', { type: 'decision', decision: 'denied' })).toBe(true);
    await expect(promise).resolves.toEqual({ type: 'decision', decision: 'denied' });
  });

  it('열린 대기는 getPending 으로 종류를 알 수 있고 풀린 뒤에는 null 이다', () => {
    const registry = createWaitRegistry();
    void registry.open({ requestId: 'req-1', kind: 'question' });
    expect(registry.getPending('req-1')).toEqual({ requestId: 'req-1', kind: 'question' });
    registry.resolve('req-1', { type: 'answer', answer: '2명' });
    expect(registry.getPending('req-1')).toBeNull();
  });

  it('같은 id 를 두 번 resolve 하면 두 번째는 false 다', () => {
    const registry = createWaitRegistry();
    void registry.open({ requestId: 'req-1', kind: 'guard' });
    registry.resolve('req-1', { type: 'decision', decision: 'agent' });
    expect(registry.resolve('req-1', { type: 'decision', decision: 'agent' })).toBe(false);
  });

  it('없는 id 를 resolve 하면 false 다', () => {
    expect(createWaitRegistry().resolve('req-9', { type: 'answer', answer: 'x' })).toBe(false);
  });

  it('같은 id 로 두 번 open 하면 throw 한다', () => {
    const registry = createWaitRegistry();
    void registry.open({ requestId: 'req-1', kind: 'guard' });
    expect(() => registry.open({ requestId: 'req-1', kind: 'guard' })).toThrow();
  });

  it('cancelAll 은 열린 대기를 전부 cancelled 로 풀고 그 목록을 돌려준다', async () => {
    const registry = createWaitRegistry();
    const first = registry.open({ requestId: 'req-1', kind: 'guard' });
    const second = registry.open({ requestId: 'req-2', kind: 'question' });
    expect(registry.cancelAll('stopped')).toEqual([
      { requestId: 'req-1', kind: 'guard' },
      { requestId: 'req-2', kind: 'question' },
    ]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { type: 'cancelled', reason: 'stopped' },
      { type: 'cancelled', reason: 'stopped' },
    ]);
  });

  it('cancelAll 뒤에는 resolve 가 false 다', () => {
    const registry = createWaitRegistry();
    void registry.open({ requestId: 'req-1', kind: 'guard' });
    registry.cancelAll('shutdown');
    expect(registry.resolve('req-1', { type: 'decision', decision: 'agent' })).toBe(false);
  });
});
