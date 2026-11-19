import assert from 'node:assert/strict';
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareSiteCompositionFixture } from './site-composition-fixture.mjs';

/** Host recipe entry: regression default, authored me. Only disposable /app snapshots. */
export function prepareSiteAcceptance(theme = 'default') {
  assert(process.cwd().startsWith('/app/'), 'Acceptance preparation requires a disposable runtime');
  assert(['default', 'local'].includes(theme), 'Expected default or local');
  if (theme === 'default') return prepareSiteCompositionFixture(theme);
  const site = realpathSync(resolve('local/storage/edoc'));
  assert.equal(site, resolve('/app/local/me'), 'runtime-site.php me must select the authored site');
  const config = JSON.parse(readFileSync(resolve(site, 'site.json')));
  assert.equal(config.brand.name, 'Anton', 'Authored brand must survive preparation');
  assert.equal(config.theme.id, 'local');
  for (const locale of ['ru', 'en']) {
    assert(existsSync(resolve(site, locale, 'pages/index.mdx')));
    assert(!existsSync(resolve(site, locale, 'blog/p01.md')), 'Synthetic blog must not replace authored content');
  }
  return { site, theme, authored: true };
}
if (process.argv[1]?.endsWith('/site-acceptance-prepare.mjs')) prepareSiteAcceptance(process.argv[2]);
