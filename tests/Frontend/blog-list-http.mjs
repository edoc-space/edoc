import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareBlogListFixture } from './blog-list-fixture.mjs';

const theme = process.argv[2] || 'default';
const nginx = process.env.EDOC_NGINX === '1';
const { site, config } = prepareBlogListFixture(theme);
const clockFile = nginx ? '/app/blog-clock.txt' : '/evidence/blog-clock.txt';
const clock = (time) => writeFileSync(clockFile, time);
clock('2026-11-12T12:00:00Z');
if (nginx) {
  if (!existsSync('/app/public')) symlinkSync(resolve('public'), '/app/public');
  writeFileSync('/app/blog-test-prepend.php', readFileSync('tests/Support/blog-fpm-prepend.php'));
  writeFileSync('public/.user.ini', 'auto_prepend_file=/app/blog-test-prepend.php\n');
}
const build = spawnSync('yarn', ['build'], { encoding: 'utf8', env: process.env });
writeFileSync('/evidence/list-build.log', build.stdout + build.stderr);
assert.equal(build.status, 0, build.stdout + build.stderr);
const activeBytes = readFileSync('local/build/blog/active.json', 'utf8');
const active = JSON.parse(activeBytes);
const server = nginx ? null : spawn('php', ['-S', '127.0.0.1:8080', '-t', 'public', 'tests/Support/blog-http-router.php'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server?.stdout.on('data', (bytes) => { serverLog += bytes; });
server?.stderr.on('data', (bytes) => { serverLog += bytes; });
const base = nginx ? 'http://nginx' : 'http://127.0.0.1:8080';
const requests = [];
const parse = (html) => JSON.parse(html.match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)[1]);
async function request(path, status = 200, method = 'GET', headers = {}) {
  const response = await fetch(base + path, { method, headers });
  const body = await response.text();
  requests.push({ path, method, status: response.status, cache: response.headers.get('cache-control') });
  if (response.status !== status) writeFileSync('/evidence/list-failure.html', body);
  assert.equal(response.status, status, `${method} ${path}: ${body.slice(0, 3000)}\n${serverLog}`);
  assert.equal(response.headers.get('cache-control'), 'no-store', path);
  assert.equal(response.headers.get('etag'), null);
  assert(!/SECRET_|bodyDigest|siteRoot/.test(body), `Hidden metadata in ${path}`);
  if (method === 'HEAD') { assert.equal(body, ''); return; }
  const props = parse(body).props;
  assert(!JSON.stringify(props.blog ?? {}).includes('hidden-only'), `Hidden facet in ${path}`);
  return { html: body, props };
}
const rows = JSON.parse(readFileSync('tests/Fixtures/blog-list.json'));
try {
  if (server) for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/blog'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const seen = [];
  for (const [page, count] of [[1, 5], [2, 5], [3, 3]]) {
    const { html, props } = await request('/blog' + (page === 1 ? '' : `?page=${page}`));
    assert.equal(props.blog.articles.length, count);
    assert.equal(props.blog.total, 13);
    seen.push(...props.blog.articles.map((a) => a.slug));
    const canonical = base + '/blog' + (page === 1 ? '' : `?page=${page}`);
    assert.equal(props.meta.canonical, canonical);
    assert(html.includes(`rel="canonical" href="${canonical}"`));
    assert(html.includes(`property="og:url" content="${canonical}"`));
    assert(!html.includes('application/rss+xml'));
    assert.equal(props.meta.alternates.some((a) => a.locale === 'en'), page === 1);
  }
  assert.deepEqual(seen, rows.map((r) => r[0]));
  assert.equal(new Set(seen).size, 13);
  for (const [path, total] of [['/blog/tags/php', 8], ['/blog/archive/2026', 8], ['/blog/tags/php?year=2026', 6], ['/blog/tags/php?year=2026&page=2', 6], ['/blog/tags/%D0%B7%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B8?year=2026', 0]]) {
    const { html, props } = await request(path);
    assert.equal(props.blog.total, total, path);
    assert.equal(props.blog.articles.length, path.includes('page=2') ? 1 : Math.min(5, total));
    assert.equal(html.includes('name="robots" content="noindex,follow"'), path.includes('year='));
  }
  const combined = (await request('/blog/tags/php?year=2026&page=2')).props;
  assert.equal(combined.blog.pagination.previous, '/blog/tags/php?year=2026');
  assert.equal(combined.blog.tags.find((t) => t.value === 'php').count, 6);
  assert.equal(combined.blog.years.find((y) => y.value === 2026).count, 6);
  assert(combined.blog.tags.every((t) => !t.href.includes('page=')));
  assert(combined.blog.years.every((y) => !y.href.includes('page=')));
  const first = (await request('/blog?page=1&unused=ignored')).props;
  assert.equal(first.meta.canonical, base + '/blog');
  assert.equal(first.meta.image, base + '/storage/edoc/static/blog-list-cover.svg');
  assert.equal((await request('/blog?year=2026')).props.meta.canonical, base + '/blog/archive/2026');
  const english = (await request('/en/blog')).props;
  assert.deepEqual(english.blog.articles.map((a) => a.slug), ['p01', 'en-only', 'p04']);
  const article = await request('/blog/p01');
  for (const marker of ['<html lang="ru">', 'property="og:type" content="article"', 'property="article:published_time"', 'property="og:image"', 'hreflang="en"', 'name="description"']) assert(article.html.includes(marker), marker);
  assert(!(await request('/blog/p02')).html.includes('hreflang="en"'));
  for (const path of ['?page=0', '?page=-1', '?page=text', '?page=1.1', '?page=', '?page[]=2', '?page[x]=2', '?year[]=2026', '?year=0000', '?year=202', '?year=2026x', '/archive/nope', '/archive/0000', '/tags/php?year=' ]) await request('/blog' + path, 400);
  for (const path of ['?page=4', '?page=999999999999999999999999999999999999', '?page=' + '9'.repeat(1000), '/tags/unknown', '/archive/2024', '/tags/hidden-only', '/tags/php?page=3', '/tags/php/extra']) await request('/blog' + path, 404);
  await request('/blog?' + Array.from({ length: 500 }, (_, i) => `page[${i}]=2`).join('&'), 400);
  const hugePath = '/blog?' + Array.from({ length: 1200 }, (_, i) => `page[${i}]=2`).join('&');
  if (nginx) {
    const response = await fetch(base + hugePath);
    const body = await response.text();
    assert.equal(response.status, 414);
    assert(!/SECRET_|bodyDigest|siteRoot/.test(body));
    requests.push({ path: '1200 array elements (transport limit)', method: 'GET', status: response.status });
  }
  await request('/blog/tags/%F0%9F%98%80', 404);
  await request('/blog/tags/%252e%252e', 404);
  await request('/blog/tags/php?year=2026&page=2', 200, 'HEAD');
  await request('/blog?page=0', 400, 'HEAD');
  await request('/blog?page=4', 404, 'HEAD');
  const spoof = (await request('/blog?page=2', 200, 'GET', { 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'https' })).props;
  assert.equal(spoof.meta.canonical, base + '/blog?page=2');
  writeFileSync(resolve(site, 'site.json'), JSON.stringify({ ...config, timezone: 'Europe/Amsterdam' }));
  assert.equal((await request('/blog/archive/2026')).props.blog.total, 9);
  writeFileSync(resolve(site, 'site.json'), JSON.stringify(config));
  // Same build, warmed metadata paths, fresh clock/policy on every request.
  for (const instant of ['2026-11-13T11:59:59Z', '2026-11-13T12:00:00Z', '2026-11-13T12:00:01Z']) {
    clock(instant);
    const expected = instant.endsWith('11:59:59Z') ? 13 : 15;
    const response = await fetch(base + '/blog');
    assert.equal(response.status, 200);
    const props = parse(await response.text()).props;
    assert.equal(props.blog.total, expected);
    assert.equal(props.blog.tags.some((t) => t.value === 'hidden-only'), expected === 15);
  }
  for (const mutation of [(text) => text.replace('draft: false', 'draft: true'), (text) => text.replace('2026-11-13', '2027-11-13')]) {
    const originals = [];
    for (const [slug, format] of [['f01', 'md'], ['f02', 'mdx']]) {
      const file = resolve(site, `ru/blog/${slug}.${format}`); const text = readFileSync(file, 'utf8'); originals.push([file, text]); writeFileSync(file, mutation(text));
    }
    assert.equal((await request('/blog')).props.blog.total, 13);
    await request('/blog/tags/hidden-only', 404);
    for (const [file, text] of originals) writeFileSync(file, text);
  }
  assert.equal(readFileSync('local/build/blog/active.json', 'utf8'), activeBytes);
  clock('2026-11-12T12:00:00Z');
  mkdirSync('/evidence', { recursive: true });
  writeFileSync('/evidence/list-http.json', JSON.stringify({ theme, base, generation: active.generation, requests, pages: seen, passed: true }, null, 2));
  console.log(`List HTTP passed: ${requests.length} requests, ${theme}, ${base}`);
  if (process.env.EDOC_KEEP_SERVER === '1') await new Promise((r) => process.on('SIGTERM', r));
} finally {
  writeFileSync('/evidence/list-requests.json', JSON.stringify(requests, null, 2));
  writeFileSync('/evidence/list-server.log', serverLog);
  server?.kill('SIGTERM');
}
