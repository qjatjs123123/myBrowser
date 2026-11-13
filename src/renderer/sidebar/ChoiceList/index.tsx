import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 선택 목록 한 줄 — label 이 버튼의 접근 이름, value 는 고르면 넘길 값 */
export interface IChoice<TValue extends string> {
  value: TValue;
  label: string;
}

interface IChoiceListProps<TValue extends string> {
  /** 목록의 접근 이름 (예: "승인 선택") */
  label: string;
  choiceList: IChoice<TValue>[];
  /** 처음 강조·포커스할 줄 — 승인 창은 [거부] */
  defaultIndex?: number;
  /** 마운트 시 강조 줄에 포커스를 줄지 — 기본 true */
  isAutoFocus?: boolean;
  isDisabled: boolean;
  onChoose: (value: TValue) => void;
}

const MAX_SHORTCUT_COUNT = 9;

/**
 * Claude Code 식 번호 선택 목록 (spec 009 FR-8) — ↑↓ 로 강조 이동(순환), 숫자키로 바로 선택, Enter·Space·클릭으로 강조 줄 선택.
 * 강조 줄에 실제 포커스가 있다(roving tabindex). Enter·Space 는 keydown 에서 preventDefault 해 네이티브 click 과 중복 선택하지 않는다.
 */
export function ChoiceList<TValue extends string>({
  label,
  choiceList,
  defaultIndex = 0,
  isAutoFocus = true,
  isDisabled,
  onChoose,
}: IChoiceListProps<TValue>) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const buttonRefList = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isAutoFocus) buttonRefList.current[defaultIndex]?.focus();
  }, [isAutoFocus, defaultIndex]);

  const choose = (index: number) => {
    const choice = choiceList[index];
    if (choice && !isDisabled) onChoose(choice.value);
  };

  const moveTo = (index: number) => {
    const nextIndex = (index + choiceList.length) % choiceList.length;
    setActiveIndex(nextIndex);
    buttonRefList.current[nextIndex]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = toKeyAction(event.key, choiceList.length);
    if (!action) return;
    event.preventDefault();
    if (action.type === 'move') moveTo(activeIndex + action.delta);
    else choose(action.type === 'pick' ? action.index : activeIndex);
  };

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-0.5" onKeyDown={handleKeyDown}>
      {choiceList.map((choice, index) => (
        <ChoiceRow
          key={choice.value}
          ref={(element) => {
            buttonRefList.current[index] = element;
          }}
          number={index + 1}
          label={choice.label}
          isActive={index === activeIndex}
          isDisabled={isDisabled}
          onFocus={() => setActiveIndex(index)}
          onClick={() => choose(index)}
        />
      ))}
    </div>
  );
}

interface IChoiceRowProps {
  ref: (element: HTMLButtonElement | null) => void;
  number: number;
  label: string;
  isActive: boolean;
  isDisabled: boolean;
  onFocus: () => void;
  onClick: () => void;
}

/** 한 줄 — `› 1. 라벨`. 번호·› 는 aria-hidden 이라 접근 이름은 라벨만 */
function ChoiceRow({ ref, number, label, isActive, isDisabled, onFocus, onClick }: IChoiceRowProps) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      tabIndex={isActive ? 0 : -1}
      disabled={isDisabled}
      onFocus={onFocus}
      onClick={onClick}
      className={cn(
        'h-auto min-h-8 w-full justify-start gap-2 rounded-lg px-2 py-1.5 text-left font-normal whitespace-normal focus-visible:ring-1 focus-visible:ring-ring/60',
        isActive && 'bg-accent text-accent-foreground',
      )}
    >
      <span aria-hidden className={cn('w-2 shrink-0 text-brand', !isActive && 'invisible')}>
        ›
      </span>
      <span aria-hidden className="w-4 shrink-0 text-muted-foreground tabular-nums">
        {number}.
      </span>
      <span className="min-w-0 break-words">{label}</span>
    </Button>
  );
}

type TKeyAction = { type: 'move'; delta: 1 | -1 } | { type: 'pick'; index: number } | { type: 'chooseActive' };

/** 키 → 목록 동작 (해당 없으면 null) */
function toKeyAction(key: string, count: number): TKeyAction | null {
  if (key === 'ArrowDown') return { type: 'move', delta: 1 };
  if (key === 'ArrowUp') return { type: 'move', delta: -1 };
  if (key === 'Enter' || key === ' ') return { type: 'chooseActive' };
  const digit = Number(key);
  const isShortcut = /^[1-9]$/.test(key) && digit <= Math.min(count, MAX_SHORTCUT_COUNT);
  return isShortcut ? { type: 'pick', index: digit - 1 } : null;
}
