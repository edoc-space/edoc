import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { prepareMdxComponentsFixture } from './mdx-components-fixture.mjs';

/** One public data set for both themes; authored personal content is never used. */
export function prepareSiteCompositionFixture(theme = 'default') {
  const personal = resolve('../../local/me/tests/fixtures/site-composition');
  // Regression content is deliberately independent of the authored personal site.
  const sourceFiles = new Map();
  const paths = ['components/Projects.tsx', 'components/projects.ts'];
  for (const locale of ['ru', 'en']) {
    for (const name of ['index.mdx', 'projects.mdx', 'about.mdx', 'design-kit.mdx', 'projects/flow.mdx', 'projects/noteon.mdx']) {
      paths.push(`${locale}/pages/${name}`);
    }
  }
  for (const path of paths) sourceFiles.set(path, readFileSync(resolve(personal, path)));
  const fixture = prepareMdxComponentsFixture(theme);
  const put = (path, bytes) => { const file = resolve(fixture.site, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); };
  for (const [path, bytes] of sourceFiles) if (path.startsWith('components/')) put(path, bytes);
  for (const locale of ['ru', 'en']) {
    for (const name of ['index.mdx', 'projects.mdx', 'design-kit.mdx']) {
      const destination = resolve(fixture.site, locale, 'pages', name);
      const text = sourceFiles.get(`${locale}/pages/${name}`);
      writeFileSync(destination, text);
    }
    // Keep accepted docs/about and only replace the synthetic about page in /app.
    rmSync(resolve(fixture.site, locale, 'pages/about.md'), { force: true });
    put(`${locale}/pages/about.mdx`, sourceFiles.get(`${locale}/pages/about.mdx`));
    for (const [path, bytes] of sourceFiles) if (path.startsWith(`${locale}/pages/projects/`)) put(path, bytes);
    const latest = resolve(fixture.site, locale, 'pages/latest.md');
    writeFileSync(latest, '---\ntitle: Latest articles fixture\nlatest_articles:\n  limit: 3\n---\n## Public summaries\n');
    rmSync(resolve(fixture.site, locale, 'pages/index.md'), { force: true });
    const prefix = locale === 'en' ? '/en' : '';
    const article = resolve(fixture.site, locale, 'blog/p04.mdx');
    writeFileSync(article, readFileSync(article, 'utf8') + `\n[${locale === 'ru' ? 'Контакты' : 'Contact'}](${prefix}/about#contacts)\n`);
    writeFileSync(resolve(fixture.site, locale, 'site.json'), JSON.stringify({ navigation: [
      { label: locale === 'ru' ? 'Блог' : 'Blog', href: `${prefix}/blog` },
      { label: locale === 'ru' ? 'Проекты' : 'Projects', href: `${prefix}/projects` },
      { label: locale === 'ru' ? 'О сайте' : 'About', href: `${prefix}/about` },
      { label: locale === 'ru' ? 'Каталог' : 'Catalog', href: `${prefix}/design-kit` },
      { label: 'Docs', href: `${prefix}/docs` },
    ] }));
  }
  return fixture;
}
if (process.argv[1]?.endsWith('/site-composition-fixture.mjs')) prepareSiteCompositionFixture(process.argv[2]);
