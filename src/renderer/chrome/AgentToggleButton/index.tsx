import { Sparkle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ATTENTION_DESCRIPTION = '확인 필요';

interface IAgentToggleButtonProps {
  /** 패널이 보이는지 — aria-pressed */
  isPressed: boolean;
  /** 승인·질문이 대기 중인데 패널이 안 보임 — 점 표시 */
  needsAttention: boolean;
  onToggle: () => void;
}

/** 툴바 오른쪽 끝 [에이전트] 알약 버튼 — Edge 의 채팅 버튼처럼 오른쪽 패널을 열고 닫는다 (spec 011 FR-2·5b·6) */
export function AgentToggleButton({ isPressed, needsAttention, onToggle }: IAgentToggleButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="에이전트"
      aria-pressed={isPressed}
      aria-description={needsAttention ? ATTENTION_DESCRIPTION : undefined}
      title={needsAttention ? `에이전트 — ${ATTENTION_DESCRIPTION}` : '에이전트'}
      onClick={onToggle}
      className={cn('relative shrink-0 rounded-full px-3', isPressed && 'bg-accent text-accent-foreground')}
    >
      <Sparkle className="text-brand" />
      에이전트
      {needsAttention && <span aria-hidden className="absolute top-1 right-1.5 size-2 rounded-full bg-warning" />}
    </Button>
  );
}
