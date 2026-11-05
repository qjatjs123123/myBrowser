import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Timeline } from '..';

describe('Timeline', () => {
  it('step 마다 요약이 있는 항목을 n 순서대로 보여준다', () => {
    render(
      <Timeline
        stepList={[
          { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'ok' },
          { n: 2, tool: 'click', summary: '‘두 번째 페이지’ 클릭', status: 'running' },
        ]}
      />,
    );
    const itemList = within(screen.getByRole('list', { name: '진행 단계' })).getAllByRole('listitem');
    expect(itemList.map((item) => item.textContent)).toEqual(['페이지 읽기', '‘두 번째 페이지’ 클릭']);
  });

  it('상태마다 아이콘 접근 이름을 진행 중·완료·오류·차단됨으로 붙인다', () => {
    render(
      <Timeline
        stepList={[
          { n: 1, tool: 'snapshot', summary: 'a', status: 'running' },
          { n: 2, tool: 'click', summary: 'b', status: 'ok' },
          { n: 3, tool: 'click', summary: 'c', status: 'error' },
          { n: 4, tool: 'type_text', summary: 'd', status: 'blocked' },
        ]}
      />,
    );
    const nameList = screen.getAllByRole('img').map((icon) => icon.getAttribute('aria-label'));
    expect(nameList).toEqual(['진행 중', '완료', '오류', '차단됨']);
  });
});
