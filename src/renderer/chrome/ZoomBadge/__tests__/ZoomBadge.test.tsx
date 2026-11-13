import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ZoomBadge } from '..';

describe('ZoomBadge', () => {
  it('100% 면 그리지 않는다', () => {
    render(<ZoomBadge zoomPercent={100} onReset={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('100% 가 아니면 배율을 보인다', () => {
    render(<ZoomBadge zoomPercent={125} onReset={vi.fn()} />);
    expect(screen.getByRole('button', { name: '확대/축소 125% — 눌러서 100%로' })).toHaveTextContent('125%');
  });

  it('누르면 onReset 을 부른다', () => {
    const onReset = vi.fn();
    render(<ZoomBadge zoomPercent={80} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: /확대\/축소 80%/ }));
    expect(onReset).toHaveBeenCalled();
  });
});
