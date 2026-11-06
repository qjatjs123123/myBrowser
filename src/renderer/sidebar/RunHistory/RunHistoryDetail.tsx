import { ArrowLeft } from 'lucide-react';

import type { TRunGetResponse, TRunSummary } from '@shared/ipc/runs';

import { Button } from '@/components/ui/button';
import type { IRunResult, ITurn } from '@/hooks/useAgentRun';
import { AgentTurn } from '@/sidebar/Conversation/AgentTurn';
import { UserBubble } from '@/sidebar/Conversation/UserBubble';

/** 중지된 run 의 결과 문구 — 대화의 중지 턴과 같은 문장 (useAgentRun) */
const STOPPED_TEXT = '중지했습니다';

interface IRunHistoryDetailProps {
  detail: TRunGetResponse;
  /** [목록으로] */
  onBack: () => void;
}

/**
 * 지난 run 한 건의 읽기 전용 보기 — 할 일 말풍선 + 에이전트 턴(단계 펼침·결과) (spec 012 FR-3).
 * 다시 실행·승인 버튼은 두지 않는다 (SR-1).
 */
export function RunHistoryDetail({ detail, onBack }: IRunHistoryDetailProps) {
  const turn = toHistoryTurn(detail);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft aria-hidden />
          목록으로
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
        <UserBubble task={turn.task} />
        <AgentTurn turn={turn} isDefaultOpen />
      </div>
    </div>
  );
}

/** 기록 응답 → 대화 턴 모양 */
function toHistoryTurn({ run, stepList }: TRunGetResponse): ITurn {
  return { runId: run.id, task: run.task, status: run.status, stepList, result: toHistoryResult(run) };
}

/** 끝난 run 의 결과 문단 — 완료 summary / 실패 reason / 중지 문구, 그 밖(실행 중 등)은 없음 */
function toHistoryResult(run: TRunSummary): IRunResult | null {
  if (run.status === 'done' && run.summary !== null) return { kind: 'done', text: run.summary };
  if (run.status === 'failed' && run.reason !== null) return { kind: 'failed', text: run.reason };
  if (run.status === 'stopped') return { kind: 'stopped', text: STOPPED_TEXT };
  return null;
}
