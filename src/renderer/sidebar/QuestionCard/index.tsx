import { MessageCircleQuestion } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { TQuestion } from '@shared/agent/run';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SECRET_GUIDE = '비밀번호·카드번호는 여기 쓰지 말고 탭에 직접 입력하세요';
const ANSWER_MAX_LENGTH = 1000;

interface IQuestionCardProps {
  question: TQuestion;
  /** 답을 main 에 보낸다 — 실패 toast 는 호출부가. 카드는 question_answered 이벤트로 닫힌다 */
  onAnswer: (answer: string) => Promise<void>;
}

/**
 * 에이전트의 ask_user 질문 카드 — 선택지 버튼 또는 자유 입력으로 답한다 (FR-3).
 * 열리면 답변칸에 포커스, 비밀값을 받지 않도록 안내 문구를 둔다 (SR-5).
 */
export function QuestionCard({ question, onAnswer }: IQuestionCardProps) {
  const [answer, setAnswer] = useState('');
  const [isSending, setIsSending] = useState(false);
  const answerRef = useRef<HTMLInputElement>(null);
  const canSend = !isSending && answer.trim().length > 0;

  useEffect(() => answerRef.current?.focus(), []);

  const send = async (text: string) => {
    setIsSending(true);
    await onAnswer(text);
    setIsSending(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) void send(answer.trim());
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="에이전트 질문"
      className="flex flex-col gap-3 rounded-md border border-warning bg-warning/10 p-3 text-sm"
    >
      <p className="flex items-start gap-1.5 font-semibold">
        <MessageCircleQuestion aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span className="min-w-0 break-words whitespace-pre-wrap">{question.text}</span>
      </p>
      {question.optionList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {question.optionList.map((option) => (
            <Button key={option} size="sm" variant="outline" disabled={isSending} onClick={() => void send(option)}>
              {option}
            </Button>
          ))}
        </div>
      )}
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <Input
          ref={answerRef}
          aria-label="답변"
          value={answer}
          maxLength={ANSWER_MAX_LENGTH}
          disabled={isSending}
          onChange={(event) => setAnswer(event.target.value)}
          className="h-8"
        />
        <Button type="submit" size="sm" disabled={!canSend}>
          보내기
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{SECRET_GUIDE}</p>
    </section>
  );
}
