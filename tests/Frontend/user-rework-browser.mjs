import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { verifyCatalog } from './catalog-browser.mjs';

const authored = process.argv[2] === 'authored';
const evidenceRoot = authored ? '/evidence/authored' : '/evidence/default';
mkdirSync(evidenceRoot, { recursive:true });
const widths = process.argv.includes('--mobile') ? [390] : [1440, 390];
const calls = [];
function cli(...args) {
  const result = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', args, { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
  const output = (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.stack ?? '');
  calls.push({ args, status: result.status, output });
  writeFileSync(`${evidenceRoot}/user-rework-browser.json`, JSON.stringify(calls, null, 2));
  assert.equal(result.status, 0, output);
  assert(!output.includes('### Error'), output);
}
async function check(page, verifyCatalog, authored, widths, posts, evidenceRoot) {
  const ok = (value, message) => { if (!value) throw new Error(message); };
  const near = (a, b, label, tolerance = 2) => ok(Math.abs(a - b) <= tolerance, `${label}: ${a} / ${b}`);
  const base = 'http://nginx', results = [], errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  const shot = (name, fullPage = false) => page.screenshot({ path: `${evidenceRoot}/rework-${name}.png`, fullPage, animations: 'disabled' });
  const box = async node => { const r = await node.boundingBox(); ok(r, 'Visible geometry'); return r; };
  for (const width of widths) for (const lang of ['ru', 'en']) {
    const prefix = lang === 'en' ? '/en' : '', key = `${lang}-${width}`;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(base + (prefix || '/'));
    const doors = page.locator('.personal-doors > a.markdown-card-link'); await doors.first().waitFor();
    ok(await doors.count() === 2, 'Two native entrance links');
    const names = await doors.evaluateAll(nodes => nodes.map(n => document.getElementById(n.getAttribute('aria-labelledby'))?.textContent));
    ok(names[0] && names[1] && names[0] !== names[1], 'Distinct heading-based accessible names');
    for (let i = 0; i < 2; i++) {
      const link = doors.nth(i);
      ok(await link.getAttribute('href') === prefix + (i ? '/projects' : '/blog'), 'Locale entrance URL');
      ok((await link.ariaSnapshot()).includes('link '+JSON.stringify(names[i])), 'Native link has an accessible heading name');
      ok(await link.locator('a,button,input,select,textarea').count() === 0, 'No nested interactive controls');
      const a = await box(link), card = await box(link.locator('.markdown-component--card'));
      near(a.width, card.width, 'Whole link width'); near(a.height, card.height, 'Whole link height');
    }
    await doors.first().focus();
    ok(await doors.first().evaluate(n => getComputedStyle(n).outlineStyle !== 'none'), 'Visible keyboard focus');
    await page.keyboard.press('Enter'); await page.waitForURL(base + prefix + '/blog');
    await page.goBack(); await doors.first().waitFor();
    const projectDoor = doors.nth(1), rect = await box(projectDoor);
    await projectDoor.click({ position:{ x:8, y:rect.height - 8 } });
    await page.waitForURL(base + prefix + '/projects');
    await page.goBack(); await doors.first().waitFor();
    const [popup] = await Promise.all([page.context().waitForEvent('page'), doors.nth(1).click({ modifiers: ['ControlOrMeta'] })]);
    await popup.waitForLoadState(); ok(new URL(popup.url()).pathname === prefix + '/projects', 'Native new tab'); await popup.close();
    if (authored) {
      const body = await page.locator('body').innerText();
      ok(!/Проверка блога|Flow|Noteon|p0[1-9]|Синтетический пример личного сайта/.test(body), 'No synthetic contamination');
      const brand = page.locator('header .brand-lockup');
      ok(await brand.getAttribute('href') === (prefix || '/'), 'Brand links to the current locale home');
      ok((await brand.getAttribute('aria-label')).includes(lang === 'ru' ? 'На главную' : 'Home'), 'Brand has a meaningful accessible name');
      ok(!await brand.locator('.brand-name').isVisible(), 'Name hidden in header');
      const logo = brand.locator('img');
      ok(await logo.evaluate(async n => { await n.decode(); return n.naturalWidth > 0; }), 'Native brand logo loads');
      ok(await page.locator('header a[href$="/about"], header a[href$="/design-kit"], footer a[href$="/about"], footer a[href$="/design-kit"]').count() === 0, 'Simplified visible navigation');
      ok(await page.locator('.latest-articles .blog-card').count() === (lang === 'ru' ? 2 : 0), 'Current locale latest articles');
    }
    const cards = page.locator('.personal-projects .markdown-component--card');
    await cards.first().waitFor();
    const badges = await cards.locator('.markdown-card__metadata span[class*="_badge_"]').evaluateAll(nodes => nodes.map(n => { const s = getComputedStyle(n); return { text:n.textContent, x:parseFloat(s.paddingLeft), y:parseFloat(s.paddingTop) }; }));
    ok(badges.length > 2 && badges.every(b => b.x === 8 && b.y === 4), 'UI-kit md badge padding 4px 8px');
    for (const media of await cards.locator('.markdown-card__media').all()) {
      const card = await box(media.locator('..')), m = await box(media), content = await box(media.locator('> *'));
      near(m.x, card.x + 1, 'Media left edge'); near(m.width, card.width - 2, 'Media full width');
      near(content.width, m.width, 'Media child width'); near(content.height, m.height, 'Media child height');
      const metadata = await box(media.locator('..').locator('.markdown-card__metadata'));
      ok(metadata.y - (m.y + m.height) >= 16, 'Media to badges spacing');
    }
    if (authored) {
      const hrefs = await page.locator('.personal-projects a.markdown-card-link').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
      ok(JSON.stringify(hrefs) === JSON.stringify([prefix + '/projects/chgs', prefix + '/projects/e-doc']), 'Featured project order matches the real data');
      await shot(`authored-home-${key}`, true);
    }
    if (authored) {
      const links = page.locator('.personal-projects a.markdown-card-link');
      for (let i = 0; i < 2; i++) {
        const link = links.nth(i), href = await link.getAttribute('href');
        ok(await link.locator('a,button,input,select,textarea').count() === 0, 'Project card has no nested controls');
        ok((await link.ariaSnapshot()).includes('link '), 'Project accessible name');
        for (const part of ['.markdown-card__media', '.markdown-card__metadata', '.markdown-card__content']) {
          await link.locator(part).click(); await page.waitForURL(base + href);
          await page.goBack(); await links.nth(i).waitFor();
        }
        const r = await box(link);
        await link.click({position:{x:r.width/2,y:r.height-5}}); await page.waitForURL(base + href); await page.goBack();
        await link.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base + href); await page.goBack();
        const [projectTab] = await Promise.all([page.context().waitForEvent('page'), link.click({modifiers:['ControlOrMeta']})]);
        await projectTab.waitForLoadState(); ok(new URL(projectTab.url()).pathname === href, 'Project new tab'); await projectTab.close();
      }
      const brand = page.locator('header .brand-lockup');
      await brand.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base + (prefix || '/'));
    }
    await page.locator('.personal-projects').scrollIntoViewIfNeeded(); await shot(`48-projects-${key}`);
    await page.goto(base + prefix + '/design-kit'); await verifyCatalog(page);
    const tabs = page.locator('.markdown-tabs--ui').first();
    const nav = tabs.getByRole('tablist'), panel = tabs.locator('.tabs-panel');
    const navBox = await box(nav), panelBox = await box(panel), first = await box(nav.getByRole('tab').first()), next = await box(nav.getByRole('tab').nth(1));
    near(first.x + first.width, next.x, 'Adjacent tabs without gap'); near(navBox.y + navBox.height, panelBox.y, 'Nav joins panel');
    ok(await panel.evaluate(n => getComputedStyle(n).borderTopLeftRadius === '0px'), 'Square inner panel');
    ok(await tabs.evaluate(n => getComputedStyle(n).overflow === 'visible'), 'Tab corner and focus are not clipped');
    await tabs.scrollIntoViewIfNeeded(); await shot(`50-tabs-${key}`);
    await page.locator('[data-catalog-group="badges"]').scrollIntoViewIfNeeded(); await shot(`49-badges-${key}`);
    const video = page.locator('.docs-video').first(); await video.scrollIntoViewIfNeeded();
    const v = await box(video), parent = await box(video.locator('..'));
    near(v.x + v.width / 2, parent.x + parent.width / 2, 'Video centered');
    ok(v.width <= width, 'Video fits viewport'); ok(await video.locator('iframe').count() === 0, 'Video opt-in before click');
    await shot(`51-video-${key}`);
    for (const selector of ['.markdown-gallery', '.markdown-component--slider']) {
      const media = page.locator(selector).first(); await media.scrollIntoViewIfNeeded();
      const m = await box(media), p = await box(media.locator('..'));
      near(m.x + m.width / 2, p.x + p.width / 2, `${selector} centered`);
      ok(m.width <= width && m.width <= 861, 'Media max width and mobile fit');
      if (selector.includes('slider')) {
        const slide = media.locator('[data-active="true"]');
        const before = await slide.locator('img').getAttribute('src');
        await media.getByRole('button').last().focus(); await page.keyboard.press('Enter');
        ok(await slide.locator('img').getAttribute('src') !== before, 'Slider changes with keyboard');
      }
      await shot(`centered-${selector.includes('slider') ? 'slider' : 'gallery'}-${key}`);
    }
    await video.getByRole('button').click(); ok(await video.locator('iframe').count() === 1, 'Video loads after explicit click');
    await page.goto(base + prefix + (authored ? '/docs' : '/docs/components'));
    await page.locator('.docs-document:not([aria-busy=true])').waitFor();
    const header = page.locator('.docs-header'), sidebar = page.locator('.docs-sidebar');
    if (width === 1440) {
      const h = await box(header), s = await box(sidebar); ok(s.y >= h.y + h.height - 1, 'Sidebar below actual header on fresh entry');
      await page.evaluate(() => scrollTo(0, 350));
      const hs = await box(header), ss = await box(sidebar); ok(ss.y >= hs.y + hs.height - 1, 'Sticky sidebar below header after scroll');
      await page.locator('.docs-sidebar-collapse').click(); ok(await sidebar.evaluate(n => n.getBoundingClientRect().width <= 65), 'Collapsed sidebar');
      ok(await sidebar.locator('nav').evaluate(n => n.inert), 'Collapsed navigation cannot receive keyboard focus');
      await page.locator('.docs-sidebar-collapse').click(); ok((await box(sidebar)).width >= 250, 'Expanded sidebar');
      await shot(`52-sidebar-${key}`);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await shot(`53-footer-${key}`);
      const footer = await box(page.locator('.docs-footer')), side = await box(sidebar);
      near(side.y + side.height, footer.y + footer.height, 'Sidebar and footer lower edge');
      const tools = await box(page.locator('.docs-sidebar-tools')); near(tools.y, footer.y, 'Sidebar tools and footer upper edge', 3);
      ok(side.y >= (await box(header)).y + (await box(header)).height - 1, 'Sidebar stays below header at footer');
      ok(footer.height < 260, 'Compact docs footer');
      const content = await box(page.locator('.docs-content')); ok(content.width > 0, 'Docs content remains visible');
    } else {
      ok(!await sidebar.isVisible(), 'Desktop sidebar hidden on mobile');
      await header.getByRole('button', { name: lang === 'ru' ? 'Документация' : 'Documentation', exact:true }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      ok(await dialog.evaluate(n => n.contains(document.activeElement)), 'Mobile docs dialog owns focus');
      await shot(`52-sidebar-${key}`); await page.keyboard.press('Escape'); ok(await page.getByRole('dialog').count() === 0, 'Mobile docs dialog closes');
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await shot(`53-footer-${key}`);
    }
    if (authored) {
      const inner = page.locator('.docs-footer .personal-footer-inner');
      ok(await inner.evaluate(n => getComputedStyle(n).alignItems === 'center'), 'Footer vertical alignment');
      if (width === 1440) {
        const b = await box(inner);
        for (const child of await inner.locator(':scope > *').all()) {
          const c = await box(child); near(c.y+c.height/2,b.y+b.height/2,'Footer child vertically centered');
        }
      }
    }
    const footerLinks = await page.locator('.docs-footer a').evaluateAll(links => links.map(link => {
      const r = link.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return { text:link.textContent, x, y, reachable:x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && link.contains(document.elementFromPoint(x, y)) };
    }));
    ok(footerLinks.every(link => link.reachable), 'Every footer link is visible and receives pointer input: ' + JSON.stringify(footerLinks));
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    if (authored) {
      for (const id of ['chgs', 'e-doc']) {
        await page.goto(base + prefix + '/projects/' + id); await page.locator('.personal-detail-head h1').waitFor();
        ok(await page.locator('.personal-detail-head h1').count() === 1, 'One project H1');
        const logo = page.locator('.personal-project-cover img');
        const image = await logo.evaluate(async n => { await n.decode(); return { complete:n.complete, width:n.naturalWidth, fit:getComputedStyle(n).objectFit }; });
        ok(image.complete && image.width > 0 && image.fit === 'contain', 'Project logo loaded and preserves aspect ratio');
        ok(await page.locator('.personal-benefits li').count() === 4, 'Four sourced benefits');
        ok(!/Flow|Noteon|example\.com|p04/.test(await page.locator('body').innerText()), 'No invented project/contact data');
        ok(await page.locator('#contacts, a[href^="mailto:"], a[href*="t.me/"]').count() === 0, 'No personal contact CTA or empty contact block');
        const projectLinks = await page.locator('.personal-project-links a').evaluateAll(nodes => nodes.map(n => n.href));
        const expectedLinks = id === 'chgs' ? ['https://chgs.pro/'] : [lang === 'ru' ? 'https://e-doc.dev/ru/docs' : 'https://e-doc.dev/docs', 'https://github.com/edoc-space/edoc'];
        ok(JSON.stringify(projectLinks) === JSON.stringify(expectedLinks), 'Sourced project URLs');
        ok(new URL(await page.locator('link[rel="canonical"]').getAttribute('href')).pathname === prefix + '/projects/' + id, 'Canonical project detail');
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Project detail fits viewport');
        await shot(`project-${id}-${key}`, true);
        await page.locator(`a[href="${prefix}/projects"]`).last().click();
        await page.waitForURL(base + prefix + '/projects');
        await page.locator('.personal-projects a.markdown-card-link').first().waitFor();
      }
      const catalogue = page.locator('.personal-projects');
      const urls = () => catalogue.locator('a.markdown-card-link').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
      ok(JSON.stringify(await urls()) === JSON.stringify([prefix + '/projects/chgs', prefix + '/projects/e-doc']), 'One ordered project set in catalogue');
      for (const [label, id] of [['WMS', 'chgs'], [lang === 'ru' ? 'Документация' : 'Documentation', 'e-doc']]) {
        await catalogue.getByRole('button', {name:label,exact:true}).focus(); await page.keyboard.press('Enter');
        ok(JSON.stringify(await urls()) === JSON.stringify([prefix + '/projects/' + id]), 'Category filter selects its project');
        await catalogue.locator('a.markdown-card-link').click(); await page.waitForURL(base + prefix + '/projects/' + id);
        await page.goBack(); await page.waitForURL(base + prefix + '/projects'); await catalogue.locator('a.markdown-card-link').first().waitFor();
      }
      await catalogue.getByRole('button', {name:lang === 'ru' ? 'Все проекты' : 'All projects',exact:true}).click();
      ok((await urls()).length === 2, 'All categories restores both projects');
      await page.reload(); await catalogue.locator('a.markdown-card-link').first().waitFor(); ok((await urls()).length === 2, 'Fresh catalogue reopens');
      await shot(`catalogue-projects-${key}`, true);
      await page.goto(base + prefix + '/blog');
      if (lang === 'en') {
        await page.locator('.blog-list .collection-empty').waitFor();
        ok(await page.locator('.blog-card').count() === 0, 'No invented EN translations or RU fallback');
      } else {
        await page.locator('.blog-card').first().waitFor();
        ok(await page.locator('.blog-card').count() === 6, 'Six real posts on first page');
      }
      await shot(`blog-${key}`, true);
      if (lang === 'ru') {
        const sample = width === 1440 ? posts : posts.filter(p => ['telegram-13','telegram-24','telegram-25'].includes(p.slug));
        for (const post of sample) {
          await page.goto(base + post.href);
          const body = page.locator('.blog-document:not([aria-busy=true])'); await body.waitFor();
          const normalize = text => text.replace(/\s+/g,' ').trim();
          ok(normalize((await body.locator(':scope > div').allInnerTexts()).join('\n\n')) === normalize(post.text), 'Complete original body ' + post.slug);
          ok(await body.locator('[onclick],script,style').count() === 0, 'No exporter code');
          for (const image of await body.locator('img').all()) {
            ok(await image.evaluate(async n => {await n.decode();return n.naturalWidth>0;}), 'Photo decoded');
          }
          const clips = body.locator('video');
          ok(await clips.count() === (post.slug === 'telegram-13' ? 2 : 0), 'Original clip count');
          if (post.slug === 'telegram-13') {
            await shot(`article-video-posters-${key}`, true);
            for (let i = 0; i < 2; i++) {
              const clip = clips.nth(i); await clip.scrollIntoViewIfNeeded();
              ok(await clip.evaluate(v => v.controls && v.preload === 'metadata' && !!v.poster), 'Native video controls and poster');
              await clip.click();
              const state = await clip.evaluate(async v => {
                await v.play();
                await new Promise((resolve,reject) => {const until=Date.now()+10000;const poll=()=>{if(v.currentTime>.15)resolve();else if(v.error||Date.now()>until)reject(Error('Video playback: '+v.error?.message));else setTimeout(poll,100)};poll()});
                v.pause();v.currentTime=Math.min(2,v.duration/2);
                await new Promise((resolve,reject)=>{v.addEventListener('seeked',resolve,{once:true});setTimeout(()=>reject(Error('Video seek timeout')),10000)});
                return {duration:v.duration,time:v.currentTime,width:v.videoWidth,height:v.videoHeight};
              });
              ok(state.duration > 0 && state.time >= 1 && state.width > 0, 'Video decoded, played and sought: '+JSON.stringify(state));
              await shot(`article-video-${i}-${key}`);
            }
          }
          ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Article fits viewport');
          if (['telegram-24','telegram-25'].includes(post.slug)) await shot(`article-${post.slug}-${key}`, true);
        }
        await page.goto(base + '/blog?page=3'); await page.locator('.blog-card').first().waitFor();
        ok(await page.locator('.blog-card').count() === 5, 'Last authored page has five posts');
        await page.locator('.blog-list > a.markdown-card-link').first().click(); await page.locator('.blog-document:not([aria-busy=true])').waitFor();
        await page.goBack(); await page.waitForURL(base + '/blog?page=3'); await page.reload();
        await page.locator('.blog-card').first().waitFor();ok(await page.locator('.blog-card').count()===5,'Article Back and fresh page preserve pagination');
      }
      for (const old of ['flow','noteon']) ok((await page.request.get(base + prefix + '/projects/' + old)).status() === 404, 'Old demo project is not a personal page');
    }
    results.push({ lang, width, authored, badges, video: v, tabs: { first, next, navBox, panelBox } });
  }
  const touchContext = await page.context().browser().newContext({ viewport:{ width:390,height:844 }, hasTouch:true, isMobile:true });
  try {
    const touch = await touchContext.newPage();
    for (const prefix of ['', '/en']) {
      await touch.goto(base + (prefix || '/')); const door = touch.locator('.personal-doors > a').nth(1); await door.tap({ position:{ x:12, y:12 } });
      await touch.waitForURL(base + prefix + '/projects');
      if (authored) {
        for (const id of ['chgs', 'e-doc']) {
          const link = touch.locator(`.personal-projects a[href="${prefix}/projects/${id}"]`);
          await link.tap(); await touch.waitForURL(base + prefix + '/projects/' + id); await touch.goBack();
        }
        await touch.locator('header .brand-lockup').tap(); await touch.waitForURL(base + (prefix || '/'));
        await touch.goto(base + prefix + '/projects');
      }
      await touch.goBack(); await touch.locator('.personal-doors').waitFor();
    }
  } finally { await touchContext.close(); }
  ok(errors.length === 0, errors.join('\n'));
  return { results, actualTouch:true, keyboard:true, newTab:true, freshEntry:true, back:true, errors };
}
try {
  cli('open', 'http://nginx', '--config', '/opt/browser/cli.config.json'); cli('snapshot');
  cli('run-code', `async page => (${check.toString()})(page, ${verifyCatalog.toString()}, ${authored}, ${JSON.stringify(widths)}, ${authored ? readFileSync('../../local/me/tests/fixtures/telegram-import.json','utf8').trim() + '.posts' : '[]'}, ${JSON.stringify(evidenceRoot)})`);
} catch (error) {
  try { cli('run-code', `async page => { await page.screenshot({path:${JSON.stringify(evidenceRoot + '/user-rework-failure.png')},fullPage:true}); return {url:page.url(),body:(await page.locator('body').innerText()).slice(0,2000)}; }`); } catch { /* Original failure is retained in the call log. */ }
  throw error;
} finally { spawnSync('/opt/browser/node_modules/.bin/playwright-cli', ['close'], {encoding:'utf8'}); }
