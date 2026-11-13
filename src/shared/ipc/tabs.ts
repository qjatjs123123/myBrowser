import { z } from 'zod';

/** [tabs] 탭 id — main 의 TabManager 가 발급한다 */
export const TabIdSchema = z.string().min(1);

/** [tabs] 탭이 열 수 있는 URL — http(s) 만 (SR-2) */
export const HttpUrlSchema = z.url({ protocol: /^https?$/ });

/** [tabs] 확대/축소 배율 하한·상한(%) — Chromium 단계와 같다 (spec 021) */
export const ZOOM_PERCENT_MIN = 25;
export const ZOOM_PERCENT_MAX = 500;
/** [tabs] 기본 배율(%) — 이 값이 아니면 주소창 옆에 배율 버튼이 보인다 */
export const DEFAULT_ZOOM_PERCENT = 100;
/** [tabs] 페이지 내 찾기 문자열 최대 길이 */
export const FIND_TEXT_MAX = 200;

/** [tabs] 에이전트 표시 — working = queued·running, waiting = waiting_user */
export const AgentActivitySchema = z.enum(['working', 'waiting']);

/** [tabs] 탭 하나의 상태 — main 이 단일 출처 */
export const TabStateSchema = z.strictObject({
  id: TabIdSchema,
  /** about:blank 포함 현재 URL */
  url: z.string(),
  /** 새 탭이면 '새 탭', 제목 없으면 url */
  title: z.string(),
  faviconUrl: z.string().nullable(),
  isLoading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isNewTab: z.boolean(),
  /** 확대/축소 배율(%) — 100 이 기본 (spec 021 FR-10) */
  zoomPercent: z.number().int().min(ZOOM_PERCENT_MIN).max(ZOOM_PERCENT_MAX),
  /** 에이전트가 이 탭에서 일하는 중(working)·사용자 응답 대기(waiting) — 표시용 (spec 021 FR-12, SR-4) */
  agentActivity: AgentActivitySchema.nullable(),
});

/** [tabs] 전체 탭 목록 + 활성 탭 id */
export const TabsSnapshotSchema = z.strictObject({
  tabList: z.array(TabStateSchema),
  activeTabId: TabIdSchema.nullable(),
});

/** [tabs:close|activate|goBack|goForward|reload|stop] 요청 — 대상 탭 id */
export const TabRequestSchema = z.strictObject({ tabId: TabIdSchema });

/** [tabs] 돌려줄 데이터가 없는 응답 */
export const EmptyResponseSchema = z.null();

/** [tabs:list] 응답 */
export const ListTabsResponseSchema = TabsSnapshotSchema;

/** [tabs:create] 요청 — url 이 없으면 새 탭(시작 화면) */
export const CreateTabRequestSchema = z.strictObject({ url: HttpUrlSchema.optional() });

/** [tabs:create] 응답 */
export const CreateTabResponseSchema = z.strictObject({ tabId: TabIdSchema });

/** [tabs:navigate] 요청 */
export const NavigateRequestSchema = z.strictObject({ tabId: TabIdSchema, url: HttpUrlSchema });

const BoundsValueSchema = z.number().int().min(0);

/** [tabs:setBounds] 요청 — renderer 콘텐츠 영역의 창 기준 사각형 */
export const SetBoundsRequestSchema = z.strictObject({
  x: BoundsValueSchema,
  y: BoundsValueSchema,
  width: BoundsValueSchema,
  height: BoundsValueSchema,
});

/** [tabs:zoom] 요청 — 활성 탭이 아니어도 되고, 같은 호스트 탭은 배율을 공유한다 */
export const ZoomTabRequestSchema = z.strictObject({
  tabId: TabIdSchema,
  direction: z.enum(['in', 'out', 'reset']),
});

/** [tabs:find] 요청 — isNext=false 면 새 검색, true 면 같은 검색어의 다음/이전 결과 */
export const FindInPageRequestSchema = z.strictObject({
  tabId: TabIdSchema,
  text: z.string().min(1).max(FIND_TEXT_MAX),
  isForward: z.boolean(),
  isNext: z.boolean(),
});

/** [tabs:findUpdated] main→renderer 이벤트 — 찾기 결과 (found-in-page 의 마지막 갱신만) */
export const FindUpdatedEventSchema = z.strictObject({
  tabId: TabIdSchema,
  activeMatch: z.number().int().min(0),
  matchCount: z.number().int().min(0),
});

/** [tabs:changed] main→renderer 이벤트 — 전체 목록 */
export const TabsChangedEventSchema = TabsSnapshotSchema;

export type TTabState = z.infer<typeof TabStateSchema>;
export type TTabsSnapshot = z.infer<typeof TabsSnapshotSchema>;
export type TTabRequest = z.infer<typeof TabRequestSchema>;
export type TListTabsResponse = z.infer<typeof ListTabsResponseSchema>;
export type TCreateTabRequest = z.infer<typeof CreateTabRequestSchema>;
export type TCreateTabResponse = z.infer<typeof CreateTabResponseSchema>;
export type TNavigateRequest = z.infer<typeof NavigateRequestSchema>;
export type TSetBoundsRequest = z.infer<typeof SetBoundsRequestSchema>;
export type TTabsChangedEvent = z.infer<typeof TabsChangedEventSchema>;
export type TAgentActivity = z.infer<typeof AgentActivitySchema>;
export type TZoomTabRequest = z.infer<typeof ZoomTabRequestSchema>;
export type TZoomDirection = TZoomTabRequest['direction'];
export type TFindInPageRequest = z.infer<typeof FindInPageRequestSchema>;
export type TFindUpdatedEvent = z.infer<typeof FindUpdatedEventSchema>;
