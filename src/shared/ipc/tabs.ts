import { z } from 'zod';

/** [tabs] 탭 id — main 의 TabManager 가 발급한다 */
export const TabIdSchema = z.string().min(1);

/** [tabs] 탭이 열 수 있는 URL — http(s) 만 (SR-2) */
export const HttpUrlSchema = z.url({ protocol: /^https?$/ });

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
