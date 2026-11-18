import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Focused presentation regression; reuse the production snapshot prepared by user-rework-build.
const authored = process.argv[2] === 'authored';
const root = '/evidence/polish-' + (authored ? 'personal' : 'default');
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
  const rows = [], errors = [], base = 'http://nginx';
  page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  async function gaps(scope, forceWrap = false) {
    return scope.evaluate((node, forceWrap) => {
      const list = node.querySelector('.collection-tags');
      const original = list.style.width;
      if (forceWrap) list.style.width = '180px';
      const s = getComputedStyle(list), gap = parseFloat(s.columnGap), rowGap = parseFloat(s.rowGap);
      const boxes = [...list.children].map(n => { const r = n.getBoundingClientRect(), c = getComputedStyle(n); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, padding:c.padding, text:n.textContent }; });
      list.style.width = original;
      return { gap, rowGap, boxes };
    }, forceWrap);
  }
  function verifyGaps(g, wrap) {
    ok(g.boxes.length >= 3, 'All original project labels');
    ok(g.boxes.every(b => b.padding === '4px 8px'), 'UI-kit badge padding');
    let wrapped = false;
    for (let i = 1; i < g.boxes.length; i++) {
      const a = g.boxes[i - 1], b = g.boxes[i];
      if (Math.abs(a.y - b.y) < 1) ok(Math.abs(b.x - a.right - g.gap) < 1, 'Equal horizontal badge gap, including first');
      else { wrapped = true; ok(Math.abs(b.y - a.bottom - g.rowGap) < 1, 'Equal row badge gap'); ok(Math.abs(b.x - g.boxes[0].x) < 1, 'Wrapped row starts at same edge'); }
    }
    if (wrap) ok(wrapped, 'Narrow project labels actually wrap');
  }
  for (const width of [1440, 390]) for (const prefix of ['', '/en']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const paths = authored ? [prefix || '/', prefix+'/blog', ...(!prefix ? ['/blog/telegram-25'] : []), prefix+'/projects', prefix+'/projects/e-doc', prefix+'/docs'] : [prefix || '/', prefix+'/blog', prefix+'/blog/p04'];
    for (const path of paths) {
      const response = await page.goto(base + path); ok(response.status() === 200, 'Supported page ' + path);
      await page.locator('footer').waitFor();
      const props = await page.evaluate(() => JSON.parse(document.querySelector('script[data-page]').textContent).props);
      ok(props.web.footer.feedUrl === prefix+'/blog/rss.xml', 'Feed comes from shared locale data on '+path);
      const descriptions = page.locator('.blog-card__description');
      for (const description of await descriptions.all()) ok(await description.isVisible() === !authored, 'Description presentation is theme-local');
      if (!authored) {
        if (path.includes('/blog')) ok(await page.locator('main .blog-rss').isVisible(), 'Default RSS placement preserved');
        ok(await page.locator('footer .personal-feed-link').count() === 0, 'Default footer unchanged');
        rows.push({ width, path, defaultDescription:true, defaultRss:true });
        continue;
      }
      ok(await page.locator('.personal-header nav a[href$="/docs"], .personal-footer nav a[href$="/docs"]').count() === 0, 'Docs removed from personal menus');
      ok(await page.locator('main .blog-rss:visible').count() === 0, 'No personal heading RSS');
      const header = page.locator('header .brand-lockup').first(), brand = page.locator('.personal-footer-brand');
      ok(await header.getAttribute('href') === (prefix || '/') && await brand.getAttribute('href') === (prefix || '/'), 'Both brands lead home in locale');
      ok(await header.locator('img').getAttribute('src') === await brand.locator('img').getAttribute('src'), 'Header/footer use identical mark');
      const svg = await (await page.request.get(new URL(await brand.locator('img').getAttribute('src'), base).href)).text();
      ok(svg.includes('a<tspan fill="#b58aff">.</tspan>'), 'Original a with accent dot');
      const colophon = page.locator('.personal-colophon');
      ok(await colophon.innerText() === (prefix ? 'Built with E-Doc' : 'Сделано на базе E-Doc'), 'Localized colophon');
      ok(await colophon.getAttribute('href') === 'https://e-doc.dev', 'Colophon destination');
      const b = await brand.boundingBox(), c = await colophon.boundingBox(); ok(c.y >= b.y+b.height, 'Colophon below brand');
      ok(await page.locator('footer a[href="https://e-doc.dev"]').count() === 1, 'No duplicate right colophon');
      const rss = page.getByRole('link', { name: prefix ? 'RSS feed' : 'RSS-лента', exact: true });
      ok(await rss.count() === 1 && await rss.getAttribute('href') === prefix+'/blog/rss.xml', 'Named locale RSS icon');
      ok(await rss.locator('svg[aria-hidden=true]').count() === 1, 'Decorative standard RSS glyph');
      const r = await rss.boundingBox(); ok(r.width >= 44 && r.height >= 44, 'RSS touch target');
      await rss.focus(); ok(await rss.evaluate(n => getComputedStyle(n).outlineStyle !== 'none'), 'RSS visible focus');
      await page.getByRole('tooltip').waitFor(); ok((await page.getByRole('tooltip').innerText()).includes(prefix ? 'RSS feed' : 'RSS-лента'), 'Localized focus tooltip');
      await page.keyboard.press('Escape');
      await page.mouse.move(0, 0); await rss.hover(); await page.getByRole('tooltip').waitFor();
      const geometry = [];
      for (const scope of await page.locator('.personal-projects .markdown-card__metadata, .personal-project-intro .markdown-card__metadata').all()) {
        const normal = await gaps(scope), wrapped = await gaps(scope, true);
        verifyGaps(normal, false); verifyGaps(wrapped, true); geometry.push({ normal, wrapped });
      }
      if (width === 1440 && path === (prefix || '/')) {
        const originalGeometry = await page.locator('.personal-projects .markdown-card__metadata').first().evaluate(node => {
          const list = node.querySelector('.collection-tags'), first = list.firstElementChild;
          node.insertBefore(first, list); // Exact old composition: category sibling + TagList.
          const rects = [first, ...list.children].map(n => n.getBoundingClientRect());
          const before = rects.slice(1).map((r, i) => r.x - rects[i].right);
          list.insertBefore(first, list.firstChild);
          return before;
        });
        ok(Math.abs(originalGeometry[0]-12)<1 && Math.abs(originalGeometry[1]-6.4)<1, 'Old composition reproduces 12 / 6.4 px gap');
        geometry.push({ originalCompositionGaps:originalGeometry });
      }
      if (width === 390 && path === (prefix || '/')) {
        await page.getByRole('button', { name: prefix ? 'Open menu' : 'Открыть меню', exact: true }).click();
        await page.locator('.site-menu-drawer-nav').waitFor();
        ok(await page.locator('.site-menu-drawer-nav a[href$="/docs"]').count() === 0, 'Mobile menu has no Docs');
        await page.keyboard.press('Escape');
      }
      await page.locator('footer').scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path:root+`/footer-${prefix?'en':'ru'}-${width}-${path.includes('/docs')?'docs':path.includes('telegram')?'article':path.includes('e-doc')?'detail':path.includes('projects')?'projects':path.includes('blog')?'blog':'home'}.png`, animations:'disabled' });
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      rows.push({ width, path, feed:true, brand:true, menu:true, geometry });
    }
    if (authored) {
      await page.goto(base+(prefix || '/')); await page.locator('footer').waitFor();
      const brand = page.locator('.personal-footer-brand'); await brand.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base+(prefix || '/'));
      const rss = page.locator('.personal-feed-link');
      const [popup] = await Promise.all([page.context().waitForEvent('page'), rss.click({modifiers:['ControlOrMeta']})]);
      await popup.waitForLoadState(); ok(new URL(popup.url()).pathname === prefix+'/blog/rss.xml', 'RSS native new tab'); await popup.close();
      await rss.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base+prefix+'/blog/rss.xml'); await page.goBack(); await page.reload(); await page.locator('footer .personal-feed-link').waitFor();
    }
  }
  if (authored) {
    const context = await page.context().browser().newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
    try { const touch = await context.newPage(); for (const prefix of ['', '/en']) { await touch.goto(base+(prefix || '/')); await touch.locator('.personal-feed-link').tap(); await touch.waitForURL(base+prefix+'/blog/rss.xml'); await touch.goBack(); await touch.locator('.personal-footer-brand').tap(); await touch.waitForURL(base+(prefix || '/')); } } finally { await context.close(); }
  }
  ok(!errors.length, errors.join('\n')); return { rows, errors };
}
async function disabled(page, authored) {
  for (const prefix of ['', '/en']) for (const path of [prefix || '/', prefix+'/projects', prefix+'/docs']) {
    await page.goto('http://nginx'+path); await page.locator('footer').waitFor();
    const value = await page.evaluate(() => JSON.parse(document.querySelector('script[data-page]').textContent).props.web.footer.feedUrl);
    if (value !== null) throw Error('Disabled shared feed on '+path);
    if (authored && await page.locator('footer .personal-feed-link').count()) throw Error('Disabled footer exposes RSS');
  }
  return { disabled:true };
}
const config = resolve('local/storage/edoc/site.json'), original = readFileSync(config);
try {
  cli('open', 'http://nginx', '--config', '/opt/browser/cli.config.json'); cli('snapshot');
  cli('run-code', `async page => (${check.toString()})(page,${authored},${JSON.stringify(root)})`);
  const value = JSON.parse(original); value.blog.enabled = false; writeFileSync(config, JSON.stringify(value));
  cli('run-code', `async page => (${disabled.toString()})(page,${authored})`);
} catch (error) {
  try { cli('snapshot'); cli('run-code', `async page => { await page.screenshot({path:${JSON.stringify(root+'/failure.png')},fullPage:true}); return {url:page.url(),text:(await page.locator('body').innerText()).slice(-1800)}; }`); } catch {}
  throw error;
} finally {
  writeFileSync(config, original); spawnSync('/opt/browser/node_modules/.bin/playwright-cli', ['close'], {encoding:'utf8'});
}
