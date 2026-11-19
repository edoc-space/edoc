import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { prepareBlogFixture } from './blog-fixture.mjs';

/** Extends the accepted publication fixture; writes synthetic data only in /app. */
export function prepareBlogListFixture(theme = 'default') {
  const fixture = prepareBlogFixture(theme);
  const put = (path, bytes) => {
    const file = resolve(fixture.site, path);
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes);
  };
  const rows = JSON.parse(readFileSync('tests/Fixtures/blog-list.json'));
  for (const [slug, date, tags] of rows) {
    const format = slug === 'p04' || slug === 'p11' ? 'mdx' : 'md';
    let text = ['p01', 'p04'].includes(slug) ? readFileSync(resolve(fixture.site, `ru/blog/${slug}.${format}`), 'utf8')
      : `---\ntitle: ${slug} · Синтетическая статья\ndescription: 'Статья ${slug} & < > "'\ndate: '${date}'\ndraft: false\ntranslation_key: ${slug}\ntags: []\n---\n## Публикация ${slug}\n\nSYNTHETIC_${slug}_BODY\n`;
    text = text.replace(/^date:.*$/m, `date: '${date}'`).replace(/^tags:.*$/m, `tags: ${JSON.stringify(tags)}`)
      .replace(/^translation_key:.*$/m, `translation_key: ${slug}`);
    if (slug === 'p01') text = text.replace(/^title:.*$/m, 'title: p01 · Публикация Markdown').replace(/^---$/m, '---\nimage: /storage/edoc/static/blog-list-cover.svg');
    put(`ru/blog/${slug}.${format}`, text);
    if (['p01', 'p04'].includes(slug)) {
      const original = readFileSync(resolve(fixture.site, `en/blog/${slug}.${format}`), 'utf8');
      put(`en/blog/${slug}.${format}`, original.replace(/^date:.*$/m, `date: '${date}'`)
        .replace(/^tags:.*$/m, `tags: ${JSON.stringify(tags)}`).replace(/^translation_key:.*$/m, `translation_key: ${slug}`));
    }
  }
  put('en/blog/en-only.md', "---\ntitle: English only\ndescription: Only in English\ndate: '2026-05-01'\ntags: [english]\n---\nEN_ONLY_BODY\n");
  for (const [slug, format] of [['d01', 'md'], ['d02', 'mdx'], ['f01', 'md'], ['f02', 'mdx']]) {
    const path = `ru/blog/${slug}.${format}`;
    put(path, readFileSync(resolve(fixture.site, path), 'utf8').replace(/^tags:.*$/m, 'tags: [hidden-only]'));
  }
  put('static/blog-list-cover.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120"><rect width="640" height="120" fill="#e1edf8"/><text x="24" y="65" fill="#203550">E-Doc · Blog</text></svg>');
  return fixture;
}
if (process.argv[1]?.endsWith('/blog-list-fixture.mjs')) prepareBlogListFixture(process.argv[2]);
