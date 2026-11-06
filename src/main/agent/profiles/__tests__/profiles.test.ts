import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MODEL_REQUEST } from '../../loop';
import { ANTHROPIC_DEFAULT_BASE_URL, MissingApiKeyError, MissingCredentialError } from '../../modelClient';
import { createDevProfile } from '../devProfile';
import { createFakeProfile } from '../fakeProfile';
import { createModelProfile, DEV_DEFAULT_MODEL, DEV_MODEL_REQUEST } from '../index';
import { createProdProfile } from '../prodProfile';

const PROXY = 'https://proxy.example.test';
const GATEWAY = 'http://127.0.0.1:4000';
const API_KEY = 'sk-test-key';
const DEVICE_TOKEN = 'device-token-secret';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dev 프로필 (spec 007 FR-3~5)', () => {
  const profile = createDevProfile({ apiKey: API_KEY, baseUrl: PROXY, model: DEV_DEFAULT_MODEL });

  it('kind 는 dev 이고 기본 모델은 bedrock.anthropic.claude-opus-5-5 다', () => {
    expect([profile.kind, profile.model]).toEqual(['dev', 'bedrock.anthropic.claude-opus-5-5']);
  });

  it('요청은 fallbacks 없이 context-management 베타만 보낸다', () => {
    expect(profile.request).toEqual({ betaList: ['context-management-2025-06-27'], hasFallbacks: false });
  });

  it('픽셀 computer toolset 을 넣지 않는다', () => {
    expect(profile.hasComputerToolset).toBe(false);
  });

  it('클라이언트는 프록시 주소로 SDK 기본 재시도(2)로 부른다', () => {
    const client = profile.createClient() as Anthropic;
    expect([client.baseURL, client.maxRetries]).toEqual([PROXY, 2]);
  });

  it('키가 없으면 createClient 가 MissingApiKeyError 를 던진다', () => {
    const noKey = createDevProfile({ baseUrl: PROXY, model: DEV_DEFAULT_MODEL });
    expect(() => noKey.createClient()).toThrow(MissingApiKeyError);
  });

  it('셸에 다른 ANTHROPIC_BASE_URL 이 있어도 주어진 프록시 주소를 쓴다', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://leak.invalid');
    expect((profile.createClient() as Anthropic).baseURL).toBe(PROXY);
  });
});

describe('prod 프로필 (spec 007 FR-6)', () => {
  it('기기 토큰으로 게이트웨이 주소·재시도 0 으로 부른다', () => {
    const profile = createProdProfile({
      gatewayUrl: GATEWAY,
      getDeviceToken: () => DEVICE_TOKEN,
      model: 'claude-opus-5-5',
    });
    const client = profile.createClient() as Anthropic;
    expect([client.baseURL, client.maxRetries]).toEqual([GATEWAY, 0]);
  });

  it('토큰이 없으면 createClient 가 MissingCredentialError 를 던진다', () => {
    const profile = createProdProfile({ gatewayUrl: GATEWAY, getDeviceToken: () => null, model: 'claude-opus-5-5' });
    expect(() => profile.createClient()).toThrow(MissingCredentialError);
  });

  it('createClient 는 부를 때마다 그 시점의 토큰을 읽는다', () => {
    let token: string | null = null;
    const profile = createProdProfile({ gatewayUrl: GATEWAY, getDeviceToken: () => token, model: 'claude-opus-5-5' });
    expect(() => profile.createClient()).toThrow(MissingCredentialError);
    token = DEVICE_TOKEN;
    expect(profile.createClient()).toBeDefined();
  });

  it('요청 옵션은 기본 그대로이고 픽셀 도구를 넣는다', () => {
    const profile = createProdProfile({ gatewayUrl: GATEWAY, getDeviceToken: () => null, model: 'claude-opus-5-5' });
    expect([profile.kind, profile.request, profile.hasComputerToolset]).toEqual(['prod', DEFAULT_MODEL_REQUEST, true]);
  });
});

describe('fake 프로필 (spec 007 FR-7)', () => {
  it('요청 옵션·픽셀 도구가 prod 와 같다', () => {
    const profile = createFakeProfile({ model: 'claude-opus-5-5', readScenario: () => undefined });
    expect([profile.kind, profile.request, profile.hasComputerToolset]).toEqual(['fake', DEFAULT_MODEL_REQUEST, true]);
  });

  it('셸에 ANTHROPIC_BASE_URL 이 있어도 가짜 클라이언트는 기본 주소를 쓴다', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://leak.invalid');
    const profile = createFakeProfile({ model: 'claude-opus-5-5', readScenario: () => undefined });
    expect((profile.createClient() as Anthropic).baseURL).toBe(ANTHROPIC_DEFAULT_BASE_URL);
  });

  it('createClient 마다 시나리오를 다시 읽는다', () => {
    const readScenario = vi.fn(() => undefined);
    const profile = createFakeProfile({ model: 'claude-opus-5-5', readScenario });
    profile.createClient();
    profile.createClient();
    expect(readScenario).toHaveBeenCalledTimes(2);
  });
});

describe('createModelProfile', () => {
  it.each([
    ['dev', createModelProfile({ kind: 'dev', apiKey: API_KEY, baseUrl: PROXY, model: DEV_DEFAULT_MODEL })],
    ['prod', createModelProfile({ kind: 'prod', gatewayUrl: GATEWAY, getDeviceToken: () => null, model: 'm' })],
    ['fake', createModelProfile({ kind: 'fake', model: 'm', readScenario: () => undefined })],
  ])('kind %s 면 그 전략을 돌려준다', (kind, profile) => {
    expect(profile.kind).toBe(kind);
  });

  it('dev 전략의 요청 옵션은 DEV_MODEL_REQUEST 다', () => {
    const profile = createModelProfile({ kind: 'dev', apiKey: API_KEY, baseUrl: PROXY, model: DEV_DEFAULT_MODEL });
    expect(profile.request).toBe(DEV_MODEL_REQUEST);
  });

  it('프로필 객체를 직렬화해도 키·기기 토큰이 없다 (SR-2)', () => {
    const dev = createModelProfile({ kind: 'dev', apiKey: API_KEY, baseUrl: PROXY, model: DEV_DEFAULT_MODEL });
    const prod = createModelProfile({
      kind: 'prod',
      gatewayUrl: GATEWAY,
      getDeviceToken: () => DEVICE_TOKEN,
      model: 'm',
    });
    const text = JSON.stringify([dev, prod]);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain(DEVICE_TOKEN);
  });
});
