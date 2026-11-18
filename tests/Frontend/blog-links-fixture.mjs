import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareBlogFixture } from './blog-fixture.mjs';

/** Regression-only synthetic inputs shared by PHP HTTP and real nginx/FPM. */
export function prepareBlogLinkFixture(theme = 'default') {
  const data = prepareBlogFixture(theme);
  const put = (path, value) => writeFileSync(resolve(data.site, path), value);
  for (const locale of ['ru', 'en']) {
    if (locale === 'en') {
      for (const slug of ['f01', 'f02', 'd01', 'd02']) {
        const extension = slug.endsWith('2') ? 'mdx' : 'md';
        cpSync(resolve(data.site, `ru/blog/${slug}.${extension}`), resolve(data.site, `en/blog/${slug}.${extension}`));
        if (slug !== 'd01') cpSync(resolve(data.site, `ru/blog/${slug}`), resolve(data.site, `en/blog/${slug}`), { recursive: true });
      }
    }
    const md = `${locale}/blog/p01.md`;
    const mdx = `${locale}/blog/p04.mdx`;
    const additions = (sidecar) => `\n\n![Inline fragment](${sidecar}/cover.svg#inline-fragment)\n\n![Encoded reference][encoded]\n\n[encoded]: ${sidecar}/cover.svg#review%20encoded\n\n[PDF inline](${sidecar}/notes.pdf#page=2)\n\n[PDF reference][pdf]\n\n[pdf]: ${sidecar}/notes.pdf#page=2\n`;
    put(md, readFileSync(resolve(data.site, md), 'utf8').replace('p01/cover.svg', 'p01/cover.svg#review-fragment') + additions('p01')
      + '\n[Scheduled article](f02.mdx) [Draft article](d02.mdx)\n');
    put(mdx, readFileSync(resolve(data.site, mdx), 'utf8').replace('p04/cover.svg', 'p04/cover.svg#review-fragment') + additions('p04'));
    for (const slug of ['p01', 'p04']) put(`${locale}/blog/${slug}/notes.pdf`, '%PDF-1.4\n% Synthetic protected attachment\n%%EOF\n');
  }
  for (const locale of ['ru', 'en']) for (const slug of ['d02', 'f02']) {
    const path = `${locale}/blog/${slug}.mdx`;
    put(path, readFileSync(resolve(data.site, path), 'utf8').replace(`title: ${slug}`, `title: HIDDEN_${slug}_TITLE`).replace("description: 'Markdown и интерактивный MDX & < > \"'", `description: HIDDEN_${slug}_DESCRIPTION`));
  }
  return data;
}
