import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareBlogListFixture } from './blog-list-fixture.mjs';

/** Extends I3's exact RU13/EN3 data; only the disposable /app is written. */
export function prepareRssFixture(theme = 'default') {
  const fixture = prepareBlogListFixture(theme);
  for (const locale of ['ru', 'en']) {
    const content = `---\ntitle: Latest articles fixture\nlatest_articles:\n  limit: 3\n---\n## Public summaries\n`;
    writeFileSync(resolve(fixture.site, `${locale}/pages/latest.md`), content);
    const home = resolve(fixture.site, `${locale}/pages/index.${locale === 'en' ? 'md' : 'mdx'}`);
    writeFileSync(home, readFileSync(home, 'utf8').replace(/^---\n/, '---\nlatest_articles:\n  limit: 2\n'));
  }
  return fixture;
}

export async function verifyRssHttp({ base, site, clockFile, requests = [] }) {
  const clock = (instant) => writeFileSync(clockFile, instant);
  const parsePage = (html) => JSON.parse(html.match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)[1]).props;
  const configPath = resolve(site, 'site.json');
  const futurePath = resolve(site, 'ru/blog/f02.mdx');
  const originalConfig = readFileSync(configPath, 'utf8');
  const originalFuture = readFileSync(futurePath, 'utf8');
  const generation = readFileSync('local/build/blog/active.json', 'utf8');
  const hidden = /SECRET_|bodyDigest|private descriptor|source_path/;
  async function get(path, expected = 200, method = 'GET', conditional = false) {
    const response = await fetch(base + path, { method, headers: conditional ? { 'If-None-Match': 'anything', 'If-Modified-Since': 'Wed, 01 Jan 2031 00:00:00 GMT' } : {} });
    const body = await response.text();
    requests.push({ path, status: response.status, method, mediaType: response.headers.get('content-type') });
    assert.equal(response.status, expected, `${path}: ${body.slice(0, 1000)}`);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
    assert.equal(response.headers.get('etag'), null, path);
    assert.equal(response.headers.get('last-modified'), null, path);
    if (method === 'HEAD') assert.equal(body, '');
    return { body, response };
  }
  function xmlData(xml) {
    const run = spawnSync('php', ['-r', '$x=simplexml_load_string(stream_get_contents(STDIN));if($x===false){exit(1);} $items=[];foreach($x->channel->item as $i){$items[]=["title"=>(string)$i->title,"href"=>(string)$i->link,"guid"=>(string)$i->guid,"description"=>(string)$i->description];}echo json_encode(["language"=>(string)$x->channel->language,"items"=>$items],JSON_THROW_ON_ERROR);'], { input: xml, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  }
  async function snapshot(locale = '', count = 13) {
    const { body: xml, response } = await get(`${locale}/blog/rss.xml`);
    assert.match(response.headers.get('content-type'), /^application\/rss\+xml; charset=UTF-8$/);
    assert(!hidden.test(xml));
    const feed = xmlData(xml);
    assert.equal(feed.language, locale ? 'en' : 'ru');
    assert.equal(feed.items.length, count);
    const list = parsePage((await get(`${locale}/blog`)).body).blog;
    assert.equal(list.total, count);
    assert.deepEqual(feed.items.slice(0, 5).map((a) => new URL(a.href).pathname), list.articles.map((a) => a.href));
    for (const item of feed.items) {
      assert.equal(item.guid, item.href);
      assert.equal(new URL(item.href).origin, base);
      assert(!item.description.includes('BODY'));
    }
    const { body: html } = await get(`${locale}/latest`);
    const latest = parsePage(html).latestArticles;
    assert(latest.enabled);
    assert.deepEqual(latest.items.map((a) => a.href), list.articles.slice(0, 3).map((a) => a.href));
    assert(!hidden.test(JSON.stringify(latest)));
    assert(latest.items.every((a) => !('body' in a) && !('descriptor' in a)));
    const home = parsePage((await get(locale || '/')).body).latestArticles;
    assert.deepEqual(home.items.map((a) => a.href), list.articles.slice(0, 2).map((a) => a.href));
    assert.match((await get(`${locale}/blog`)).body, new RegExp(`<link rel="alternate" type="application/rss\\+xml" title="RSS" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${locale}/blog/rss.xml">`));
    return feed;
  }
  try {
    clock('2026-11-12T12:00:00Z');
    const initial = await snapshot();
    await snapshot('/en', 3);
    await get('/blog/rss.xml', 200, 'HEAD');
    await get('/en/blog/rss.xml', 200, 'GET', true);
    const articleHtml = (await get('/blog/p04')).body;
    assert(articleHtml.includes('type="application/rss+xml"'));
    writeFileSync('/evidence/rss-initial.xml', (await get('/blog/rss.xml')).body);
    writeFileSync('/evidence/rss-head.html', articleHtml);
    // I3's f02 fixture is the existing scheduled MDX record, not a new generator.
    const scheduled = originalFuture.match(/^date:\s*['"]?([^'"\n]+)['"]?$/m)[1];
    const instant = new Date(scheduled).getTime();
    for (const [offset, count] of [[-1000, 13], [0, 15], [1000, 15]]) {
      clock(new Date(instant + offset).toISOString());
      await snapshot('', count);
    }
    writeFileSync(futurePath, originalFuture.replace(/^draft:.*$/m, 'draft: true'));
    await snapshot('', 14);
    writeFileSync(futurePath, originalFuture.replace(/^date:.*$/m, "date: '2035-01-01T00:00:00Z'"));
    await snapshot('', 14);
    writeFileSync(futurePath, originalFuture);
    const restored = await snapshot('', 15);
    for (const item of initial.items) assert(restored.items.some((a) => a.guid === item.guid));
    const englishPaths = ['p01.md', 'p04.mdx', 'en-only.md'].map((name) => resolve(site, 'en/blog', name));
    const englishOriginal = englishPaths.map((path) => readFileSync(path, 'utf8'));
    try {
      englishPaths.forEach((path, index) => writeFileSync(path, englishOriginal[index].replace(/^---\n/, '---\ndraft: true\n').replace(/\ndraft: false\n/g, '\n')));
      await snapshot('/en', 0);
    } finally { englishPaths.forEach((path, index) => writeFileSync(path, englishOriginal[index])); }
    const config = JSON.parse(originalConfig);
    config.blog.enabled = false;
    writeFileSync(configPath, JSON.stringify(config));
    await get('/blog/rss.xml', 404);
    const disabled = parsePage((await get('/latest')).body).latestArticles;
    assert.deepEqual(disabled, { enabled: false, items: [] });
    writeFileSync(configPath, originalConfig);
    assert.equal(readFileSync('local/build/blog/active.json', 'utf8'), generation, 'No rebuild during publication checks');
    writeFileSync('/evidence/rss-http.json', JSON.stringify({ requests, generationUnchanged: true }, null, 2));
    console.log(`RSS/latest HTTP: ${requests.length} requests passed`);
  } finally {
    writeFileSync(futurePath, originalFuture);
    writeFileSync(configPath, originalConfig);
    clock('2026-11-12T12:00:00Z');
  }
}

if (process.argv[1]?.endsWith('/blog-rss-http.mjs')) {
  const theme = process.argv[2] || 'default';
  const fixture = prepareRssFixture(theme);
  const nginx = process.env.EDOC_NGINX === '1';
  const clockFile = nginx ? '/app/blog-clock.txt' : '/evidence/blog-clock.txt';
  writeFileSync(clockFile, '2026-11-12T12:00:00Z');
  if (nginx) {
    if (!existsSync('/app/public')) symlinkSync(resolve('public'), '/app/public');
    writeFileSync('/app/blog-test-prepend.php', readFileSync('tests/Support/blog-fpm-prepend.php'));
    writeFileSync('public/.user.ini', 'auto_prepend_file=/app/blog-test-prepend.php\n');
  }
  const build = spawnSync('yarn', ['build'], { encoding: 'utf8', env: process.env });
  writeFileSync('/evidence/rss-build.log', build.stdout + build.stderr);
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const server = nginx ? null : spawn('php', ['-S', '127.0.0.1:8080', '-t', 'public', 'tests/Support/blog-http-router.php'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server?.stdout.on('data', (chunk) => { serverLog += chunk; });
  server?.stderr.on('data', (chunk) => { serverLog += chunk; });
  const base = nginx ? 'http://nginx' : 'http://127.0.0.1:8080';
  try {
    for (let attempt = 0; server && attempt < 50; attempt++) {
      try { await fetch(base + '/blog'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    await verifyRssHttp({ base, site: fixture.site, clockFile });
  } finally {
    server?.kill();
    writeFileSync('/evidence/rss-server.log', serverLog);
  }
}
