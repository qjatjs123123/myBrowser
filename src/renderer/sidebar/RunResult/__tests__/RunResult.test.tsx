import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { IRunResult } from '@/hooks/useAgentRun';

import { RunResult } from '..';

/** 결과를 그리고 결과 영역을 돌려준다 */
function renderResult(result: IRunResult): HTMLElement {
  render(<RunResult result={result} />);
  return screen.getByRole('region', { name: '실행 결과' });
}

describe('RunResult', () => {
  it('완료면 모델의 요약을 보여준다', () => {
    expect(renderResult({ kind: 'done', text: '전화 02-123-4567' })).toHaveTextContent('전화 02-123-4567');
  });

  it('실패면 이유를 보여준다', () => {
    expect(renderResult({ kind: 'failed', text: '도구 호출 한도(60회)를 넘었습니다' })).toHaveTextContent(
      '도구 호출 한도(60회)를 넘었습니다',
    );
  });

  it('중지면 “중지했습니다”를 보여준다', () => {
    expect(renderResult({ kind: 'stopped', text: '중지했습니다' })).toHaveTextContent('중지했습니다');
  });
});
