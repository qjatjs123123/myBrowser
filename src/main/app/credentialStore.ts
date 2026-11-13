import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

import { z } from 'zod';

import { log } from '../log';

/** electron safeStorage 중 저장소가 쓰는 부분 — index.ts 가 실제 safeStorage 를, 테스트가 가짜를 넣는다 */
export interface ISafeStorageLike {
  isEncryptionAvailable: () => boolean;
  /** Linux 전용 API — 다른 OS 에는 없을 수 있다 */
  getSelectedStorageBackend?: () => string;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
}

/** 저장소가 쓰는 파일 API — 테스트에서 주입 */
export interface ICredentialFs {
  readFileSync: (path: string) => Buffer;
  writeFileSync: (path: string, data: Buffer, options: { mode: number }) => void;
  renameSync: (from: string, to: string) => void;
  rmSync: (path: string, options: { force: true }) => void;
}

export interface ICredentialStoreOptions {
  /** userData/credentials.bin */
  filePath: string;
  safeStorage: ISafeStorageLike;
  /** 키링 없는 Linux 의 basic_text(고정 키 난독화)에도 디스크에 쓸지 — test 모드에서만 true (spec 005 SR-1) */
  allowBasicText: boolean;
  fs?: ICredentialFs;
}

/** 기기 토큰 보관 — 값은 main 에만 있고 로그·이벤트에 싣지 않는다 */
export interface ICredentialStore {
  read: () => string | null;
  write: (token: string) => void;
  clear: () => void;
}

const SCOPE = 'credentials';
const FILE_MODE = 0o600;
const BASIC_TEXT_BACKEND = 'basic_text';
const NODE_FS: ICredentialFs = { readFileSync, writeFileSync, renameSync, rmSync };

const StoredCredentialSchema = z.strictObject({ deviceToken: z.string().min(1) });

/**
 * [자격 저장소] 기기 토큰을 safeStorage 로 암호화해 파일 하나에 둔다 (spec 005 SR-1).
 * 암호화가 안 되거나 production 의 basic_text 백엔드면 디스크에 쓰지 않고 메모리에만 둔다 — 재시작하면 다시 활성화.
 * 규칙: .claude/rules/electron/main.md — electron 의존은 주입받은 safeStorage 뿐
 */
export function createCredentialStore(options: ICredentialStoreOptions): ICredentialStore {
  const fs = options.fs ?? NODE_FS;
  let memoryToken: string | null = null;
  let isLoaded = false;

  return {
    read: () => {
      if (!isLoaded && canPersist(options)) memoryToken = readFromDisk(options.filePath, options.safeStorage, fs);
      isLoaded = true;
      return memoryToken;
    },
    write: (token) => {
      memoryToken = token;
      isLoaded = true;
      if (canPersist(options)) writeToDisk(options, fs, token);
      else log.warn(SCOPE, '안전한 암호화 저장소가 없어 기기 토큰을 메모리에만 둡니다');
    },
    clear: () => {
      memoryToken = null;
      isLoaded = true;
      removeFile(options.filePath, fs);
    },
  };
}

/** 디스크에 써도 되는지 — 암호화 가능 + (basic_text 가 아니거나 허용) */
function canPersist({ safeStorage, allowBasicText }: ICredentialStoreOptions): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (allowBasicText) return true;
  return safeStorage.getSelectedStorageBackend?.() !== BASIC_TEXT_BACKEND;
}

function readFromDisk(filePath: string, safeStorage: ISafeStorageLike, fs: ICredentialFs): string | null {
  let encrypted: Buffer;
  try {
    encrypted = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  try {
    const parsed = StoredCredentialSchema.parse(JSON.parse(safeStorage.decryptString(encrypted)));
    return parsed.deviceToken;
  } catch {
    log.warn(SCOPE, '저장된 기기 토큰을 읽지 못해 파일을 지웁니다');
    removeFile(filePath, fs);
    return null;
  }
}

/** 임시 파일(0o600)에 쓰고 rename — 쓰다 끊겨도 기존 파일이 깨지지 않는다 */
function writeToDisk({ filePath, safeStorage }: ICredentialStoreOptions, fs: ICredentialFs, token: string): void {
  const tempPath = `${filePath}.tmp`;
  try {
    const encrypted = safeStorage.encryptString(JSON.stringify({ deviceToken: token }));
    fs.writeFileSync(tempPath, encrypted, { mode: FILE_MODE });
    fs.renameSync(tempPath, filePath);
  } catch {
    log.warn(SCOPE, '기기 토큰을 디스크에 저장하지 못해 메모리에만 둡니다');
    removeFile(tempPath, fs);
  }
}

function removeFile(path: string, fs: ICredentialFs): void {
  try {
    fs.rmSync(path, { force: true });
  } catch {
    log.warn(SCOPE, '자격 파일을 지우지 못했습니다');
  }
}
