import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { toast } from '@/lib/toast';

import { AddressBar } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const OK = { ok: true, data: null } as const;
const NAVER_OPTION = "'강남 맛집' — 네이버에서 검색";
const GOOGLE_OPTION = "'강남 맛집' — 구글에서 검색";

function renderAddressBar(overrides: Partial<Parameters<typeof AddressBar>[0]> = {}) {
  const props = {
    url: 'https://a.com/page',
    isLoading: false,
    isNewTab: false,
    focusSignal: 0,
    onNavigate: vi.fn().mockResolvedValue(OK),
    ...overrides,
  };
  const view = render(<AddressBar {...props} />);
  return { props, view, input: screen.getByRole('combobox', { name: '주소창' }) as HTMLInputElement };
}

function typeText(input: HTMLInputElement, text: string): void {
  fireEvent.change(input, { target: { value: text } });
}

describe('AddressBar', () => {
  it('활성 탭 URL 을 보여준다', () => {
    const { input } = renderAddressBar();
    expect(input).toHaveValue('https://a.com/page');
  });

  it('새 탭이면 비어 있고 placeholder 를 보여준다', () => {
    const { input } = renderAddressBar({ url: '', isNewTab: true });
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '검색어 또는 주소 입력');
  });

  it('편집 중이 아닐 때 탭 URL 이 바뀌면 따라간다', () => {
    const { props, view, input } = renderAddressBar();
    view.rerender(<AddressBar {...props} url="https://b.com/" />);
    expect(input).toHaveValue('https://b.com/');
  });

  it('naver.com 을 입력하고 Enter 하면 https://naver.com/ 으로 이동한다', () => {
    const { props, input } = renderAddressBar();
    typeText(input, 'naver.com');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).toHaveBeenCalledWith('https://naver.com/');
  });

  it('URL 형태면 검색 선택 목록을 열지 않는다', () => {
    const { input } = renderAddressBar();
    typeText(input, 'naver.com');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('검색어를 입력하면 네이버·구글 두 옵션을 보여주고 첫 줄이 강조된다', () => {
    const { input } = renderAddressBar();
    typeText(input, '강남 맛집');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: NAVER_OPTION })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: GOOGLE_OPTION })).toHaveAttribute('aria-selected', 'false');
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('검색어에서 Enter 하면 네이버 검색 URL 로 이동한다', () => {
    const { props, input } = renderAddressBar();
    typeText(input, '강남 맛집');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).toHaveBeenCalledWith(
      'https://search.naver.com/search.naver?query=%EA%B0%95%EB%82%A8%20%EB%A7%9B%EC%A7%91',
    );
  });

  it('↓ 후 Enter 하면 구글 검색 URL 로 이동한다', () => {
    const { props, input } = renderAddressBar();
    typeText(input, '강남 맛집');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: GOOGLE_OPTION })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).toHaveBeenCalledWith(
      'https://www.google.com/search?q=%EA%B0%95%EB%82%A8%20%EB%A7%9B%EC%A7%91',
    );
  });

  it('↑ 는 강조를 거꾸로 순환한다', () => {
    const { input } = renderAddressBar();
    typeText(input, '강남 맛집');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: GOOGLE_OPTION })).toHaveAttribute('aria-selected', 'true');
  });

  it('옵션을 클릭하면 그 엔진으로 검색한다', () => {
    const { props, input } = renderAddressBar();
    typeText(input, '강남 맛집');
    fireEvent.click(screen.getByRole('option', { name: GOOGLE_OPTION }));
    expect(props.onNavigate).toHaveBeenCalledWith(
      'https://www.google.com/search?q=%EA%B0%95%EB%82%A8%20%EB%A7%9B%EC%A7%91',
    );
  });

  it('Esc 를 누르면 목록을 닫고 탭 URL 로 되돌린다', () => {
    const { props, input } = renderAddressBar();
    typeText(input, '강남 맛집');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('https://a.com/page');
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('javascript: 입력은 URL 이 아니라 검색 옵션으로 보여준다', () => {
    const { props, input } = renderAddressBar();
    typeText(input, 'javascript:alert(1)');
    expect(screen.getByRole('option', { name: "'javascript:alert(1)' — 네이버에서 검색" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).toHaveBeenCalledWith(
      `https://search.naver.com/search.naver?query=${encodeURIComponent('javascript:alert(1)')}`,
    );
  });

  it('빈 입력에서 Enter 하면 아무 데도 가지 않는다', () => {
    const { props, input } = renderAddressBar();
    typeText(input, '   ');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('포커스하면 전체를 선택한다', () => {
    const { input } = renderAddressBar();
    fireEvent.focus(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('https://a.com/page'.length);
  });

  it('focusSignal 이 바뀌면 주소창에 포커스하고 전체 선택한다', () => {
    const { props, view, input } = renderAddressBar();
    expect(input).not.toHaveFocus();
    view.rerender(<AddressBar {...props} focusSignal={1} />);
    expect(input).toHaveFocus();
    expect(input.selectionEnd).toBe('https://a.com/page'.length);
  });

  it('이동이 ok:false 면 main 의 메시지로 toast 를 띄운다', async () => {
    const { input } = renderAddressBar({
      onNavigate: vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다' } }),
    });
    typeText(input, 'naver.com');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('요청 형식이 올바르지 않습니다'));
  });
});
