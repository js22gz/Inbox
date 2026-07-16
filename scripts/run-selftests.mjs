#!/usr/bin/env node
/**
 * Headless full self-test runner (Bulletproof Loop R9).
 *
 * Serves the app over HTTP, loads index.html?selftest in Chromium,
 * ensures self-tests.js runs, asserts zero failures.
 *
 * Usage:
 *   npm test
 *   node scripts/run-selftests.mjs
 *
 * Requires: playwright (devDependency). CI installs Chromium via
 *   npx playwright install chromium --with-deps
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        let rel = decodeURIComponent(url.pathname);
        if (rel === '/') rel = '/index.html';
        // Prevent path traversal
        const abs = path.normalize(path.join(ROOT, rel));
        if (!abs.startsWith(ROOT)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(abs) });
        fs.createReadStream(abs).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e && e.message || e));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

async function ensureSelfTestsLoaded(page) {
  // Wait for pure surface; retry once if a navigation destroyed the context (e.g. SW).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForFunction(
        () => typeof window.__inboxPure === 'object' && window.__inboxPure && typeof window.__inboxPure.mergeRemoteIntoLocal === 'function',
        null,
        { timeout: 20000 }
      );
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  }

  await page.evaluate(async () => {
    if (typeof window.__runFullSelfTests === 'function') return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'self-tests.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load self-tests.js'));
      document.head.appendChild(s);
    });
  });

  await page.waitForFunction(
    () => typeof window.runInboxSelfTests === 'function' && typeof window.__runFullSelfTests === 'function',
    null,
    { timeout: 10000 }
  );
}

function resolveChromiumExecutable() {
  // Prefer explicit env (CI/local override), then common Playwright cache builds.
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const home = process.env.HOME || '';
  const candidates = [
    path.join(home, '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'),
    path.join(home, '.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* continue */ }
  }
  return undefined; // let Playwright use its default install
}

async function main() {
  const { server, port } = await startStaticServer();
  const base = `http://127.0.0.1:${port}`;
  let browser;
  const pageErrors = [];

  try {
    const executablePath = resolveChromiumExecutable();
    const launchOpts = {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    };
    if (executablePath) {
      launchOpts.executablePath = executablePath;
      console.log('[selftests] using Chromium at', executablePath);
    }
    browser = await chromium.launch(launchOpts);
    const context = await browser.newContext();
    // Block service worker registration paths (defense in depth; app also skips SW on ?selftest).
    await context.route('**/sw.js', (route) => route.abort());
    await context.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          get() { return undefined; },
        });
      } catch { /* ignore */ }
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Ignore extension noise; keep real failures
        const t = msg.text();
        if (/Failed to load resource|favicon/i.test(t)) return;
        pageErrors.push(t);
      }
    });

    await page.goto(`${base}/index.html?selftest`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await ensureSelfTestsLoaded(page);

    const result = await page.evaluate(async () => {
      const out = await window.runInboxSelfTests();
      return out || window._lastSelfTestResults || { passed: 0, failed: 1, results: [{ name: 'runner', ok: false, error: 'no results' }] };
    });

    if (!result || typeof result.failed !== 'number') {
      throw new Error('Self-tests did not return a result object');
    }

    console.log(`[selftests] ${result.passed} passed, ${result.failed} failed`);
    if (result.results) {
      result.results.forEach((r) => {
        const mark = r.ok ? '✓' : '✗';
        console.log(`  ${mark} ${r.name}${r.ok ? '' : ': ' + (r.error || '')}`);
      });
    }

    if (result.failed > 0) {
      process.exitCode = 1;
      console.error('[selftests] FAILED');
    } else {
      console.log('[selftests] OK — full browser matrix green (R9 gate)');
    }

    // Syntax/runtime page errors are also a failure (e.g. duplicate const).
    // Ignore known-noise: Google GIS (not loaded in CI), CSP frame-ancestors via <meta> (harmless).
    const fatalPage = pageErrors.filter(
      (e) => !/google|accounts\.google|gsi|frame-ancestors|Content Security Policy/i.test(e)
    );
    if (fatalPage.length) {
      console.error('[selftests] page errors:');
      fatalPage.forEach((e) => console.error('  ', e));
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error('[selftests] runner error:', err);
  process.exit(1);
});
