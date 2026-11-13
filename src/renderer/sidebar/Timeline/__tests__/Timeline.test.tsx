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

  it('승인 대기 step 은 “확인 대기”, 거부된 step 은 “거부됨” 아이콘을 붙인다', () => {
    render(
      <Timeline
        stepList={[
          { n: 1, tool: 'click', summary: '‘예약 확정’ 클릭', status: 'waiting' },
          { n: 2, tool: 'click', summary: '‘결제’ 클릭', status: 'denied' },
        ]}
      />,
    );
    const nameList = screen.getAllByRole('img').map((icon) => icon.getAttribute('aria-label'));
    expect(nameList).toEqual(['확인 대기', '거부됨']);
  });
});
