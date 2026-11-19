import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { verifyCatalog } from './catalog-browser.mjs';

/** Targeted follow-up after shared card CSS and Tooltip changes; no PHP suite repetition. */
async function review(page) {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const base = 'http://nginx';
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const shot = (name, fullPage = false) => page.screenshot({ path: `/evidence/presentation-${name}.png`, fullPage, animations: 'disabled' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const prefix of ['', '/en']) {
      const locale = prefix ? 'en' : 'ru';
      for (let repeat = 0; repeat < 3; repeat++) {
        await page.goto(base + prefix + '/design-kit');
        await verifyCatalog(page);
      }
      await shot(`catalog-${locale}-${width}`, true);
      const example = page.locator('[data-catalog-instance]').first();
      await example.locator('[data-catalog-dialog-trigger]').click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      await dialog.evaluate(async node => {
        const animations = []; for (let element = node; element; element = element.parentElement) animations.push(...element.getAnimations());
        await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      });
      await shot(`dialog-${locale}-${width}`); await page.keyboard.press('Escape');
      await example.locator('[data-catalog-tooltip-trigger]').focus(); await page.getByRole('tooltip').waitFor();
      await shot(`tooltip-${locale}-${width}`); await page.keyboard.press('Escape');
      const localTheme = await page.locator('[data-personal-theme]').count() > 0;
      if (localTheme) {
        check(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--btn-primary-start').trim()) === '#f1edff', 'Local tokens survive late UI-kit styles');
        check(await page.locator('.markdown-code').first().evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(8, 7, 15)', 'Dark code surface');
        check(await example.locator('textarea').evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(23, 22, 35)', 'Dark textarea surface');
      }
      for (const route of ['/', '/projects', '/projects/flow', '/projects/noteon', '/about', '/blog', '/blog/p04']) {
        await page.goto(base + prefix + (route === '/' ? '' : route));
        await page.locator('main .markdown-body:not([aria-busy=true]), main .blog-list').first().waitFor();
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' has no horizontal overflow');
        const cards = page.locator('.markdown-component--card');
        if (await cards.count()) check(await cards.first().evaluate(node => parseFloat(getComputedStyle(node).paddingLeft)) >= 16, route + ' card regions have spacing');
        await shot(`${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-${locale}-${width}`, true);
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(base + '/projects'); await page.locator('.personal-projects').waitFor();
  const duration = await page.locator('.markdown-component--card').first().evaluate(node => getComputedStyle(node).transitionDuration);
  check(duration.split(',').every(value => parseFloat(value) <= .001), 'Reduced motion keeps transitions at or below one millisecond');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const prefix of ['', '/en']) {
    await page.goto(base + prefix + '/blog'); await page.locator('a.blog-rss').click();
    await page.waitForURL(base + prefix + '/blog/rss.xml');
    const response = await page.request.get(page.url());
    check(response.status() === 200 && response.headers()['content-type'].startsWith('application/rss+xml'), 'RSS UI opens the locale feed');
    await shot(`rss-xml-${prefix ? 'en' : 'ru'}`);
  }
  check(errors.length === 0, errors.join('\n'));
  console.log(JSON.stringify({ catalogRepetitions: 12, widths: [1440, 390], locales: ['ru', 'en'], surfaces: true, cardSpacing: true, reducedMotion: duration, rssNavigation: true, errors }));
}
const calls = [];
function cli(...args) {
  const result = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.stack ?? '');
  calls.push({ args, status: result.status, output }); writeFileSync('/evidence/presentation-cli.json', JSON.stringify(calls, null, 2));
  assert.equal(result.status, 0, output); assert(!output.includes('### Error'), output);
}
try {
  cli('open', 'http://nginx/design-kit', '--config', '/opt/browser/cli.config.json'); cli('snapshot');
  cli('run-code', `async page => { const verifyCatalog = ${verifyCatalog.toString()}; const review = ${review.toString()}; await review(page); }`);
  cli('snapshot'); cli('console', 'error');
} finally { spawnSync('/opt/browser/node_modules/.bin/playwright-cli', ['close'], { encoding: 'utf8' }); }
