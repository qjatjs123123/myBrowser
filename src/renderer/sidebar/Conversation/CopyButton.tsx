import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const COPIED_MS = 1500;
const COPY_FAILED_MESSAGE = '복사하지 못했습니다';

interface ICopyButtonProps {
  text: string;
  /** 접근 이름 — 예: "할 일 복사" */
  label: string;
  className?: string;
}

/** 문구를 클립보드로 복사하는 작은 아이콘 버튼 — 성공하면 잠깐 체크 표시, 실패하면 toast */
export function CopyButton({ text, label, className }: ICopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
    } catch {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={isCopied ? '복사됨' : '복사'}
      onClick={() => void handleClick()}
      className={cn('text-muted-foreground', className)}
    >
      {isCopied ? <Check /> : <Copy />}
    </Button>
  );
}
