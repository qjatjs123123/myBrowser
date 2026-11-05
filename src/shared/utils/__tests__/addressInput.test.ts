import { describe, expect, it } from 'vitest';

import { buildSearchUrl, resolveAddressInput, SEARCH_ENGINE_LIST } from '../addressInput';

describe('resolveAddressInput', () => {
  it('https:// 로 시작하면 그대로 url 이다', () => {
    expect(resolveAddressInput('https://a.com/x')).toEqual({ kind: 'url', url: 'https://a.com/x' });
  });

  it('http:// 로 시작하면 그대로 url 이다', () => {
    expect(resolveAddressInput('http://a.com/x')).toEqual({ kind: 'url', url: 'http://a.com/x' });
  });

  it('naver.com 이면 https:// 를 붙인다', () => {
    expect(resolveAddressInput('naver.com')).toEqual({ kind: 'url', url: 'https://naver.com/' });
  });

  it('example.co.kr/path?q=1 이면 https:// 를 붙이고 경로·쿼리를 유지한다', () => {
    expect(resolveAddressInput('example.co.kr/path?q=1')).toEqual({
      kind: 'url',
      url: 'https://example.co.kr/path?q=1',
    });
  });

  it('localhost:3000 이면 http:// 를 붙인다', () => {
    expect(resolveAddressInput('localhost:3000')).toEqual({ kind: 'url', url: 'http://localhost:3000/' });
  });

  it('127.0.0.1:8080/a 이면 http:// 를 붙인다', () => {
    expect(resolveAddressInput('127.0.0.1:8080/a')).toEqual({ kind: 'url', url: 'http://127.0.0.1:8080/a' });
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(resolveAddressInput('  naver.com  ')).toEqual({ kind: 'url', url: 'https://naver.com/' });
  });

  it('공백이 있는 한글 문장이면 검색어다', () => {
    expect(resolveAddressInput('강남 맛집')).toEqual({ kind: 'search', query: '강남 맛집' });
  });

  it('점 없는 단어면 검색어다', () => {
    expect(resolveAddressInput('hello')).toEqual({ kind: 'search', query: 'hello' });
  });

  it('점이 있어도 공백이 섞이면 검색어다', () => {
    expect(resolveAddressInput('a.b c')).toEqual({ kind: 'search', query: 'a.b c' });
  });

  it('javascript: 입력은 검색어다 (SR-3)', () => {
    expect(resolveAddressInput('javascript:alert(1)')).toEqual({ kind: 'search', query: 'javascript:alert(1)' });
  });

  it('file: 입력은 검색어다 (SR-3)', () => {
    expect(resolveAddressInput('file:///etc/passwd')).toEqual({ kind: 'search', query: 'file:///etc/passwd' });
  });

  it('공백뿐이면 null 이다', () => {
    expect(resolveAddressInput('   ')).toBeNull();
  });

  it('빈 문자열이면 null 이다', () => {
    expect(resolveAddressInput('')).toBeNull();
  });
});

describe('buildSearchUrl', () => {
  it('네이버 검색 URL 에 검색어를 인코딩해 넣는다', () => {
    expect(buildSearchUrl('naver', '강남 맛집')).toBe(
      `https://search.naver.com/search.naver?query=${encodeURIComponent('강남 맛집')}`,
    );
  });

  it('구글 검색 URL 에 검색어를 인코딩해 넣는다', () => {
    expect(buildSearchUrl('google', 'a&b=c')).toBe('https://www.google.com/search?q=a%26b%3Dc');
  });
});

describe('SEARCH_ENGINE_LIST', () => {
  it('네이버가 첫 줄, 구글이 둘째 줄이다', () => {
    expect(SEARCH_ENGINE_LIST).toEqual([
      { engine: 'naver', label: '네이버' },
      { engine: 'google', label: '구글' },
    ]);
  });
});
