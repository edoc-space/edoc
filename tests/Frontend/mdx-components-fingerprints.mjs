import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Runs after an existing production build; mutates only disposable fixture inputs. */
export function verifyMdxFingerprints(fixture) {
  if (!process.cwd().startsWith('/app/')) throw new Error('Fingerprint mutation requires disposable runtime');
const manifest = JSON.parse(readFileSync('public/build/theme.json', 'utf8'));
assert(Object.keys(manifest.inputs).some(key => key.endsWith(':components/LocalProbe.tsx')), 'Local TSX fingerprint');
assert(Object.keys(manifest.inputs).some(key => key.endsWith(':components/probe.css')), 'Local CSS fingerprint');
assert(Object.keys(manifest.inputs).some(key => key.endsWith(':@fixture/mdx-components/index.jsx')), 'Installed module fingerprint');
const active = JSON.parse(readFileSync('local/build/blog/active.json', 'utf8'));
writeFileSync('/evidence/pc3-private-inputs.json', JSON.stringify(Object.fromEntries(Object.entries(active.articles).map(([key,value])=>[key, {locale:value.locale, slug:value.slug, inputs:value.inputs, css:value.css}])), null, 2));
for (const locale of ['ru', 'en']) {
  const entry = Object.values(active.articles).find(article => article.locale === locale && article.slug === 'p04');
  assert(entry, locale + ' private article');
  assert(entry.inputs['site:components/LocalProbe.tsx'], 'Private local source fingerprint');
  assert(Object.keys(entry.inputs).some(key => key.endsWith(':@fixture/mdx-components/index.jsx')), 'Private installed source fingerprint');
  assert(Object.keys(entry.inputs).some(key => key.endsWith(':@fixture/mdx-components/style.css')), 'Private installed CSS fingerprint');
  assert(entry.css.length > 0, 'Private stylesheet descriptors');
}
const diagnostic = () => {
  const result = spawnSync('php', ['-r', "require 'vendor/autoload.php'; $r=new App\\Feature\\Theme\\ThemeResolver(getcwd(),realpath('local/storage/edoc')); echo json_encode($r->diagnostic(json_decode(file_get_contents('public/build/theme.json'),true)));"], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
};
const privateDiagnostic = () => {
  const code = "require 'vendor/autoload.php'; $root=realpath('local/storage/edoc'); $storage=new PhpSoftBox\\Storage\\Storage(['default'=>'edoc_site','disks'=>['edoc_site'=>['driver'=>'local','rootPath'=>$root]]]); $locales=new App\\Feature\\Site\\SiteLocaleResolver($storage); $repository=new App\\Feature\\Blog\\BlogRepository($root,$locales); $build=new App\\Feature\\Blog\\BlogBuild($repository,getcwd(),getcwd().'/local/build/blog'); try { $build->descriptor($repository->records($locales->default())['p04']); echo 'null'; } catch (App\\Feature\\Blog\\BlogException $exception) { echo json_encode($exception->getMessage()); }";
  const result = spawnSync('php', ['-r', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
};
assert.equal(diagnostic(), null, 'Fresh production graph');
assert.equal(privateDiagnostic(), null, 'Fresh private component graph');
for (const path of [resolve(fixture.site, 'components/LocalProbe.tsx'), resolve(fixture.site, 'components/probe.css'), resolve(fixture.packageRoot, 'index.jsx'), resolve(fixture.packageRoot, 'style.css')]) {
  const original = readFileSync(path, 'utf8');
  try { writeFileSync(path, original + '\n/* fingerprint changed */\n'); assert.equal(diagnostic()?.code, 'theme.stale', path); assert.match(privateDiagnostic(), /^blog\.stale:/, 'Private component freshness: ' + path); }
  finally { writeFileSync(path, original); }
  assert.equal(diagnostic(), null, 'Fingerprint recovery');
  assert.equal(privateDiagnostic(), null, 'Private fingerprint recovery');
}
console.log('PC3 production: pages/docs/private blog, TSX/package/CSS fingerprints and recovery passed.');

}
