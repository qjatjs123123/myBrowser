/**
 * [spec 008] e2e 외부 요청 차단 — 탭이 외부 host 로 가면 픽스처가 요청을 취소하고 errorList 에 남겨 테스트를 실패시킨다.
 * 차단 자체를 확인하는 테스트라 기록을 확인한 뒤 errorList 를 비운다. 실제 외부 접속은 일어나지 않는다(취소).
 */
import { expect, EXTERNAL_REQUEST_PREFIX, test } from './fixtures';
import { openInActiveTab } from './helpers';

const EXTERNAL_URL = 'http://example.invalid/';

test('외부 사이트로 이동하면 요청을 막고 차단 기록을 남긴다', async ({ win, errorList }) => {
  const addressBar = win.getByRole('combobox', { name: '주소창' });
  await addressBar.click();
  await addressBar.fill(EXTERNAL_URL);
  await expect(addressBar).toHaveValue(EXTERNAL_URL);
  await addressBar.press('Enter');

  await expect
    .poll(() => errorList.filter((line) => line.startsWith(EXTERNAL_REQUEST_PREFIX)))
    .toEqual([`${EXTERNAL_REQUEST_PREFIX} ${EXTERNAL_URL}`]);
  await expect(win.getByRole('tab', { name: 'example.invalid' })).toHaveCount(0);
  errorList.splice(0, errorList.length);
});

test('로컬 픽스처로 이동하면 차단 기록이 없다', async ({ win, errorList, fixtureUrl }) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), '픽스처 첫 페이지');
  expect(errorList.filter((line) => line.startsWith(EXTERNAL_REQUEST_PREFIX))).toEqual([]);
});
