import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { prepareBlogFixture } from './blog-fixture.mjs';
const { site, config } = prepareBlogFixture();
writeFileSync(resolve(site, 'site.json'), JSON.stringify({ ...config, blog: { enabled: false } }));
writeFileSync(resolve(site, 'ru/pages/blog.md'), '---\ntitle: Ordinary blog page\n---\nORDINARY_BLOG_PAGE');
const build = spawnSync('yarn', ['build'], { encoding: 'utf8' });
writeFileSync('/evidence/disabled-build.log', build.stdout + build.stderr);
assert.equal(build.status, 0, build.stdout + build.stderr);
assert.deepEqual(JSON.parse(readFileSync('local/build/blog/active.json')).articles, {});
const path = '/blog/_modules/' + 'a'.repeat(32) + '/' + 'b'.repeat(32) + '/entry.js';
mkdirSync(dirname('public' + path), { recursive: true });
writeFileSync('public' + path, 'STATIC_BYPASS');
writeFileSync('/evidence/blog-clock.txt', '2026-11-13T12:00:00Z');
const server = spawn('php', ['-S', '127.0.0.1:8080', '-t', 'public', 'tests/Support/blog-http-router.php'], { env: { ...process.env, APP_ENV: 'prod', APP_DEBUG: '0', VITE_DEV_SERVER: '' }, stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:8080'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const response = await fetch('http://127.0.0.1:8080/blog');
  const html = await response.text();
  assert.equal(response.status, 200, html);
  assert(html.includes('ORDINARY_BLOG_PAGE') && html.includes('Web/Page/Show'));
  for (const method of ['GET', 'HEAD']) {
    const denied = await fetch('http://127.0.0.1:8080' + path, { method });
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get('cache-control'), 'no-store');
    assert(!(await denied.text()).includes('STATIC_BYPASS'));
  }
  writeFileSync('/evidence/blog-disabled.json', JSON.stringify({ ordinaryPage: 200, modulesGet: 404, modulesHead: 404, physicalPublicBypass: false }));
} finally { server.kill('SIGTERM'); }
