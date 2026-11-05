import type { Page } from 'playwright-core';

import type { IGuardTarget, IResolveTargetRequest } from '@shared/tools';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface IResolveTargetOptions {
  timeoutMs?: number;
}

/**
 * [가드 target 해석] ref 요소 또는 포커스된 요소의 가드 판정용 정보를 읽는다 (spec 003 「가드 target 해석」).
 * 읽기 함수는 우리 코드가 정한 것만 페이지에 보낸다 — 모델 입력을 실행하지 않는다.
 * 찾을 수 없거나 읽기에 실패하면 null (fail-closed 판정은 가드가 한다).
 */
export async function resolveTarget(
  page: Page,
  req: IResolveTargetRequest,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: IResolveTargetOptions = {},
): Promise<IGuardTarget | null> {
  try {
    if (req.ref !== undefined) return await resolveRefTarget(page, req.ref, timeoutMs);
    if (req.focused) return await page.locator('body').evaluate(readGuardTarget, true, { timeout: timeoutMs });
    return null;
  } catch {
    return null;
  }
}

async function resolveRefTarget(page: Page, ref: string, timeoutMs: number): Promise<IGuardTarget | null> {
  const locator = page.locator(`aria-ref=${ref}`);
  if ((await locator.count()) === 0) return null;
  return locator.first().evaluate(readGuardTarget, false, { timeout: timeoutMs });
}

/** 페이지 안에서 쓰는 DOM 의 최소 모양 — main 은 DOM lib 을 쓰지 않으므로 필요한 것만 적는다 */
interface IDomElement {
  tagName: string;
  innerText?: string;
  textContent: string | null;
  value?: string;
  type?: string;
  href?: unknown;
  action?: unknown;
  form?: IDomElement | null;
  labels?: ArrayLike<IDomElement> | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  closest(selector: string): IDomElement | null;
  querySelector(selector: string): IDomElement | null;
  ownerDocument: IDomDocument;
}

interface IDomDocument {
  activeElement: IDomElement | null;
  body: IDomElement | null;
  documentElement: IDomElement | null;
  location: { href: string };
  getElementById(id: string): IDomElement | null;
}

/**
 * 페이지 안에서 실행되는 읽기 함수 — 직렬화되어 보내지므로 바깥 함수·변수를 참조하지 않는다 (안쪽 함수만).
 * isFocused 면 element(body) 대신 포커스된 요소를 고른다: 폼 안의 입력칸이면 그 폼의 submit 버튼(Enter 가 누르는 것),
 * 아니면 포커스된 요소 자체 — Tab 으로 폼 밖 "예약 확정" 버튼에 포커스한 뒤 Enter 하는 우회를 막는다.
 */
function readGuardTarget(element: unknown, isFocused: boolean): IGuardTarget | null {
  const SUBMIT_SELECTOR = 'button[type=submit], button:not([type]), input[type=submit], input[type=image]';
  const NON_TEXT_INPUT_TYPE_LIST = ['submit', 'button', 'image', 'reset', 'checkbox', 'radio', 'file'];
  const clean = (value: unknown, max = 200) =>
    (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().slice(0, max);
  const getForm = (el: IDomElement) => el.form ?? el.closest('form');
  const isTextEntry = (el: IDomElement) =>
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && !NON_TEXT_INPUT_TYPE_LIST.includes(el.type ?? ''));
  const pickFocused = (doc: IDomDocument): IDomElement | null => {
    const active = doc.activeElement;
    if (!active || active === doc.body || active === doc.documentElement) return null;
    const submit = isTextEntry(active) ? getForm(active)?.querySelector(SUBMIT_SELECTOR) : null;
    return submit ?? active;
  };
  const getLabel = (el: IDomElement) => {
    const labelledBy = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    const byIdList = labelledBy.map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '');
    const labelList = Array.from(el.labels ?? []).map((label) => label.innerText ?? label.textContent ?? '');
    return clean([...byIdList, ...labelList].join(' '));
  };
  const getRole = (el: IDomElement) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === 'A') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag !== 'INPUT') return tag.toLowerCase();
    const type = el.type ?? 'text';
    if (['submit', 'button', 'image', 'reset'].includes(type)) return 'button';
    if (type === 'search') return 'searchbox';
    return ['checkbox', 'radio'].includes(type) ? type : 'textbox';
  };
  const getText = (el: IDomElement) => clean(el.innerText ?? el.textContent ?? '');
  const getName = (el: IDomElement) =>
    clean(el.getAttribute('aria-label')) ||
    getLabel(el) ||
    (isTextEntry(el) ? '' : getText(el)) ||
    clean(el.type === 'submit' || el.type === 'button' ? el.value : '') ||
    clean(el.getAttribute('title')) ||
    clean(el.getAttribute('placeholder'));
  const getFormSubmitText = (form: IDomElement | null) => {
    const submit = form?.querySelector(SUBMIT_SELECTOR);
    return submit ? getName(submit) : '';
  };
  const toTarget = (el: IDomElement): IGuardTarget => {
    const form = getForm(el);
    const inputType = el.tagName === 'INPUT' ? (el.type ?? 'text') : '';
    return {
      role: getRole(el),
      name: getName(el),
      text: getText(el),
      // 비밀 필드의 입력값은 읽지 않는다 (SR-2·SR-6)
      value: inputType === 'password' ? '' : clean(el.value),
      href: clean(el.href, 2000),
      formAction: form?.hasAttribute('action') ? clean(form.action, 2000) : '',
      formSubmitText: getFormSubmitText(form),
      inputType,
      autocomplete: clean(el.getAttribute('autocomplete')),
      fieldName: clean(el.getAttribute('name')),
      label: getLabel(el),
      pageUrl: el.ownerDocument.location.href,
    };
  };
  const base = element as IDomElement;
  const chosen = isFocused ? pickFocused(base.ownerDocument) : base;
  return chosen ? toTarget(chosen) : null;
}
