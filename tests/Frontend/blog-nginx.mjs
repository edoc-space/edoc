import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { prepareBlogLinkFixture } from './blog-links-fixture.mjs';

// This is an HTTP integration test, not a browser harness. nginx and FPM are the
// owner's separate read-only services; only the command can mutate the snapshot.
assert(process.cwd().startsWith('/app/'), 'Disposable workspace runtime required');
const theme = process.argv[2] || 'default';
const base = 'http://nginx';
const { site, config } = prepareBlogLinkFixture(theme);
if (!existsSync('/app/public')) symlinkSync(resolve('public'), '/app/public');
for (const prefix of ['', '/en']) mkdirSync(resolve('public' + prefix + '/blog/_modules'), { recursive: true });
writeFileSync('public/ordinary-nginx.txt', 'PUBLIC_STATIC_OK');
writeFileSync('/app/blog-test-prepend.php', readFileSync('tests/Support/blog-fpm-prepend.php'));
writeFileSync('public/.user.ini', 'auto_prepend_file=/app/blog-test-prepend.php\n');
const clock = (instant) => writeFileSync('/app/blog-clock.txt', instant);
clock('2026-11-13T11:59:59Z');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const indexHash = hash(readFileSync('public/index.php'));
const build = () => {
  const result = spawnSync('yarn', ['build'], { encoding: 'utf8', env: { ...process.env, APP_ENV: 'prod', APP_DEBUG: '0', APP_PROFILER: '0', APP_DOCUMENTATION_CACHE: '0', VITE_DEV_SERVER: '' } });
  writeFileSync(`/evidence/nginx-${theme}-build-${builds++}.log`, result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
};
let builds = 0;
build();
const activeBytes = readFileSync('local/build/blog/active.json');
const active = JSON.parse(activeBytes);
const entries = Object.entries(active.articles).map(([key, entry]) => ({ key, ...entry }));
const entryFor = (slug, locale = 'ru') => entries.find((entry) => entry.slug === slug && entry.locale === locale);
const filePath = (entry, file) => `${entry.prefix}/${active.generation}/${entry.key}/${file}`;
const outputs = (entry) => Object.keys(entry.files).map((file) => ({ file, url: filePath(entry, file), ...entry.files[file] }));
const privateFile = (entry, file) => resolve('local/build/blog', active.generation, entry.key, file);
const hashes = () => Object.fromEntries(entries.flatMap((entry) => Object.keys(entry.files).map((file) => [`${entry.key}/${file}`, hash(readFileSync(privateFile(entry, file)))])));
const originalHashes = hashes();
const requests = [];
const states = [];
let phase = 'startup';
const parse = (html) => JSON.parse(html.match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)[1]);
async function request(path, status, method = 'GET', protectedResponse = true, file = null) {
  const response = await fetch(base + path, { method, headers: { Range: 'bytes=0-1', 'If-None-Match': '*', 'If-Modified-Since': 'Thu, 01 Jan 2099 00:00:00 GMT' } });
  const bytes = Buffer.from(await response.arrayBuffer());
  const row = { phase, path, method, status: response.status, cacheControl: response.headers.get('cache-control'), sapi: response.headers.get('x-edoc-test-sapi'), worker: response.headers.get('x-edoc-test-worker'), bytes: bytes.length };
  requests.push(row);
  if (response.status !== status) writeFileSync('/evidence/nginx-failure-body.html', bytes);
  assert.equal(response.status, status, `${phase} ${method} ${path}: ${bytes.toString().slice(0, 4000)}`);
  if (protectedResponse) {
    assert(row.cacheControl?.includes('no-store'), JSON.stringify(row));
    assert.equal(row.sapi, 'fpm-fcgi', JSON.stringify(row));
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('last-modified'), null);
  }
  if (method === 'HEAD') assert.equal(bytes.length, 0, JSON.stringify(row));
  assert(!bytes.includes(Buffer.from('BYPASS_PUBLIC_ONLY')), 'nginx served the public bypass marker');
  if (status === 200 && file) {
    assert.equal(response.headers.get('content-type')?.split(';')[0].trim(), file.mime);
    if (method === 'GET') { assert.equal(bytes.length, file.size); assert.equal(hash(bytes), file.hash); }
    assert.equal(response.headers.get('accept-ranges'), 'none');
  }
  return bytes.toString();
}
async function checkFiles(entry, status) {
  for (const file of outputs(entry)) for (const method of ['GET', 'HEAD']) await request(file.url, status, method, true, file);
}
async function sourceAndLinks(prefix = '') {
  const html = await request(prefix + '/blog/p01', 200);
  const page = parse(html);
  const document = page.props.blog.document.html;
  assert(document.includes('BLOG_MARKDOWN_PARITY'));
  assert(document.includes(`href="${prefix}/blog/f02"`));
  assert(document.includes(`href="${prefix}/blog/d02"`));
  for (const marker of ['SECRET_f02', 'SECRET_d02', 'HIDDEN_f02', 'HIDDEN_d02']) assert(!html.includes(marker), marker);
  for (const fragment of ['#review-fragment', '#inline-fragment', '#review%20encoded', '#page=2']) assert(document.includes(fragment), fragment);
  const urls = [...document.matchAll(/(?:src|href)="([^"]*\/blog\/_modules\/[^"#]+)(#[^"]*)?"/g)];
  assert.equal(urls.length, 5);
  assert.deepEqual(urls.map((match) => match[2]).sort(), ['#review-fragment', '#inline-fragment', '#review%20encoded', '#page=2', '#page=2'].sort());
  for (const [, url, fragment] of urls) {
    assert(fragment && !fragment.slice(1).includes('#'), 'fragment must appear once');
    await request(url, 200);
  }
  return page;
}
const edit = (entry, change) => {
  const path = resolve(site, entry.source);
  const original = readFileSync(path, 'utf8');
  writeFileSync(path, change(original));
  return () => writeFileSync(path, original);
};
async function targetState(visible) {
  for (const locale of ['ru', 'en']) {
    const prefix = locale === 'ru' ? '' : '/en';
    await sourceAndLinks(prefix);
    const list = parse(await request(prefix + '/blog', 200));
    assert.equal(list.props.blog.articles.length, visible ? 4 : 2);
    for (const slug of ['f01', 'f02', 'd01', 'd02']) {
      const allowed = visible && slug.startsWith('f');
      const html = await request(prefix + '/blog/' + slug, allowed ? 200 : 404);
      if (!allowed) assert(!/SECRET_|HIDDEN_/.test(html));
      await request(prefix + '/blog/' + slug, allowed ? 200 : 404, 'HEAD');
      await checkFiles(entryFor(slug, locale), allowed ? 200 : 404);
    }
  }
  states.push({ phase, generation: JSON.parse(readFileSync('local/build/blog/active.json')).generation, builds });
}
try {
  const runtime = JSON.parse(await (await fetch(base + '/__blog_transport')).text());
  assert.equal(runtime.sapi, 'fpm-fcgi'); assert.equal(runtime.php, '8.5.12');
  assert(runtime.privateReadable && !runtime.privateWritable);
  for (const entry of entries) for (const file of outputs(entry)) {
    const path = resolve('public', file.url.slice(1)); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'BYPASS_PUBLIC_ONLY');
  }
  for (const locale of ['ru', 'en']) {
    const entry = entryFor('p04', locale);
    const compiled = readFileSync(privateFile(entry, 'entry.js'), 'utf8');
    for (const fragment of ['#review-fragment', '#inline-fragment', '#review%20encoded', '#page=2']) assert(compiled.includes(fragment), fragment);
    for (const slug of ['f02', 'd02']) assert(outputs(entryFor(slug, locale)).some((file) => file.url.includes('/chunks/lazy-')), 'retained lazy output required');
  }
  phase = 'T-minus-1'; await targetState(false);
  phase = 'T'; clock('2026-11-13T12:00:00Z'); await targetState(true);
  phase = 'T-plus-1'; clock('2026-11-13T12:00:01Z'); await targetState(true);
  const revokeAll = (change) => entries.filter((entry) => ['f01', 'f02'].includes(entry.slug)).map((entry) => edit(entry, change));
  phase = 'draft-revoked'; const draftUndo = revokeAll((text) => text.replace('draft: false', 'draft: true')); await targetState(false); draftUndo.forEach((undo) => undo());
  phase = 'date-postponed'; const dateUndo = revokeAll((text) => text.replace('2026-11-13T12:00:00Z', '2027-11-13T12:00:00Z')); await targetState(false); dateUndo.forEach((undo) => undo());
  phase = 'recovered'; await targetState(true);
  phase = 'stale-body'; const bodyUndo = edit(entryFor('f02'), (text) => text + '\nNEW_BODY');
  await sourceAndLinks(); await request('/blog/f02', 503); await checkFiles(entryFor('f02'), 404); bodyUndo();
  phase = 'stale-input'; const helper = resolve(site, 'ru/blog/f02/helper.js'); const helperBytes = readFileSync(helper); writeFileSync(helper, "export const value = 'CHANGED';");
  await request('/blog/f02', 503); await checkFiles(entryFor('f02'), 404); writeFileSync(helper, helperBytes);
  phase = 'corrupt-output'; const f = privateFile(entryFor('f02'), 'entry.js'); const bytes = readFileSync(f); writeFileSync(f, 'CORRUPT'); await request(filePath(entryFor('f02'), 'entry.js'), 404); writeFileSync(f, bytes);
  phase = 'old-abi'; const runtimePath = 'public/build/blog-runtime.json'; const runtimeBytes = readFileSync(runtimePath); writeFileSync(runtimePath, '{"abi":"old"}'); await request('/blog/f02', 503); await checkFiles(entryFor('f02'), 404); writeFileSync(runtimePath, runtimeBytes);
  phase = 'invalid-paths';
  for (const locale of ['ru', 'en']) {
    const entry = entryFor('f02', locale);
    for (const path of [entry.prefix + '/active.json', filePath(entry, 'entry.js.map'), filePath(entry, 'entry.js').replace(active.generation, '0'.repeat(32)), entry.prefix + '/' + active.generation + '/' + entry.key + '/%2e%2e%2fentry.js']) for (const method of ['GET', 'HEAD']) await request(path, 404, method);
    // URL clients normalize these dot segments out of the blog namespace.
    // The resulting non-blog route must still never expose a private file.
    const normalized = (locale === 'ru' ? '' : '/en') + '/blog/_modules/../../local/build/blog/active.json';
    assert(!(await request(normalized, 404, 'GET', false)).includes('bodyDigest'));
  }
  phase = 'metadata-cache-clear'; rmSync('local/cache', { recursive: true, force: true }); await sourceAndLinks(); await checkFiles(entryFor('f02'), 200);
  assert.deepEqual(hashes(), originalHashes); assert.equal(hash(readFileSync('local/build/blog/active.json')), hash(activeBytes)); assert.equal(builds, 1);
  phase = 'disabled-without-build'; writeFileSync(resolve(site, 'site.json'), JSON.stringify({ ...config, blog: { enabled: false } }));
  for (const entry of entries) await checkFiles(entry, 404);
  await request('/about', 200, 'GET', false); await request('/docs/specimen', 200, 'GET', false);
  // A new ordinary page is a separate page input: prepare its disabled build.
  writeFileSync(resolve(site, 'ru/pages/blog.md'), '---\ntitle: Ordinary blog page\n---\nORDINARY_BLOG_PAGE');
  phase = 'disabled-page-build'; build();
  assert(parse(await request('/blog', 200, 'GET', false)).props.page.document.html.includes('ORDINARY_BLOG_PAGE'));
  for (const entry of entries) for (const file of outputs(entry)) for (const method of ['GET', 'HEAD']) await request(file.url, 404, method);
  const staticResponse = await fetch(base + '/ordinary-nginx.txt'); assert.equal(await staticResponse.text(), 'PUBLIC_STATIC_OK'); assert.equal(staticResponse.headers.get('x-edoc-test-sapi'), null);
  const intentionalStatic = await fetch(base + '/storage/edoc/static/specimen.svg'); assert.equal(intentionalStatic.status, 200); assert.equal(intentionalStatic.headers.get('x-edoc-test-sapi'), null);
  assert.equal(indexHash, hash(readFileSync('public/index.php')));
  writeFileSync('/evidence/nginx-result.json', JSON.stringify({ passed: true, theme, runtime, states, builds, privateOutputHashes: originalHashes, generation: active.generation, abi: active.abi, requests, productionEntryUnchanged: true, publicBypassFiles: true, intentionalStatic: true }, null, 2));
  console.log(JSON.stringify({ passed: true, theme, requests: requests.length, states: states.length, generation: active.generation }));
} finally {
  writeFileSync('/evidence/nginx-requests.json', JSON.stringify(requests, null, 2));
}
