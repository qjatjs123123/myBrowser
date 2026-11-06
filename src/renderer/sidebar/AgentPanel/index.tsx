import { type ReactNode, useState } from 'react';

import { isRunActive, type TAgentRun, type TDecision } from '@/hooks/useAgentRun';
import { toast } from '@/lib/toast';
import { ApprovalPanel } from '@/sidebar/ApprovalPanel';
import { Conversation } from '@/sidebar/Conversation';
import { QuestionCard } from '@/sidebar/QuestionCard';
import { SidebarHeader } from '@/sidebar/SidebarHeader';

import { TaskInput } from './TaskInput';

interface IAgentPanelProps {
  /** App 이 한 번 구독한 run 상태·동작 (spec 011 — 툴바 버튼과 같은 상태를 본다) */
  run: TAgentRun;
  /** 헤더 바로 아래 자리 — 계정 카드 (App 이 넣는다) */
  accountSlot?: ReactNode;
  /** [사이드바 닫기] */
  onClose?: () => void;
  /** 승인 결정·질문 답을 보냈을 때 — App 이 패널을 열린 채로 둔다 (spec 011 FR-5) */
  onRequestHandled?: () => void;
}

/**
 * 에이전트 사이드바 본문 — 헤더(상태·새 대화)·대화(말풍선·턴)·승인 창·질문 카드·할 일 입력을 묶고 (spec 009),
 * start/stop/approve/answer 실패는 main 의 메시지로 toast
 */
export function AgentPanel({ run, accountSlot, onClose, onRequestHandled }: IAgentPanelProps) {
  const { runId, status, pendingApproval, pendingQuestion } = run;
  const [task, setTask] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const isBusy = isStarting || isRunActive(status);
  const canStop = runId !== null && !isStarting;
  const canReset = !isBusy && (runId !== null || run.pastTurnList.length > 0);

  const handleStart = async () => {
    setIsStarting(true);
    const startResult = await run.start(task);
    setIsStarting(false);
    if (startResult.ok) setTask('');
    else toast.error(startResult.error.message);
  };

  const handleStop = async () => {
    const stopResult = await run.stop();
    if (!stopResult.ok) toast.error(stopResult.error.message);
  };

  const handleDecide = async (decision: TDecision) => {
    const approveResult = await run.approve(decision);
    if (approveResult.ok) onRequestHandled?.();
    else toast.error(approveResult.error.message);
  };

  const handleAnswer = async (text: string) => {
    const answerResult = await run.answer(text);
    if (answerResult.ok) onRequestHandled?.();
    else toast.error(answerResult.error.message);
  };

  const pendingCard = (pendingApproval || pendingQuestion) && (
    <div className="flex flex-col gap-2">
      {pendingApproval && (
        <ApprovalPanel key={pendingApproval.requestId} request={pendingApproval} onDecide={handleDecide} />
      )}
      {pendingQuestion && (
        <QuestionCard key={pendingQuestion.requestId} question={pendingQuestion} onAnswer={handleAnswer} />
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SidebarHeader status={status} canReset={canReset} onReset={run.reset} onClose={() => onClose?.()} />
      {accountSlot}
      <Conversation pastTurnList={run.pastTurnList} currentTurn={run.currentTurn} footer={pendingCard || undefined} />
      <TaskInput
        task={task}
        isBusy={isBusy}
        canStop={canStop}
        onTaskChange={setTask}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
      />
    </div>
  );
}
