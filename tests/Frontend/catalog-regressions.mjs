import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { verifyCatalog } from './catalog-browser.mjs';

function cli(...args) {
  const result = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.stack ?? '');
  writeFileSync(`/evidence/catalog-regressions-${args[0]}.log`, output);
  assert.equal(result.status, 0, output);
  assert(!output.includes('### Error'), output);
}
async function check(page, verifyCatalog) {
  page.setDefaultTimeout(7000);
  const results = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) for (const locale of ['ru', 'en']) {
    const prefix = locale === 'en' ? '/en' : '';
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('http://nginx' + prefix + '/design-kit');
    try {
      const checks = await verifyCatalog(page);
      // Capture the actual simultaneous messages, after their entry animation.
      for (const instance of await page.locator('[data-catalog-instance]').all()) {
        await instance.getByRole('button', { name: locale === 'en' ? 'Show notification' : 'Показать уведомление', exact: true }).click();
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/evidence/catalog-${locale}-${width}-notifications.png` });
      await page.locator('#catalog-colors').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/evidence/catalog-${locale}-${width}-foundations.png` });
      await page.goto('http://nginx' + prefix + '/design-kit');
      await page.locator('#catalog-tokens').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/evidence/catalog-${locale}-${width}-tokens.png` });
      const homeResponse = await page.goto('http://nginx' + (prefix || '/'));
      if (homeResponse.status() !== 200) throw Error('Home returned HTTP ' + homeResponse.status());
      const doors = page.locator('.personal-doors a'); await doors.first().waitFor();
      const names = await doors.allTextContents();
      if (names.length !== 2 || new Set(names).size !== 2 || names.some(name => name.trim() === '→')) throw Error('Distinct localized card action names: ' + names);
      for (const [index, dest] of ['/blog', '/projects'].entries()) {
        const href = await doors.nth(index).getAttribute('href');
        if (href !== prefix + dest) throw Error('Incorrect card destination: ' + href);
      }
      await page.screenshot({ path: `/evidence/home-${locale}-${width}-names.png` });
      results.push({ width, locale, checks, names });
    } catch (error) {
      await page.screenshot({ path: '/evidence/catalog-regressions-failure.png', fullPage: true });
      throw error;
    }
  }
  const touchContext = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const touch = await touchContext.newPage(); touch.setDefaultTimeout(7000);
    for (const locale of ['ru', 'en']) {
      const prefix = locale === 'en' ? '/en' : '';
      const t = (ru, en) => locale === 'en' ? en : ru;
      await touch.goto('http://nginx' + prefix + '/design-kit');
      const instances = touch.locator('[data-catalog-instance]'); await instances.first().waitFor();
      const first = instances.first(), second = instances.last();
      await first.getByLabel(t('Название', 'Name')).fill('Touch');
      await first.getByLabel(t('Заметка', 'Note'), { exact: true }).fill('Touch note');
      await first.getByText(t('Большой', 'Large'), { exact: true }).tap();
      await first.getByText(t('Включить пример', 'Enable example'), { exact: true }).tap();
      await first.getByRole('button', { name: t('Сбросить', 'Reset'), exact: true }).tap();
      if (await first.getByLabel(t('Заметка', 'Note'), { exact: true }).inputValue() !== '' || !await first.getByRole('radio', { name: t('Маленький', 'Small'), exact: true }).isChecked() || await first.getByRole('switch').isChecked()) throw Error('Touch reset failed');
      for (const instance of [first, second]) await instance.getByRole('button', { name: t('Показать уведомление', 'Show notification'), exact: true }).tap();
      await touch.waitForTimeout(500);
      const notices = touch.locator('[data-catalog-notifications] [role="status"]');
      if (await notices.count() !== 2) throw Error('Touch notifications missing');
      const boxes = await notices.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { y:r.y,bottom:r.bottom }; }));
      if (boxes[0].bottom > boxes[1].y && boxes[1].bottom > boxes[0].y) throw Error('Touch notifications overlap');
      await notices.first().getByRole('button', { name: t('Закрыть', 'Close'), exact: true }).tap();
      await touch.waitForTimeout(500);
      if (await notices.count() !== 1) throw Error('Touch dismiss changes another notification');
      await touch.screenshot({ path: `/evidence/catalog-${locale}-touch.png` });
      const duration = await touch.locator('.catalog-spinner').evaluate(node => getComputedStyle(node).animationName);
      if (duration !== 'none') throw Error('Reduced motion spinner remains animated');
      results.push({ locale, actualTouch: true, reducedMotion: true });
    }
  } finally { await touchContext.close(); }
  if (errors.length) throw Error(JSON.stringify(errors));
  return results;
}
try {
  cli('open', 'http://nginx', '--config', '/opt/browser/cli.config.json');
  cli('snapshot');
  cli('run-code', `async page => (${check.toString()})(page, ${verifyCatalog.toString()})`);
} finally { cli('close'); }
