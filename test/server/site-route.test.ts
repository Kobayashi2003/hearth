import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, type HearthApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config/index.js';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-site-'));
const root = path.join(base, 'root');
let app: HearthApp;
const saved = { ...process.env };

/** A signed-in user's cookie, and the site URL Hearth gives them for `page`. */
async function siteFor(username: string, page: string) {
  const login = await app.inject({
    method: 'POST',
    url: '/hearth-api/auth/login',
    payload: { username, password: 'pw' },
  });
  const cookie = login.headers['set-cookie'] as string;
  const preview = await app.inject({
    url: `/hearth-api/html-proxy?path=${encodeURIComponent(page)}`,
    headers: { cookie },
  });
  return `/hearth-api${preview.json<{ url: string }>().url}`;
}

beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'site', 'pages'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'site', 'index.html'),
    '<frameset><frame src="pages/a.html"></frameset>',
  );
  fs.writeFileSync(path.join(root, 'site', 'pages', 'index.html'), '<p>pages</p>');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'outside the site');

  for (const key of Object.keys(process.env))
    if (key.startsWith('HEARTH_')) delete process.env[key];
  Object.assign(process.env, {
    HEARTH_ROOT_DIRECTORIES: root,
    HEARTH_DATA_DIRECTORY: path.join(base, 'data'),
    HEARTH_TEMP_DIRECTORY: path.join(base, 'temp'),
    HEARTH_USERS_FILE: path.join(base, 'data', 'users.json'),
    HEARTH_PERMISSIONS_FILE: path.join(base, 'data', 'permissions.json'),
    HEARTH_RECYCLE_BIN_DIRECTORY: path.join(base, 'data', 'trash'),
    HEARTH_CHUNK_UPLOAD_DIR: path.join(base, 'temp', 'chunks'),
    HEARTH_THUMBNAIL_CACHE_DIR: path.join(base, 'temp', 'thumbs'),
    HEARTH_COMIC_CACHE_DIR: path.join(base, 'temp', 'comics'),
    HEARTH_PSD_CACHE_DIR: path.join(base, 'temp', 'psd'),
    HEARTH_SUBTITLE_CACHE_DIR: path.join(base, 'temp', 'subtitles'),
    HEARTH_USER_RULES: 'admin:pw:ra;reader:pw:r',
    HEARTH_RATE_LIMIT_LOGIN_MAX: '0',
    HEARTH_LOG_TO_FILE: 'false',
  });
  app = await buildApp({ config: loadConfig(false), logger: pino({ level: 'silent' }) });
});

afterAll(async () => {
  await app.close();
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  fs.rmSync(base, { recursive: true, force: true });
});

describe('a folder served as a site', () => {
  it('serves the page without a sandbox while nothing in it runs', async () => {
    const response = await app.inject({ url: await siteFor('reader', 'site/index.html') });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<frame src="pages/a.html" />');
    expect(response.headers['content-security-policy']).not.toContain('sandbox');
    expect(response.headers['x-frame-options']).toBeUndefined();
  });

  it('opens a folder on its index page', async () => {
    const url = (await siteFor('reader', 'site/index.html')).replace(/index\.html$/, 'pages/');
    const response = await app.inject({ url });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('pages');
  });

  it('refuses to leave its folder, backslashes included', async () => {
    const page = await siteFor('reader', 'site/index.html');
    for (const escape of ['..%5Csecret.txt', 'pages%5C..%5C..%5Csecret.txt', '%2E%2E/secret.txt']) {
      const response = await app.inject({ url: page.replace(/index\.html$/, escape) });
      // Refused by the folder check (403), or before it when the router collapses `..` (401).
      expect([401, 403], escape).toContain(response.statusCode);
      expect(response.body, escape).not.toContain('outside the site');
    }
  });

  it('answers to the user as they are now: admin-only mode locks a reader out', async () => {
    const url = await siteFor('reader', 'site/index.html');
    app.hearth.runtime.set('adminOnly', true);
    try {
      expect((await app.inject({ url })).statusCode).toBe(403);
    } finally {
      app.hearth.runtime.set('adminOnly', null);
    }
  });

  it('runs sandboxed, with the frame helper, once scripts are allowed', async () => {
    const url = await siteFor('admin', 'site/index.html');
    app.hearth.runtime.set('htmlScripts', true);
    try {
      const response = await app.inject({ url });
      expect(response.headers['content-security-policy']).toMatch(/^sandbox allow-scripts/);
      expect(response.body).toContain('hearth-site-navigate');
    } finally {
      app.hearth.runtime.set('htmlScripts', null);
    }
  });

  it('refuses a forged token', async () => {
    const url = (await siteFor('reader', 'site/index.html')).replace(
      /\/site\/[^/]+\//,
      '/site/nope.nope/',
    );
    expect((await app.inject({ url })).statusCode).toBe(401);
  });
});
