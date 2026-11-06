import { ArrowLeft } from 'lucide-react';
import { type ReactNode, useId } from 'react';

import { Button } from '@/components/ui/button';

import { SkillList } from './SkillList';

interface ISettingsSection {
  id: string;
  title: string;
  description: string;
  content: ReactNode;
}

/** 설정 보기의 섹션 목록 — 나중 섹션은 여기에 붙인다 (spec 013 FR-2) */
const SETTINGS_SECTION_LIST: ISettingsSection[] = [
  {
    id: 'skills',
    title: '스킬',
    description: '에이전트가 매 실행에 따르는 내 지침입니다. 다음 실행부터 적용됩니다.',
    content: <SkillList />,
  },
];

interface ISettingsProps {
  /** [대화로 돌아가기] */
  onClose: () => void;
}

/** 설정 보기 — 대화 자리에 섹션 목록을 그린다 (spec 013 FR-1·FR-2). 열 때(마운트)마다 각 섹션이 자기 데이터를 새로 읽는다 */
export function Settings({ onClose }: ISettingsProps) {
  return (
    <section role="region" aria-label="설정" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
          <ArrowLeft aria-hidden />
          대화로 돌아가기
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        {SETTINGS_SECTION_LIST.map((section) => (
          <SettingsSection key={section.id} section={section} />
        ))}
      </div>
    </section>
  );
}

interface ISettingsSectionProps {
  section: ISettingsSection;
}

/** 섹션 하나 — 제목 + 설명 한 줄 + 본문 */
function SettingsSection({ section }: ISettingsSectionProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h3 id={titleId} className="text-sm font-semibold">
          {section.title}
        </h3>
        <p className="text-xs text-muted-foreground">{section.description}</p>
      </div>
      {section.content}
    </section>
  );
}
