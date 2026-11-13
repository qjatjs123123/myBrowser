import { type ReactNode, useEffect, useRef } from 'react';

import type { ITurn } from '@/hooks/useAgentRun';

import { AgentTurn } from './AgentTurn';
import { UserBubble } from './UserBubble';

const EMPTY_TEXT = '할 일을 입력하면 여기에 진행 상황이 표시됩니다';

interface IConversationProps {
  pastTurnList: ITurn[];
  /** 지금 run 의 턴 — run 이 없으면 null */
  currentTurn: ITurn | null;
  /** 대화 끝에 붙는 대기 카드(승인·질문) */
  footer?: ReactNode;
}

/**
 * 세션 대화 — 할 일 말풍선 → 에이전트 턴을 위에서 아래로 쌓는다 (spec 009 FR-1).
 * 지난 턴은 접혀서, 현재 턴은 펼쳐서 시작한다(key 에 현재 여부를 넣어 바뀌면 다시 마운트). 내용이 늘면 맨 아래로 스크롤.
 */
export function Conversation({ pastTurnList, currentTurn, footer }: IConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = toScrollKey(pastTurnList, currentTurn, Boolean(footer));

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [scrollKey]);

  if (pastTurnList.length === 0 && !currentTurn) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {EMPTY_TEXT}
      </div>
    );
  }
  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {pastTurnList.map((turn) => (
        <TurnPair key={`${turn.runId}:past`} turn={turn} isCurrent={false} />
      ))}
      {currentTurn && <TurnPair key={`${currentTurn.runId}:current`} turn={currentTurn} isCurrent />}
      {footer}
    </div>
  );
}

interface ITurnPairProps {
  turn: ITurn;
  isCurrent: boolean;
}

/** 말풍선 + 에이전트 턴 한 쌍 */
function TurnPair({ turn, isCurrent }: ITurnPairProps) {
  return (
    <div className="flex flex-col gap-3">
      <UserBubble task={turn.task} />
      <AgentTurn turn={turn} isDefaultOpen={isCurrent} />
    </div>
  );
}

/** 자동 스크롤 기준 — 턴 수·현재 턴의 단계 수·결과·대기 카드 유무가 바뀔 때만 */
function toScrollKey(pastTurnList: ITurn[], currentTurn: ITurn | null, hasFooter: boolean): string {
  const stepCount = currentTurn?.stepList.length ?? 0;
  const resultText = currentTurn?.result?.text ?? '';
  return [pastTurnList.length, currentTurn?.runId ?? '', stepCount, resultText, hasFooter].join('|');
}
