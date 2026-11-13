/**
 * [e2e 픽스처 서버] 탭 e2e 가 외부 사이트 대신 여는 로컬 HTTP 서버 — 127.0.0.1 임의 포트.
 * - `/{name}.html` → e2e/fixtures/pages/{name}.html
 * - `/favicon.ico` → 1×1 png (파비콘 404 콘솔 에러 방지)
 * - `/set-cookie` → 만료 있는 쿠키(e2e_login=1)를 심고 /cookie 로 이동 (프로필 영속 확인용)
 * - `/cookie` → 받은 Cookie 헤더를 본문에 출력
 * 규칙: .claude/rules/test-convention.md — 외부 사이트 금지
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

const PAGES_DIR = join(__dirname, 'pages');
const PAGE_NAME_PATTERN = /^\/([a-z0-9-]+)\.html$/;
const FAVICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface IFixtureServer {
  /** 픽스처 경로의 절대 URL — 예: url('basic.html'), url('cookie') */
  url: (path: string) => string;
  close: () => Promise<void>;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
}

function createFixtureServer(): Server {
  return createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const pageMatch = PAGE_NAME_PATTERN.exec(path);
    if (pageMatch) {
      try {
        const body = readFileSync(join(PAGES_DIR, `${pageMatch[1]}.html`));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      }
      return;
    }
    if (path === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(FAVICON_PNG);
      return;
    }
    if (path === '/set-cookie') {
      res.writeHead(302, { 'Set-Cookie': 'e2e_login=1; Max-Age=3600; Path=/', Location: '/cookie' }).end();
      return;
    }
    if (path === '/cookie') {
      const cookie = escapeHtml(req.headers.cookie ?? '(없음)');
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          `<!doctype html><html lang="ko"><head><title>쿠키 확인</title></head><body><p id="cookie">${cookie}</p></body></html>`,
        );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  });
}

/** 픽스처 서버를 127.0.0.1 임의 포트로 띄운다 */
export async function startFixtureServer(): Promise<IFixtureServer> {
  const server = createFixtureServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path) => `http://127.0.0.1:${port}/${path.replace(/^\//, '')}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
