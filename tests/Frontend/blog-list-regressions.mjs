import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, realpathSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Run after blog-list-http.mjs in its existing nginx snapshot; NO additional build.
const site = realpathSync('local/storage/edoc');
const base = 'http://nginx';
const rows = [];
const parse = html => JSON.parse(html.match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)[1]).props;
const originalFiles = new Map();
function edit(path, transform) {
  const file = resolve(site, path);
  if (!originalFiles.has(file)) originalFiles.set(file, readFileSync(file, 'utf8'));
  writeFileSync(file, transform(originalFiles.get(file)));
}
const generation = readFileSync('local/build/blog/active.json', 'utf8');
const clock = readFileSync('/app/blog-clock.txt', 'utf8');
async function get(path, status = 200) {
  const response = await fetch(base + path);
  const html = await response.text();
  assert.equal(response.status, status, path + ': ' + html.slice(0, 1000));
  assert(!/SECRET_|bodyDigest|\/app\/|Stack trace|Warning:/.test(html), 'Leak in ' + path);
  const props = parse(html);
  rows.push({ path, status, slugs: props.blog?.articles?.map(a => a.slug), total: props.blog?.total, meta: props.meta });
  return { props, html };
}
const decode = text => text.replace(/&(amp|quot|lt|gt|#039);/g, (_, key) => ({ amp: '&', quot: '"', lt: '<', gt: '>', '#039': "'" })[key]);
const content = (html, attr, name) => [...html.matchAll(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`, 'g'))].map(m => decode(m[1]));
try {
  const sets = [
    ['/blog/tags/php', ['p01', 'p02', 'p03', 'p04', 'p05']],
    ['/blog/tags/php?page=2', ['p06', 'p09', 'p11']],
    ['/blog/archive/2026?page=2', ['p06', 'p07', 'p08']],
    ['/blog/tags/php?year=2026&page=2', ['p06']],
    ['/blog/archive/2025', ['p09', 'p10', 'p11', 'p12', 'p13']],
    ['/blog/tags/edoc', ['p01', 'p04', 'p07', 'p12']],
    ['/blog/tags/' + encodeURIComponent('заметки'), ['p10', 'p13']],
    ['/en/blog/tags/php', ['p01', 'p04']],
  ];
  for (const [path, slugs] of sets) assert.deepEqual((await get(path)).props.blog.articles.map(a => a.slug), slugs);
  for (const path of ['/en/blog?page=2', '/en/blog/tags/' + encodeURIComponent('заметки'), '/blog/tags/' + encodeURIComponent('заметки') + '?year=2026&page=2']) await get(path, 404);
  for (const path of ['/blog?year=' + '9'.repeat(500), '/blog?page[][]=2', '/blog?year[a][b]=2026', '/blog?page=01', '/blog/archive/2026?year=2025']) await get(path, 400);
  for (const path of ['/blog?page=9223372036854775807', '/blog?page=9223372036854775808', '/blog/archive/1000', '/blog/archive/9999']) await get(path, 404);
  assert.equal((await get('/blog?page=0&page=2')).props.meta.canonical, base + '/blog?page=2');
  assert.equal((await get('/blog?year=bad&year=2026')).props.meta.canonical, base + '/blog/archive/2026');
  for (const path of ['/blog', '/blog?page=2', '/blog/tags/php', '/blog/archive/2026', '/blog/tags/php?year=2026', '/blog/tags/php?year=2026&page=2', '/blog/p01', '/blog/p04', '/en/blog/en-only']) {
    const { props, html } = await get(path);
    assert.equal([...html.matchAll(/<link rel="canonical"/g)].length, 1);
    assert(html.includes(`<link rel="canonical" href="${props.meta.canonical.replaceAll('&', '&amp;')}">`));
    assert.deepEqual(content(html, 'property', 'og:url'), [props.meta.canonical]);
    assert.deepEqual(content(html, 'property', 'og:title'), [props.meta.title]);
    assert.deepEqual(content(html, 'property', 'og:description'), [props.meta.description]);
    assert.deepEqual(content(html, 'name', 'description'), [props.meta.description]);
    assert(html.includes(`<html lang="${props.meta.language}">`));
    assert.deepEqual(content(html, 'name', 'robots'), path.includes('year=') ? ['noindex,follow'] : []);
    if (props.meta.published_time) assert.deepEqual(content(html, 'property', 'article:published_time'), [props.meta.published_time]);
    if (props.meta.image) {
      assert.deepEqual(content(html, 'property', 'og:image'), [props.meta.image]);
      assert.equal((await fetch(props.meta.image)).status, 200);
    }
    if (path.endsWith('en-only')) assert.deepEqual(props.meta.alternates.map(a => a.locale), ['en']);
  }
  // One unchanged public article loses/reacquires only its real EN translation.
  for (const mutate of [s => s.replace('draft: false', 'draft: true'), s => s.replace('2026-04-01', '2027-04-01')]) {
    edit('en/blog/p04.mdx', mutate);
    assert.deepEqual((await get('/blog/p04')).props.meta.alternates.map(a => a.locale), ['ru']);
    await get('/en/blog/p04', 404);
    assert.equal((await get('/en/blog')).props.blog.total, 2);
  }
  edit('en/blog/p04.mdx', s => s);
  assert.deepEqual((await get('/blog/p04')).props.meta.alternates.map(a => a.locale), ['ru', 'en']);
  assert.equal((await get('/en/blog')).props.blog.total, 3);
  // A warmed public condition loses page 2 immediately after draft/date edits.
  for (const [state, mutate, total, yearTotal] of [
    ['draft', s => s.replace('draft: false', 'draft: true'), 12, 7],
    ['future', s => s.replace('2026-02-01', '2027-02-01'), 12, 7],
    ['past-year', s => s.replace('2026-02-01', '2025-02-01'), 13, 7],
  ]) {
    edit('ru/blog/p06.md', mutate);
    assert.equal((await get('/blog')).props.blog.total, total, state);
    assert.equal((await get('/blog/archive/2026')).props.blog.total, yearTotal, state);
    const and = (await get('/blog/tags/php?year=2026')).props;
    assert.equal(and.blog.total, 5, state);
    assert.equal(and.blog.tags.find(t => t.value === 'php').count, 5, state);
    await get('/blog/tags/php?year=2026&page=2', 404);
    await get('/blog/p06', state === 'past-year' ? 200 : 404);
    edit('ru/blog/p06.md', s => s);
    assert.equal((await get('/blog/tags/php?year=2026&page=2')).props.blog.articles[0].slug, 'p06');
  }
  edit('site.json', s => JSON.stringify({ ...JSON.parse(s), timezone: 'Europe/Amsterdam' }));
  assert.deepEqual((await get('/blog/archive/2026?page=2')).props.blog.articles.map(a => a.slug), ['p06', 'p07', 'p08', 'p09']);
  assert.deepEqual((await get('/blog/tags/php?year=2026&page=2')).props.blog.articles.map(a => a.slug), ['p06', 'p09']);
  edit('site.json', s => s);
  const hidden = resolve(site, 'ru/blog/future-unique.md');
  writeFileSync(hidden, "---\ntitle: SECRET_TITLE\ndescription: SECRET_DESCRIPTION\ndate: '2031-01-01'\ntags: [future-unique]\nimage: https://example.invalid/SECRET_COVER.svg\n---\nSECRET_BODY\n");
  try { await get('/blog'); await get('/blog/tags/future-unique', 404); await get('/blog/archive/2031', 404); } finally { rmSync(hidden); }
  const blog = resolve(site, 'ru/blog'); const saved = '/app/i3-blog-saved';
  renameSync(blog, saved); mkdirSync(blog);
  try {
    const empty = (await get('/blog')).props.blog;
    assert.equal(empty.total, 0); assert.deepEqual(empty.articles, []); assert.deepEqual(empty.tags, []); assert.deepEqual(empty.years, []);
    await get('/blog?page=2', 404);
  } finally { rmSync(blog, { recursive: true }); renameSync(saved, blog); }
  assert.equal(readFileSync('local/build/blog/active.json', 'utf8'), generation);
  console.log('I3 extra regressions passed: ' + rows.length + ' requests, exact sets/head/withdrawal/locales/empty, no rebuild');
} finally {
  for (const [file, text] of originalFiles) writeFileSync(file, text);
  writeFileSync('/app/blog-clock.txt', clock);
  writeFileSync('/evidence/list-regressions.json', JSON.stringify(rows, null, 2));
}
