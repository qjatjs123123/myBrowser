import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentToggleButton } from '..';

describe('AgentToggleButton (spec 011)', () => {
  it('이름은 “에이전트” 이고 aria-pressed 가 패널 보임 여부다', () => {
    render(<AgentToggleButton isPressed needsAttention={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '에이전트' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('누르면 onToggle 을 부른다', () => {
    const onToggle = vi.fn();
    render(<AgentToggleButton isPressed={false} needsAttention={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: '에이전트' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('확인이 필요하면 “확인 필요” 설명을 단다', () => {
    render(<AgentToggleButton isPressed={false} needsAttention onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '에이전트' })).toHaveAccessibleDescription('확인 필요');
  });

  it('확인이 필요 없으면 설명이 없다', () => {
    render(<AgentToggleButton isPressed needsAttention={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '에이전트' })).not.toHaveAttribute('aria-description');
  });
});
