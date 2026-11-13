import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SITE_APPROVAL_ANSWER } from '../siteScenarios';

/** 실제 사이트 러너 소스 — playwright 러너 밖이라 import 하지 않고 글로만 읽는다 */
const RUNNER_SOURCE = readFileSync(join(__dirname, '..', 'sites.eval.ts'), 'utf8');

describe('실제 사이트 세트는 승인 창을 모두 거부한다 (spec 019 SR-1)', () => {
  it.each(["'agent'", "'user_done'", 'onApproval'])('러너 소스에 %s 가 없다', (text) => {
    expect(RUNNER_SOURCE).not.toContain(text);
  });

  it('러너는 승인 답을 siteScenarios 의 상수에서 가져온다', () => {
    expect(RUNNER_SOURCE).toMatch(/import \{[^}]*SITE_APPROVAL_ANSWER[^}]*\} from '\.\/siteScenarios'/);
  });

  it('러너는 끝까지 진행할 때 그 상수를 승인 답으로 넘긴다', () => {
    expect(RUNNER_SOURCE).toContain('approvalAnswer: SITE_APPROVAL_ANSWER');
  });

  it('승인 답 상수는 거부다', () => {
    expect(SITE_APPROVAL_ANSWER).toBe('denied');
  });
});
