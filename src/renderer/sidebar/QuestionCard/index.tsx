import { MessageCircleQuestion } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { TQuestion } from '@shared/agent/run';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChoiceList, type IChoice } from '@/sidebar/ChoiceList';

const SECRET_GUIDE = '비밀번호·카드번호는 여기 쓰지 말고 탭에 직접 입력하세요';
const ANSWER_PLACEHOLDER = '직접 입력';
const ANSWER_MAX_LENGTH = 1000;

interface IQuestionCardProps {
  question: TQuestion;
  /** 답을 main 에 보낸다 — 실패 toast 는 호출부가. 카드는 question_answered 이벤트로 닫힌다 */
  onAnswer: (answer: string) => Promise<void>;
}

/**
 * 에이전트의 ask_user 질문 카드 — 번호 선택 목록(첫 선택지 포커스) 또는 자유 입력으로 답한다 (spec 004 FR-3, spec 009 FR-10).
 * 선택지가 없으면 답변칸에 포커스. 비밀값을 받지 않도록 안내 문구를 둔다 (SR-5).
 */
export function QuestionCard({ question, onAnswer }: IQuestionCardProps) {
  const [isSending, setIsSending] = useState(false);
  const hasOption = question.optionList.length > 0;

  const send = async (text: string) => {
    setIsSending(true);
    await onAnswer(text);
    setIsSending(false);
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="에이전트 질문"
      className="flex flex-col gap-3 rounded-xl border border-warning/60 bg-background p-3 text-sm shadow-sm"
    >
      <p className="flex items-start gap-1.5 font-semibold">
        <MessageCircleQuestion aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span className="min-w-0 break-words whitespace-pre-wrap">{question.text}</span>
      </p>
      {hasOption && (
        <ChoiceList
          label="답 선택"
          choiceList={toChoiceList(question.optionList)}
          isDisabled={isSending}
          onChoose={(option) => void send(option)}
        />
      )}
      <AnswerForm isAutoFocus={!hasOption} isSending={isSending} onSend={(text) => void send(text)} />
      <p className="text-xs text-muted-foreground">{SECRET_GUIDE}</p>
    </section>
  );
}

interface IAnswerFormProps {
  isAutoFocus: boolean;
  isSending: boolean;
  onSend: (text: string) => void;
}

/** 자유 입력 줄 — Enter(폼 제출)·[보내기] 로 앞뒤 공백을 뺀 답을 보낸다 */
function AnswerForm({ isAutoFocus, isSending, onSend }: IAnswerFormProps) {
  const [answer, setAnswer] = useState('');
  const answerRef = useRef<HTMLInputElement>(null);
  const canSend = !isSending && answer.trim().length > 0;

  useEffect(() => {
    if (isAutoFocus) answerRef.current?.focus();
  }, [isAutoFocus]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) onSend(answer.trim());
  };

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <Input
        ref={answerRef}
        aria-label="답변"
        placeholder={ANSWER_PLACEHOLDER}
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
  );
}

/** 선택지 문구 → 선택 목록 (값 = 문구 그대로 답으로 보낸다) */
function toChoiceList(optionList: string[]): IChoice<string>[] {
  return optionList.map((option) => ({ value: option, label: option }));
}
