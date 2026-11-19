import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Drive the project's pinned Playwright CLI against the production nginx site.
// Run after blog-list-http.mjs in the SAME workspace.exec snapshot.
const calls = [];
function cli(...args) {
  const result = spawnSync('playwright-cli', args, { encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  calls.push({ args, status: result.status, output });
  writeFileSync('/evidence/list-browser-cli.json', JSON.stringify(calls, null, 2));
  assert.equal(result.status, 0, output);
  assert(!output.includes('### Error'), output);
  return output;
}
try {
  cli('open', 'http://nginx/blog', '--config', '/opt/browser/cli.config.json');
  cli('resize', '1440', '1000');
  cli('snapshot');
  cli('run-code', `async page => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const check = async (path, count, status) => {
      await page.waitForURL('http://nginx' + path);
      await page.waitForFunction(count => document.querySelectorAll('.blog-card').length === count, count);
      const actual = await page.locator('.blog-card').count();
      if (actual !== count) throw new Error(path + ': cards=' + actual);
      if (status && !(await page.getByRole('status').textContent()).includes(status)) throw new Error('Wrong results: ' + path);
    };
    const shot = async name => {
      await page.evaluate(() => document.fonts.ready);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('Horizontal overflow: ' + name);
      await page.screenshot({ path: '/evidence/' + name + '.png', fullPage: true });
    };
    await check('/blog', 5, '13');
    await shot('S8-list-desktop');
    await page.getByRole('link', { name: 'Страница 3', exact: true }).click();
    await check('/blog?page=3', 3, '13');
    await shot('S8-last-desktop');
    await page.reload(); await check('/blog?page=3', 3, '13');
    await page.locator('.blog-filter-options a').filter({ hasText: /^php / }).click();
    await check('/blog/tags/php', 5, '8');
    await page.locator('.blog-filter-options a').filter({ hasText: /^2026 / }).click();
    await check('/blog/tags/php?year=2026', 5, '6');
    await page.getByRole('link', { name: 'Страница 2', exact: true }).click();
    await check('/blog/tags/php?year=2026&page=2', 1, '6');
    await shot('S9-combined-desktop');
    await page.goBack(); await check('/blog/tags/php?year=2026', 5, '6');
    await page.goForward(); await check('/blog/tags/php?year=2026&page=2', 1, '6');
    await page.reload(); await check('/blog/tags/php?year=2026&page=2', 1, '6');
    // Repeated transition must reuse the same URL contract and data.
    await page.getByRole('link', { name: 'Назад', exact: true }).click();
    await check('/blog/tags/php?year=2026', 5, '6');
    await page.getByRole('link', { name: 'Далее', exact: true }).click();
    await check('/blog/tags/php?year=2026&page=2', 1, '6');
    await page.getByRole('link', { name: 'Все теги', exact: true }).click();
    await check('/blog/archive/2026', 5, '8');
    await page.getByRole('link', { name: 'Страница 2', exact: true }).click();
    await check('/blog/archive/2026?page=2', 3, '8');
    await shot('S10-archive-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('S10-archive-mobile');
    await page.goto('http://nginx/blog/tags/php?year=2026&page=2');
    await check('/blog/tags/php?year=2026&page=2', 1, '6');
    await shot('S9-combined-mobile');
    const back = page.getByRole('link', { name: 'Назад', exact: true });
    await back.focus(); await shot('S9-keyboard-mobile'); await page.keyboard.press('Enter');
    await check('/blog/tags/php?year=2026', 5, '6');
    await page.getByRole('link', { name: 'Далее', exact: true }).click();
    await check('/blog/tags/php?year=2026&page=2', 1, '6');
    await page.goBack(); await check('/blog/tags/php?year=2026', 5, '6');
    await page.goForward(); await check('/blog/tags/php?year=2026&page=2', 1, '6');
    await page.reload(); await check('/blog/tags/php?year=2026&page=2', 1, '6');
    if (!(await page.locator('.blog-filter-options a[aria-current]').allTextContents()).join().includes('php')) throw new Error('Selected filter lost');
    await page.locator('.blog-filter-options a').filter({ hasText: /^заметки / }).click();
    await page.waitForURL(url => url.pathname.startsWith('/blog/tags/') && url.searchParams.get('year') === '2026');
    await page.getByText('По выбранным условиям публикаций нет.', { exact: true }).waitFor();
    if (await page.locator('.blog-card').count() !== 0) throw new Error('Empty intersection has cards');
    await shot('S11-empty-mobile');
    for (const [path, code] of [['/blog?page=0', 400], ['/blog?page=4', 404]]) {
      const response = await page.goto('http://nginx' + path);
      if (response.status() !== code) throw new Error('Wrong status ' + path);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await shot('S11-' + code + '-mobile');
    }
    await page.goto('http://nginx/en/blog');
    await page.getByRole('status').filter({ hasText: 'Articles: 3' }).waitFor();
    await page.goto('http://nginx/blog/p04');
    await page.getByRole('button', { name: 'Счётчик: 0', exact: true }).click();
    await page.getByRole('button', { name: 'Счётчик: 1', exact: true }).waitFor();
    await page.locator('[data-context]').filter({ hasText: 'ru / provider' }).waitFor();
    if (errors.length) throw new Error(JSON.stringify(errors));
    console.log('I3 browser passed: first/repeat, direct/reload/Back/Forward, desktop/mobile, keyboard, EN, MDX context');
  }`);
  cli('snapshot');
  cli('console', 'error');
} finally {
  cli('close');
}
