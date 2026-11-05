import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '../../log';
import { createCredentialStore, type ISafeStorageLike } from '../credentialStore';

const TOKEN = 'dt_' + 'a'.repeat(40);

/** 가짜 safeStorage — 평문을 뒤집고 접두사를 붙인다 (원문이 파일에 그대로 남지 않음을 확인할 수 있게) */
function createFakeSafeStorage(overrides: Partial<ISafeStorageLike> = {}): ISafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
    decryptString: (encrypted) => {
      const text = encrypted.toString();
      if (!text.startsWith('enc:')) throw new Error('복호화 실패');
      return [...text.slice(4)].reverse().join('');
    },
    ...overrides,
  };
}

describe('createCredentialStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mybrowser-cred-'));
    filePath = join(dir, 'credentials.bin');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('쓴 토큰을 새 저장소 인스턴스가 파일에서 다시 읽는다', () => {
    createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false }).write(TOKEN);
    const reopened = createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false });
    expect(reopened.read()).toBe(TOKEN);
  });

  it('파일은 암호문이고 평문 토큰을 담지 않는다', () => {
    createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false }).write(TOKEN);
    expect(readFileSync(filePath).toString()).not.toContain(TOKEN);
  });

  it('파일 권한은 0o600 이고 임시 파일은 남지 않는다', () => {
    createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false }).write(TOKEN);
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it('암호화를 쓸 수 없으면 디스크에 쓰지 않고 메모리에만 둔다', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const safeStorage = createFakeSafeStorage({ isEncryptionAvailable: () => false });
    const store = createCredentialStore({ filePath, safeStorage, allowBasicText: true });
    store.write(TOKEN);
    expect(existsSync(filePath)).toBe(false);
    expect(store.read()).toBe(TOKEN);
    expect(warn).toHaveBeenCalled();
  });

  it('allowBasicText=false 이고 백엔드가 basic_text 면 디스크에 쓰지 않는다', () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const safeStorage = createFakeSafeStorage({ getSelectedStorageBackend: () => 'basic_text' });
    const store = createCredentialStore({ filePath, safeStorage, allowBasicText: false });
    store.write(TOKEN);
    expect(existsSync(filePath)).toBe(false);
    expect(store.read()).toBe(TOKEN);
  });

  it('allowBasicText=true 면 basic_text 백엔드에도 디스크에 쓴다', () => {
    const safeStorage = createFakeSafeStorage({ getSelectedStorageBackend: () => 'basic_text' });
    createCredentialStore({ filePath, safeStorage, allowBasicText: true }).write(TOKEN);
    expect(createCredentialStore({ filePath, safeStorage, allowBasicText: true }).read()).toBe(TOKEN);
  });

  it('백엔드 조회 API 가 없는 OS 에서는 암호화 가능 여부만으로 디스크에 쓴다', () => {
    const safeStorage = createFakeSafeStorage({ getSelectedStorageBackend: undefined });
    createCredentialStore({ filePath, safeStorage, allowBasicText: false }).write(TOKEN);
    expect(existsSync(filePath)).toBe(true);
  });

  it('파일이 없으면 null 이다', () => {
    expect(
      createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false }).read(),
    ).toBeNull();
  });

  it('복호화할 수 없는 깨진 파일이면 null 을 돌려주고 파일을 지운다', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    writeFileSync(filePath, 'garbage');
    const store = createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false });
    expect(store.read()).toBeNull();
    expect(existsSync(filePath)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('복호화는 되지만 JSON 모양이 틀리면 null 을 돌려주고 파일을 지운다', () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const safeStorage = createFakeSafeStorage();
    writeFileSync(filePath, safeStorage.encryptString(JSON.stringify({ token: TOKEN })));
    expect(createCredentialStore({ filePath, safeStorage, allowBasicText: false }).read()).toBeNull();
    expect(existsSync(filePath)).toBe(false);
  });

  it('clear 하면 메모리와 파일 모두에서 토큰이 사라진다', () => {
    const store = createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false });
    store.write(TOKEN);
    store.clear();
    expect(store.read()).toBeNull();
    expect(existsSync(filePath)).toBe(false);
  });

  it('디스크 쓰기가 실패해도 throw 하지 않고 메모리에 둔다', () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const fs = {
      readFileSync: vi.fn(() => Buffer.from('')),
      writeFileSync: vi.fn(() => {
        throw new Error('ENOSPC');
      }),
      renameSync: vi.fn(),
      rmSync: vi.fn(),
    };
    const store = createCredentialStore({ filePath, safeStorage: createFakeSafeStorage(), allowBasicText: false, fs });
    expect(() => store.write(TOKEN)).not.toThrow();
    expect(store.read()).toBe(TOKEN);
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  it('로그 인자에 토큰 값이 나타나지 않는다 (SR-1)', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const store = createCredentialStore({
      filePath,
      safeStorage: createFakeSafeStorage({ isEncryptionAvailable: () => false }),
      allowBasicText: false,
    });
    store.write(TOKEN);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
  });
});
