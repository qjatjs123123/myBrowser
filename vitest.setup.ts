// renderer 단위 테스트 — jest-dom matcher + window.api mock (각 테스트에서 mockResolvedValue 로 응답을 준다)
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

Object.defineProperty(window, 'api', {
  configurable: true,
  value: { app: { getInfo: vi.fn() } },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
