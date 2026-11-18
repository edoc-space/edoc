import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const calls = [];
function cli(...args) {
  const result = spawnSync('playwright-cli', args, { encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  calls.push({ args, status: result.status, output });
  writeFileSync('/evidence/list-docs-cli.json', JSON.stringify(calls, null, 2));
  assert.equal(result.status, 0, output);
  assert(!output.includes('### Error'), output);
}
try {
  cli('open', 'http://nginx/ru/docs/content/blog', '--config', '/opt/browser/cli.config.json');
  cli('resize', '1440', '900');
  cli('snapshot');
  cli('run-code', `async page => {
    for (const [path, heading, name] of [
      ['/ru/docs/content/blog', 'Теги, годы и страницы', 'docs-ru-blog'],
      ['/docs/content/blog', 'Tags, years and pages', 'docs-en-blog'],
      ['/ru/docs/content/languages', 'Локали блога', 'docs-ru-languages'],
      ['/docs/content/languages', 'Blog locales', 'docs-en-languages'],
    ]) {
      const response = await page.goto('http://nginx' + path);
      if (response.status() !== 200) throw new Error('Documentation status ' + response.status() + ': ' + path);
      const section = page.getByRole('heading', { name: heading, exact: true });
      await section.waitFor(); await section.scrollIntoViewIfNeeded();
      const links = await page.locator('.markdown-body a[href]').evaluateAll(links => [...new Set(links.map(a => a.href).filter(href => href.startsWith('http://nginx/')))]);
      for (const href of links) {
        const result = await page.request.get(href);
        if (result.status() !== 200) throw new Error('Broken documentation link: ' + href + ' = ' + result.status());
      }
      const images = await page.locator('.markdown-body img').evaluateAll(images => images.map(img => img.src));
      for (const src of images) {
        const image = await page.request.get(src);
        if (image.status() !== 200) throw new Error('Broken documentation image: ' + src);
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: '/evidence/' + name + '.png' });
      console.log(JSON.stringify({ path, heading, links: links.length, images: images.length, passed: true }));
    }
  }`);
  cli('snapshot');
} finally { cli('close'); }
