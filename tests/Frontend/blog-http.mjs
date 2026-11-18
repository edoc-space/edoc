import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { prepareBlogFixture } from './blog-fixture.mjs';

const theme = process.argv[2] || 'default';
const { site, config } = prepareBlogFixture(theme);
const clock = (time) => writeFileSync('/evidence/blog-clock.txt', time);
clock('2026-11-13T11:59:59Z');
const result = spawnSync('yarn', ['build'], { encoding: 'utf8', env: process.env });
writeFileSync('/evidence/blog-build.log', result.stdout + result.stderr);
assert.equal(result.status, 0, result.stdout + result.stderr);
const active = JSON.parse(readFileSync('local/build/blog/active.json'));
const stable = readFileSync('local/build/blog/active.json', 'utf8');
const allFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? allFiles(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
for (const file of allFiles('public/build')) {
  let bytes = readFileSync(file);
  if (file.endsWith('.gz')) bytes = gunzipSync(bytes);
  if (file.endsWith('.br')) bytes = brotliDecompressSync(bytes);
  assert(!/SECRET_(?:f0[12]|d0[12])_|PRIVATE_MARKDOWN_ATTACHMENT/.test(bytes.toString()), `private leak ${file}`);
  assert(!/sourceMappingURL=data:/.test(bytes.toString()), `inline sourcemap ${file}`);
}
const server = spawn('php', ['-S', '127.0.0.1:8080', '-t', 'public', 'tests/Support/blog-http-router.php'], { env: { ...process.env, APP_ENV: 'prod', APP_DEBUG: '0', VITE_DEV_SERVER: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (data) => { serverLog += data; });
server.stderr.on('data', (data) => { serverLog += data; });
const base = 'http://127.0.0.1:8080';
const report = [];
async function request(path, status, method = 'GET', protectedResponse = true) {
  const response = await fetch(base + path, { method, headers: { 'If-None-Match': 'old', 'If-Modified-Since': 'Thu, 01 Jan 2099 00:00:00 GMT', Range: 'bytes=0-1' } });
  const body = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${body}\n${serverLog}`);
  if (protectedResponse) {
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
    assert.equal(response.headers.get('etag'), null);
  }
  if (method === 'HEAD') assert.equal(body, '');
  report.push({ method, path, status });
  return body;
}
const parse = (html) => JSON.parse(html.match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const entryBySlug = (slug) => Object.entries(active.articles).find(([, entry]) => entry.slug === slug && entry.locale === 'ru');
const paths = (slug) => { const [key, entry] = entryBySlug(slug); return Object.keys(entry.files).map((file) => `${entry.prefix}/${active.generation}/${key}/${file}`); };
const edit = (slug, transform) => { const [, entry] = entryBySlug(slug); const file = resolve(site, entry.source); const original = readFileSync(file, 'utf8'); writeFileSync(file, transform(original)); return () => writeFileSync(file, original); };
try {
  for (let i = 0; i < 50; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  for (const path of ['/blog', '/blog/p01', '/blog/p04', '/en/blog', '/en/blog/p04']) await request(path, 200);
  const plain = resolve(site, 'ru/blog/plain.md');
  writeFileSync(plain, "---\ntitle: Plain article\ndescription: Plain without build\ndate: '2026-01-01'\n---\nPLAIN_NO_BUILD");
  assert((await request('/blog/plain', 200)).includes('PLAIN_NO_BUILD'));
  rmSync(plain);
  const englishError = parse(await request('/en/blog/missing', 404));
  assert.equal(englishError.props.meta.language, 'en');
  const html = await request('/blog/p04', 200);
  assert(html.includes('property="og:type" content="article"') && html.includes('article:published_time'));
  assert(html.includes('rel="canonical"') && html.includes('hreflang="en"'));
  const markdown = parse(await request('/blog/p01', 200));
  assert(markdown.props.blog.document.html.includes('/blog/_modules/'));
  assert(markdown.props.blog.document.html.includes('/blog/p04'));
  assert(markdown.props.blog.document.html.includes('/about'));
  const list = parse(await request('/blog', 200));
  assert.equal(list.props.blog.articles.length, 2);
  assert(!JSON.stringify(list).includes('SECRET_'));
  const article = parse(html);
  assert(article.props.blog.document.descriptor.entry.startsWith('/blog/_modules/'));
  for (const slug of ['d01', 'd02', 'f01', 'f02']) {
    const hidden = await request('/blog/' + slug, 404);
    assert.equal(parse(hidden).props.meta.language, 'ru');
    assert(!hidden.includes('SECRET_') && !hidden.includes('description:'));
    for (const path of paths(slug)) for (const method of ['GET', 'HEAD']) await request(path, 404, method);
  }
  for (const time of ['2026-11-13T12:00:00Z', '2026-11-13T12:00:01Z']) {
    clock(time);
    for (const slug of ['f01', 'f02']) {
      await request('/blog/' + slug, 200);
      for (const path of paths(slug)) for (const method of ['GET', 'HEAD']) await request(path, 200, method);
    }
    assert.equal(parse(await request('/blog', 200)).props.blog.articles.length, 4);
  }
  for (const mutation of [(text) => text.replace('draft: false', 'draft: true'), (text) => text.replace('2026-11-13T12:00:00Z', '2027-11-13T12:00:00Z')]) {
    const undo = edit('f02', mutation);
    await request('/blog/f02', 404);
    for (const path of paths('f02')) await request(path, 404);
    undo();
    await request('/blog/f02', 200);
  }
  const undoBody = edit('f02', (text) => text + '\nNEW_BODY');
  await request('/blog/f02', 503);
  for (const path of paths('f02')) await request(path, 404);
  undoBody();
  await request('/blog/f02', 200);
  const helper = resolve(site, 'ru/blog/f02/helper.js');
  const helperBody = readFileSync(helper);
  writeFileSync(helper, "export const value = 'CHANGED';");
  await request('/blog/f02', 503);
  for (const path of paths('f02')) await request(path, 404);
  writeFileSync(helper, helperBody);
  await request('/blog/f02', 200);
  const [key, entry] = entryBySlug('f02');
  const output = resolve('local/build/blog', active.generation, key, 'entry.js');
  const outputBytes = readFileSync(output);
  writeFileSync(output, 'CORRUPT');
  await request(paths('f02').find((path) => path.endsWith('/entry.js')), 404);
  writeFileSync(output, outputBytes);
  for (const path of ['/blog/_modules/active.json', paths('f02')[0].replace(active.generation, '0'.repeat(32)), paths('f02')[0] + '.map']) await request(path, 404);
  const rawPublic = resolve('public', paths('d02')[0].slice(1));
  mkdirSync(dirname(rawPublic), { recursive: true }); writeFileSync(rawPublic, 'PUBLIC_BYPASS_MARKER');
  await request(paths('d02')[0], 404);
  await request('/blog/p04', 200);
  // Old runtime cannot load a graph built against another ABI.
  const runtimeFile = 'public/build/blog-runtime.json';
  const runtime = readFileSync(runtimeFile);
  writeFileSync(runtimeFile, '{"abi":"other"}');
  await request('/blog/p04', 503);
  for (const path of paths('p04')) await request(path, 404);
  writeFileSync(runtimeFile, runtime);
  await request('/blog/p04', 200);
  // Cache clearing cannot prune private outputs.
  rmSync('local/cache', { recursive: true, force: true });
  await request('/blog/p04', 200);
  assert.equal(readFileSync('local/build/blog/active.json', 'utf8'), stable);
  // Disabled mode retains the page contract and permanently denies module files.
  writeFileSync(resolve(site, 'site.json'), JSON.stringify({ ...config, blog: { enabled: false } }));
  await request('/blog', 404, 'GET', false);
  for (const path of paths('p04')) await request(path, 404);
  writeFileSync(resolve(site, 'site.json'), JSON.stringify(config));
  await request('/docs/specimen', 200, 'GET', false);
  // Leave data at T−1 for the browser scenario in the same container command.
  clock('2026-11-13T11:59:59Z');
  writeFileSync('/evidence/blog-http.json', JSON.stringify({ theme, generation: active.generation, abi: active.abi, requests: report, publicLeakScan: true }, null, 2));
  if (process.env.EDOC_KEEP_SERVER === '1') {
    console.log('HTTP tests passed; browser server ready');
    await new Promise((resolve) => process.on('SIGTERM', resolve));
  }
} finally {
  writeFileSync('/evidence/blog-server.log', serverLog);
  writeFileSync('/evidence/blog-http-requests.json', JSON.stringify(report, null, 2));
  server.kill('SIGTERM');
}
