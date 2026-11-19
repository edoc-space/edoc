import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/** Only run inside the disposable runtime snapshot, never against an author's checkout. */
export function prepareBlogFixture(theme = 'default') {
  if (!process.cwd().startsWith('/app/')) throw new Error('Synthetic content requires the isolated runtime');
  mkdirSync('public/blog/_modules', { recursive: true });
  mkdirSync('.playwright-cli', { recursive: true });
  const site = realpathSync('local/storage/edoc');
  const put = (path, text) => { mkdirSync(dirname(resolve(site, path)), { recursive: true }); writeFileSync(resolve(site, path), text); };
  for (const locale of ['ru', 'en']) {
    for (const section of ['pages', 'docs', 'blog']) rmSync(resolve(site, locale, section), { recursive: true, force: true });
  }
  cpSync('tests/Fixtures/theme-content', site, { recursive: true });
  const config = { title: 'Проверка блога', description: 'Синтетические статьи Markdown и MDX.', default_locale: 'ru', timezone: 'UTC',
    locales: [{ code: 'ru', label: 'Русский' }, { code: 'en', label: 'English', path: '/en' }],
    brand: { name: 'Проверка блога', href: '/' }, navigation: [{ source: 'pages' }, { source: 'docs' }], blog: { enabled: true, page_size: 5 } };
  if (theme === 'local') config.theme = { id: 'local' };
  put('site.json', JSON.stringify(config));
  const meta = (title, date = '2026-04-01T10:00:00Z', draft = false) => `---\ntitle: ${title}\ndescription: 'Markdown и интерактивный MDX & < > "'\ndate: '${date}'\ndraft: ${draft}\ntranslation_key: ${title}\ntags: [php, edoc]\n---\n`;
  for (const locale of ['ru', 'en']) {
    put(`${locale}/blog/p01.md`, meta('Публикация Markdown', '2026-11-10T10:00:00Z') + '## Чтение\n\nBLOG_MARKDOWN_PARITY\n\n[MDX](p04.mdx) · [Страница](../pages/about.md) · [Документация](../docs/specimen.mdx)\n\n![Закрытая иллюстрация][cover]\n\n[cover]: p01/cover.svg\n\n## Код\n\n```php\necho "E-Doc";\n```\n');
    put(`${locale}/blog/p01/cover.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="100"><rect width="420" height="100" fill="#e1edf8"/><text x="24" y="56" fill="#203550">PRIVATE_MARKDOWN_ATTACHMENT</text></svg>');
    put(`${locale}/blog/p04.mdx`, meta('Интерактивная статья') + `import { Counter } from './p04/Counter.jsx'\n\n## Интерактивный блок\n\nBLOG_MDX_PARITY\n\n![Иллюстрация Markdown в MDX](p04/cover.svg)\n\n<Counter />\n\n## Навигация\n\n[Блог](/blog) · [Markdown](p01.md) · [Страница](/about) · [Документация](/docs/specimen)\n`);
    const helper = `import React, { useState, useContext } from 'react';\nimport { useMDXComponents } from '@mdx-js/react';\nimport { MdxLayoutContext } from '@edoc/mdx';\nimport './style.css';\nimport cover from './cover.svg';\nexport function Counter() { const [count, setCount] = useState(0); const components = useMDXComponents(); const layout = useContext(MdxLayoutContext); return <div className="blog-fixture"><p data-context>{layout.locale?.code} / {components.h2 ? 'provider' : 'missing'}</p><button onClick={() => setCount(c => c + 1)}>Счётчик: {count}</button><button onClick={async () => { const m = await import('./lazy.js'); document.querySelector('[data-lazy]').textContent = m.message; }}>Загрузить блок</button><p data-lazy /><img src={cover} alt="Иллюстрация статьи" /></div>; }`;
    put(`${locale}/blog/p04/Counter.jsx`, helper);
    put(`${locale}/blog/p04/style.css`, '.blog-fixture { padding: 1.5rem; border: 1px solid #97b4cc; border-radius: 12px; } .blog-fixture button { padding: .6rem 1rem; margin: .5rem; background: #e0edfa; color: #1c344b; border-radius: 6px; }');
    put(`${locale}/blog/p04/lazy.js`, "import './lazy.css'; export const message = 'LAZY_COMPONENT_READY';");
    put(`${locale}/blog/p04/lazy.css`, '[data-lazy] { font-weight: 700; color: #245537; }');
    put(`${locale}/blog/p04/cover.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><rect width="300" height="60" fill="#e0edf8"/></svg>');
  }
  for (const [slug, draft, date] of [['d02', true, '2026-01-01T00:00:00Z'], ['f02', false, '2026-11-13T12:00:00Z']]) {
    const marker = `SECRET_${slug}_BODY`;
    put(`ru/blog/${slug}.mdx`, meta(slug, date, draft) + `import { value, lazy } from './${slug}/helper.js'\nimport './${slug}/style.css'\nimport image from './${slug}/image.svg'\n\n## ${marker}\n\n{value}\n\n<button onClick={async () => { const result = await lazy(); console.log(result.value); }}>Загрузить закрытый блок</button>\n\n<img src={image} alt="Синтетический закрытый ресурс" />\n`);
    put(`ru/blog/${slug}/helper.js`, `export const value = 'SECRET_${slug}_HELPER'; export async function lazy() { return import('./lazy.js'); }`);
    put(`ru/blog/${slug}/lazy.js`, `export const value = 'SECRET_${slug}_LAZY';`);
    put(`ru/blog/${slug}/style.css`, `@font-face { font-family: 'SECRET_${slug}_FONT'; src: url('./private.woff2') format('woff2'); } .secret-${slug} { font-family: 'SECRET_${slug}_CSS'; }`);
    // Transport fixture, intentionally never selected by a rendered CSS rule.
    put(`ru/blog/${slug}/private.woff2`, `wOF2_SECRET_${slug}_FONT_BYTES`);
    put(`ru/blog/${slug}/image.svg`, `<svg xmlns="http://www.w3.org/2000/svg"><text>SECRET_${slug}_IMAGE</text></svg>`);
  }
  put('ru/blog/f01.md', meta('f01', '2026-11-13T12:00:00Z') + 'SECRET_f01_BODY\n\n![private](f01/hidden.svg)');
  put('ru/blog/f01/hidden.svg', '<svg xmlns="http://www.w3.org/2000/svg"><text>SECRET_f01_IMAGE</text></svg>');
  put('ru/blog/d01.md', meta('d01', '2026-01-01T00:00:00Z', true) + 'SECRET_d01_BODY');
  return { site, config };
}
if (process.argv[1]?.endsWith('blog-fixture.mjs')) prepareBlogFixture(process.argv[2]);
