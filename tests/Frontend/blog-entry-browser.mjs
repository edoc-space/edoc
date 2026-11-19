import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const authored = process.argv[2] === 'authored';
const root = '/evidence/' + (authored ? 'authored' : 'default') + '/blog-entry';
mkdirSync(root, { recursive: true });
const calls = [];
function cli(...args) {
  const r = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', args, { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
  const output = (r.stdout ?? '') + (r.stderr ?? '') + (r.error?.stack ?? '');
  calls.push({ args, status: r.status, output });
  writeFileSync(root + '/browser.json', JSON.stringify(calls, null, 2));
  assert.equal(r.status, 0, output); assert(!output.includes('### Error'), output);
}
async function check(page, authored, root) {
  const ok = (value, label) => { if (!value) throw Error(label); };
  const base = 'http://nginx', rows = [], errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const entry = p => p.locator('.latest-articles').getByRole('link', { name: p.url().includes('/en') ? 'View all' : 'Посмотреть все', exact: true });
  const capture = async (p, path, area) => {
    for (const img of await area.locator('img').all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(n => n.decode()); }
    await p.evaluate(() => document.fonts.ready); await area.screenshot({ path, animations: 'disabled' });
  };
  for (const width of [1440, 390]) for (const prefix of ['', '/en']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const home = base + (prefix || '/'), blog = base + prefix + '/blog';
    ok((await page.goto(home)).status() === 200, 'Fresh home');
    const section = page.locator('.latest-articles'); await section.waitFor();
    const link = entry(page); ok(await link.count() === 1, 'Dedicated visible blog entry in latest articles');
    ok(await section.locator(':scope > .latest-articles__heading > h2').count() === 1, 'Section h2 is preserved');
    ok(await section.getAttribute('aria-label') === (prefix ? 'Latest articles' : 'Последние статьи'), 'Section accessible name');
    ok(await link.evaluate(n => n.tagName === 'A' && n.href) === blog, 'Native current-locale blog URL');
    ok(await section.locator('.blog-card').count() === (authored && prefix ? 0 : 2), 'Latest limit and empty locale');
    await link.focus(); ok(await link.evaluate(n => getComputedStyle(n).outlineStyle !== 'none'), 'Visible keyboard focus');
    const rect = await link.boundingBox(); ok(rect.height >= 44 && rect.width >= 44, 'Touch target');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Home fits viewport');
    await capture(page, `${root}/home-${prefix ? 'en' : 'ru'}-${width}.png`, section);
    await link.focus(); await page.keyboard.press('Enter'); await page.waitForURL(blog); await page.locator('.blog-list').waitFor();
    const expected = authored ? (prefix ? 0 : 6) : (prefix ? 3 : 5);
    ok(await page.locator('.blog-card').count() === expected, 'First blog page count');
    await page.goBack(); await page.waitForURL(home); await section.waitFor();
    await page.reload(); await section.waitFor();
    const [popup] = await Promise.all([page.context().waitForEvent('page'), entry(page).click({ modifiers: ['ControlOrMeta'] })]);
    await popup.waitForLoadState(); ok(popup.url() === blog, 'Native new tab'); await popup.close();
    await entry(page).click(); await page.waitForURL(blog); await page.locator('.blog-list').waitFor();
    await page.reload(); await page.locator('.blog-list').waitFor();
    ok(await page.locator('.blog-card').count() === expected, 'Revisit and reload');
    if (authored && !prefix) {
      const found = [];
      for (const [number, count] of [[1, 6], [2, 6], [3, 5]]) {
        if (number > 1) await page.getByRole('navigation', { name: 'Страницы блога' }).getByRole('link', { name: `Страница ${number}`, exact: true }).click();
        await page.waitForURL(blog + (number === 1 ? '' : `?page=${number}`));
        await page.locator('.blog-card').first().waitFor();
        ok(await page.locator('.blog-card').count() === count, 'Pagination ' + number);
        ok(await page.locator('.blog-results').innerText() === `Публикаций: 17. Страница ${number} из 3.`, 'Results counter');
        // SEO metadata belongs to the server-rendered document; verify the direct/reload contract.
        await page.reload(); await page.locator('.blog-card').first().waitFor();
        ok(await page.locator('.blog-card').count() === count, 'Reload page ' + number);
        ok(await page.locator('link[rel=canonical]').getAttribute('href') === blog + (number === 1 ? '' : `?page=${number}`), 'Canonical page after reload');
        found.push(...await page.locator('.blog-list > a').evaluateAll(ns => ns.map(n => n.getAttribute('href'))));
        if (width === 1440 || number === 1) await capture(page, `${root}/blog-ru-${width}-page-${number}.png`, page.locator('.blog-layout'));
      }
      ok(found.length === 17 && new Set(found).size === 17, 'Complete unique set');
      await page.locator('.blog-list > a').first().click(); await page.locator('.blog-document:not([aria-busy=true])').waitFor();
      await page.goBack(); await page.waitForURL(blog + '?page=3'); await page.reload(); await page.locator('.blog-card').first().waitFor();
      ok(await page.locator('.blog-card').count() === 5, 'Back/reload preserves last page');
      for (const [url, status] of [['?page=0', 400], ['?page=4', 404]]) ok((await page.request.get(blog + url)).status() === status, 'Page boundary ' + url);
      await page.goto(blog + '/archive/2025'); await page.locator('.blog-card').first().waitFor();
      ok(await page.locator('.blog-card').count() === 6, 'Archive first page');
      await page.getByRole('navigation', { name: 'Страницы блога' }).getByRole('link', { name: 'Страница 2', exact: true }).click();
      await page.waitForURL(blog + '/archive/2025?page=2'); await page.reload(); await page.locator('.blog-card').first().waitFor();
      ok(await page.locator('.blog-card').count() === 5, 'Archive second page retains year');
    } else await capture(page, `${root}/blog-${prefix ? 'en' : 'ru'}-${width}.png`, page.locator('.blog-layout'));
    rows.push({ width, prefix, expected });
  }
  const touch = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const p = await touch.newPage();
    for (const prefix of ['', '/en']) { await p.goto(base + (prefix || '/')); await entry(p).tap(); await p.waitForURL(base + prefix + '/blog'); await p.locator('.blog-list').waitFor(); }
  } finally { await touch.close(); }
  ok(errors.length === 0, errors.join('\n')); return { rows, touch: true, errors };
}
async function disabled(page) {
  for (const prefix of ['', '/en']) {
    await page.goto('http://nginx' + (prefix || '/')); await page.locator('.latest-articles').waitFor();
    if (await page.locator('.latest-articles a').count()) throw Error('Disabled blog must not expose a link');
    if (!await page.locator('.latest-articles .collection-empty').isVisible()) throw Error('Disabled state missing');
    if ((await page.request.get('http://nginx' + prefix + '/blog')).status() !== 404) throw Error('Disabled route should be closed');
  }
  return { disabled: true };
}
const configPath = resolve('local/storage/edoc/site.json'), original = readFileSync(configPath, 'utf8');
try {
  cli('open', 'http://nginx', '--config', '/opt/browser/cli.config.json'); cli('snapshot');
  cli('run-code', `async page => (${check.toString()})(page, ${authored}, ${JSON.stringify(root)})`);
  const config = JSON.parse(original); config.blog.enabled = false; writeFileSync(configPath, JSON.stringify(config));
  cli('run-code', `async page => (${disabled.toString()})(page)`);
} catch (error) {
  try {
    cli('snapshot');
    cli('run-code', `async page => { await page.screenshot({path:${JSON.stringify(root + '/failure.png')},fullPage:true}); return {url:page.url(),canonical:await page.locator('link[rel=canonical]').getAttribute('href'),headings:await page.locator('.latest-articles h2').allTextContents(),text:(await page.locator('body').innerText()).slice(0,1600)}; }`);
  } catch (diagnostic) { writeFileSync(root + '/diagnostic-error.log', String(diagnostic.stack ?? diagnostic)); }
  throw error;
} finally {
  writeFileSync(configPath, original);
  spawnSync('/opt/browser/node_modules/.bin/playwright-cli', ['close'], { encoding: 'utf8' });
}
