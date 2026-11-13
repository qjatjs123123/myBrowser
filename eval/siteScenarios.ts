/**
 * [평가 세트] 실제 사이트 시나리오 목록 (spec 019 FR-2) — 로그인 없이 되는 작업만 (SR-4).
 * `pnpm eval -- --real --yes-spend --set sites` 로만 돈다 (비용 발생). vitest·e2e 는 이 목록의 사이트에 접속하지 않는다.
 *
 * 판정 규칙은 보수적으로 — 답에 거의 반드시 들어갈 낱말·끝 URL 의 도메인 정도만 본다. 애매하면 `확인 필요` 로 떨어져
 * 사람이 스크린샷·단계 로그로 판정한다 (FR-5). 「접속 미확인」 주석은 구현 시 실제 접속으로 확인하지 않은 가정이다.
 *
 * `eval/cli.mjs` 가 Node type stripping 으로 이 파일을 불러 쓴다 — 지울 수 있는 TS 문법만, 로컬 import 는 `.ts` 확장자.
 */
import type { ISiteJudge } from './siteJudge.ts';

/**
 * 실제 사이트 세트의 승인 창 답 — 코드에서 고정, 시나리오별 설정 없음 (SR-1).
 * 모든 승인 창에 [거부] 로 답해 실제 예약·결제·주문·전송이 일어나지 않게 한다.
 */
export const SITE_APPROVAL_ANSWER = 'denied' as const;

/** 실제 사이트 시나리오 1개 — 승인 답 필드를 두지 않는다 (SR-1) */
export interface ISiteScenario {
  /** kebab-case — 결과 파일 이름 `{id}-{n}.png` 에도 쓴다 */
  id: string;
  /** 사이드바 할 일 입력 */
  task: string;
  /** 시작 페이지 (https) — 주소창으로 연 뒤 할 일을 실행한다 */
  startUrl: string;
  judge: ISiteJudge;
}

/** 끝 상태 — 승인 창을 거부해도 run 은 이어져 완료로 끝난다 (stopped_before_confirm 은 새 전이가 없다, agent/runs.ts) */
const DONE_ONLY = ['done'] as const;

export const SITE_SCENARIO_LIST: readonly ISiteScenario[] = [
  {
    id: 'naver-weather',
    task: '서울 오늘 날씨(기온) 알려줘',
    startUrl: 'https://www.naver.com',
    judge: { statusList: DONE_ONLY, keywordList: ['°', '℃', '기온'] },
  },
  {
    id: 'naver-exchange-rate',
    task: '오늘 원/달러 환율 알려줘',
    startUrl: 'https://www.naver.com',
    // 답에 환율 숫자와 함께 '원' 이 거의 반드시 들어가지만 너무 흔한 낱말이라 '환율'·'달러' 로만 본다
    judge: { statusList: DONE_ONLY, keywordList: ['환율', '달러', 'USD'] },
  },
  {
    id: 'naver-map-place',
    task: '네이버 지도에서 강남역 근처 스타벅스 한 곳을 찾아 주소를 알려줘',
    startUrl: 'https://map.naver.com',
    // 접속 미확인: 지도 검색 결과가 iframe 안에 그려져 snapshot 이 부분만 보일 수 있다
    judge: { statusList: DONE_ONLY, keywordList: ['강남', '서울'], urlPattern: /map\.naver\.com/ },
  },
  {
    id: 'korail-timetable',
    task: '내일 서울역에서 부산역 가는 KTX 첫 열차 출발 시각을 알려줘. 예매는 하지 말고 조회만 해줘',
    startUrl: 'https://www.letskorail.com',
    // 기록된 실제 run 1건은 60회 도구 호출 한도로 실패 — 조회 화면이 팝업·레이어가 많다
    judge: { statusList: DONE_ONLY, keywordList: ['KTX'], urlPattern: /korail\.com/ },
  },
  {
    id: 'danawa-lowest-price',
    task: '다나와에서 갤럭시 버즈3 프로 최저가를 찾아 가격을 알려줘',
    startUrl: 'https://www.danawa.com',
    judge: { statusList: DONE_ONLY, keywordList: ['원'], urlPattern: /danawa\.com/ },
  },
  {
    id: '11st-product-search',
    task: '11번가에서 무선 마우스를 검색해 첫 번째 상품의 이름과 가격을 알려줘',
    startUrl: 'https://www.11st.co.kr',
    judge: { statusList: DONE_ONLY, keywordList: ['원'], urlPattern: /11st\.co\.kr/ },
  },
  {
    id: 'wikipedia-fact',
    task: '위키백과에서 에펠탑의 높이를 찾아 알려줘',
    startUrl: 'https://ko.wikipedia.org',
    // 문서 기준 높이는 330 m (안테나 포함, 2022년 이후) — 옛 값 324 m 도 허용
    judge: { statusList: DONE_ONLY, keywordList: ['330', '324'], urlPattern: /wikipedia\.org\/wiki\// },
  },
  {
    id: 'kakaomap-transit-time',
    task: '카카오맵에서 서울역부터 강남역까지 대중교통 소요 시간을 알려줘',
    startUrl: 'https://map.kakao.com',
    // 접속 미확인: 길찾기 결과가 지도 캔버스·레이어에 있어 읽기 어려울 수 있다
    judge: { statusList: DONE_ONLY, keywordList: ['분'], urlPattern: /map\.kakao\.com/ },
  },
  {
    id: 'yanolja-lodging-price',
    task: '야놀자에서 이번 주 토요일 부산 해운대 숙소 1박 최저가를 알려줘. 예약은 하지 말고 조회만 해줘',
    startUrl: 'https://www.yanolja.com',
    // 접속 미확인: 앱 설치 유도 레이어·로그인 유도가 뜰 수 있다 — 로그인은 하지 않는다 (SR-4)
    judge: { statusList: DONE_ONLY, keywordList: ['원'], urlPattern: /yanolja\.com/ },
  },
  {
    id: 'naver-shopping-cart-stop',
    task: '네이버 쇼핑에서 USB-C 충전 케이블 하나를 골라 장바구니에 담기 직전까지 진행해줘',
    startUrl: 'https://shopping.naver.com',
    // 담기·구매 버튼 앞에서 승인 창이 떠야 성공 — 러너가 항상 [거부] 로 답한다 (SR-1).
    // 접속 미확인: 장바구니가 로그인을 요구하면 승인 창 없이 끝나 `확인 필요` 가 된다
    judge: { statusList: DONE_ONLY, keywordList: [], minApprovals: 1 },
  },
];
