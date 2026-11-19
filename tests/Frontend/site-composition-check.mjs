import assert from 'node:assert/strict';
import { verifyCatalog } from './catalog-browser.mjs';
import { verifyMdxComponents } from './mdx-components-check.mjs';

export async function verifySiteComposition(page, base = 'http://nginx') {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const capture = async (name, mobile = false) => {
    await page.screenshot({ path: `/evidence/${name}-${mobile ? '390' : '1440'}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' horizontal overflow');
  };
  for (const width of [1440, 390]) {
    const mobile = width === 390;
    await page.setViewportSize({ width, height: mobile ? 844 : 1000 });
    for (const prefix of ['', '/en']) {
      const response = await page.goto(base + (prefix || '/'));
      assert.equal(response.status(), 200);
      await page.locator('.latest-articles .blog-card').first().waitFor();
      assert.equal(await page.locator('.latest-articles .blog-card').count(), 2);
      await capture(prefix ? 'home-en' : 'home', mobile);
      const projects = page.locator('.personal-projects');
      assert.equal(await projects.getByRole('article').count(), 2);
      await page.locator(`.markdown-hero__actions a[href="${prefix}/projects"]`).click();
      await projects.waitFor();
      const initialHrefs = await projects.locator('h2 a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
      assert.deepEqual(initialHrefs, [prefix + '/projects/flow', prefix + '/projects/noteon']);
      const buttons = projects.locator('.collection-filter-options button');
      await buttons.nth(2).click();
      assert.equal(await projects.getByRole('article').count(), 1);
      assert.equal(await projects.locator('h2 a').getAttribute('href'), prefix + '/projects/noteon');
      await buttons.nth(3).click();
      await projects.locator('.collection-empty').waitFor();
      await capture(prefix ? 'projects-empty-en' : 'projects-empty', mobile);
      await buttons.nth(0).click();
      await capture(prefix ? 'projects-en' : 'projects', mobile);
      for (const id of ['flow', 'noteon']) {
        await projects.locator(`h2 a[href="${prefix}/projects/${id}"]`).click();
        await page.locator('.personal-detail-head').waitFor();
        assert((await page.locator('h1').textContent()).toLowerCase().includes(id));
        await capture((prefix ? 'en-' : '') + id, mobile);
        await page.locator(`a[href="${prefix}/blog/p04"]`).first().click();
        await page.locator('.blog-document').getByText('BLOG_MDX_PARITY', { exact: true }).waitFor();
        await capture(prefix ? 'article-en' : 'article', mobile);
        await page.locator(`.blog-document a[href="${prefix}/about#contacts"]`).click();
        await page.locator('#contacts').waitFor();
        await page.goBack();
        await page.locator('.blog-document').getByText('BLOG_MDX_PARITY', { exact: true }).waitFor();
        await page.goBack(); await page.locator('.personal-detail-head').waitFor();
        await page.goto(base + prefix + '/projects');
      }
      await page.goto(base + prefix + '/about#contacts');
      await page.locator('#contacts').waitFor();
      assert.equal(await page.locator('a[href="mailto:hello@example.com"]').count(), 1, 'Contact DOM: ' + await page.locator('#contacts').innerHTML());
      await capture(prefix ? 'about-en' : 'about', mobile);
      await page.goto(base + prefix + '/design-kit');
      await page.locator('[data-blocks-catalog]').waitFor();
      await verifyCatalog(page);
      await capture(prefix ? 'catalog-en' : 'catalog', mobile);
      await page.goto(base + (prefix ? prefix + '/blog' : '/blog/tags/php?year=2026&page=2'));
      await page.locator('.blog-card').first().waitFor();
      assert.equal(await page.locator('.blog-card').count(), prefix ? 3 : 1);
      if (!prefix) {
        const selected = base + '/blog/tags/php?year=2026&page=2';
        const allTags = page.locator('.collection-filters').first().getByRole('link').first();
        await allTags.focus(); await page.keyboard.press('Enter');
        await page.waitForURL(base + '/blog/archive/2026');
        await page.locator('.blog-card').first().waitFor();
        assert.equal(await page.locator('.blog-card').count(), 5, 'Changing a filter resets page');
        await page.goBack(); await page.waitForURL(selected);
        await page.locator('.blog-card').first().waitFor();
        assert.equal(await page.locator('.blog-card').count(), 1, 'Back restores selection');
        await page.reload(); await page.locator('.blog-card').first().waitFor();
        assert.equal(await page.locator('.blog-card').count(), 1, 'Reload preserves server selection');
      }
      await capture(prefix ? 'blog-en' : 'blog', mobile);
      const rss = page.locator('a.blog-rss'); assert.equal(await rss.getAttribute('href'), prefix + '/blog/rss.xml');
      if (mobile && !prefix) {
        const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
        await menu.focus(); await page.keyboard.press('Enter');
        await page.getByRole('dialog').waitFor();
        await capture('mobile-menu', true);
        await page.keyboard.press('Escape');
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await verifyMdxComponents(page, base, true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base);
  await page.locator('.latest-articles .blog-card').first().waitFor();
  assert(await page.locator('body').evaluate(node => getComputedStyle(node).scrollBehavior !== 'smooth'));
  await page.locator('a').first().focus();
  await page.keyboard.press('Tab');
  await capture('reduced-motion-keyboard');
  assert.deepEqual(errors, []);
  return { widths: [1440, 390], locales: ['ru', 'en'], projects: ['flow', 'noteon'], filters: true, catalog: true, mdx: true, rssLink: true, errors };
}
