import { useState } from 'react';

import type { TRunStatus, TStep } from '@shared/agent/run';

import { type IRunResult, useAgentRun } from '@/hooks/useAgentRun';
import { toast } from '@/lib/toast';
import { RunResult } from '@/sidebar/RunResult';
import { Timeline } from '@/sidebar/Timeline';

import { StatusBadge } from './StatusBadge';
import { TaskInput } from './TaskInput';

const ACTIVE_STATUS_LIST: TRunStatus[] = ['queued', 'running', 'waiting_user'];
const EMPTY_TEXT = '할 일을 입력하면 여기에 진행 상황이 표시됩니다';

/** 에이전트 사이드바 본문 — 상태 배지·진행 단계·결과·할 일 입력을 묶고, start/stop 실패는 toast */
export function AgentPanel() {
  const { runId, status, stepList, result, start, stop } = useAgentRun();
  const [task, setTask] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const isBusy = isStarting || (status !== null && ACTIVE_STATUS_LIST.includes(status));

  const handleStart = async () => {
    setIsStarting(true);
    const startResult = await start(task);
    setIsStarting(false);
    if (!startResult.ok) toast.error(startResult.error.message);
  };

  const handleStop = async () => {
    const stopResult = await stop();
    if (!stopResult.ok) toast.error(stopResult.error.message);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3">
        <StatusBadge status={status} />
      </div>
      <RunProgress stepList={stepList} result={result} />
      <TaskInput
        task={task}
        isBusy={isBusy}
        canStop={runId !== null && !isStarting}
        onTaskChange={setTask}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
      />
    </div>
  );
}

interface IRunProgressProps {
  stepList: TStep[];
  result: IRunResult | null;
}

/** 진행 영역 — 아직 보일 것이 없으면 안내 문구, 있으면 타임라인 + 결과 */
function RunProgress({ stepList, result }: IRunProgressProps) {
  if (stepList.length === 0 && !result) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {EMPTY_TEXT}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 py-3">
      <Timeline stepList={stepList} />
      {result && <RunResult result={result} />}
    </div>
  );
}
