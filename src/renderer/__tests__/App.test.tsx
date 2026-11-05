import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import App from '../App';

describe('App', () => {
  it('브라우징 영역 "새 탭" 과 사이드바 "에이전트" 제목을 보여준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
    render(<App />);
    expect(screen.getByRole('heading', { name: '새 탭' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '에이전트' })).toBeInTheDocument();
    expect(await screen.findByText('myBrowser v0.1.0 · 테스트')).toBeInTheDocument();
  });
});
