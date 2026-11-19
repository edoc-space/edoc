import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareBlogFixture } from './blog-fixture.mjs';

const { site } = prepareBlogFixture();
const article = resolve(site, 'ru/blog/p04.mdx');
const app = resolve('resources/js/app.tsx');
const css = resolve('resources/js/styles.css');
const counter = resolve(site, 'ru/blog/p04/Counter.jsx');
const records = [];
const selected = process.env.EDOC_BOUNDARY_CASES?.split(',');
const build = () => spawnSync('node', ['tool/build-site.mjs'], { encoding: 'utf8', env: process.env });
function reject(name, file, change, expected = /blog\.(?:graph|public)/) {
  if (selected && !selected.includes(name)) return;
  const original = readFileSync(file, 'utf8');
  try {
    writeFileSync(file, change(original));
    const result = build();
    writeFileSync(`/evidence/boundary-${name}.log`, result.stdout + result.stderr);
    assert.notEqual(result.status, 0, name + ': invalid graph accepted');
    assert.match(result.stdout + result.stderr, expected, name + ': wrong failure');
    records.push(name);
  } finally { writeFileSync(file, original); }
}
reject('public-entry', app, (s) => s + "\nimport '/local/storage/edoc/ru/blog/d02.mdx';");
reject('public-raw', app, (s) => s + "\nimport raw from '/local/storage/edoc/ru/blog/d02/helper.js?raw'; console.log(raw);");
reject('public-url', app, (s) => s + "\nimport raw from '/local/storage/edoc/ru/blog/d02/image.svg?url'; console.log(raw);");
reject('public-glob', app, (s) => s + "\nconsole.log(import.meta.glob('/local/storage/edoc/ru/blog/**/*.mdx'));");
reject('public-css', css, (s) => "@import '/local/storage/edoc/ru/blog/d02/style.css';\n" + s);
reject('public-css-url', css, (s) => s + "\n.leak { background: url('/local/storage/edoc/ru/blog/d02/image.svg'); }");
reject('cross-entry', article, (s) => s + "\nimport Other from './d02.mdx'\n\n<Other />\n");
reject('cross-helper', counter, (s) => s + "\nimport { value } from '../d02/helper.js'; console.log(value);");
reject('cross-lazy', counter, (s) => s + "\nexport const other = () => import('../d02/helper.js');");
reject('cross-css', resolve(site, 'ru/blog/p04/style.css'), (s) => "@import '../d02/style.css';\n" + s);
reject('cross-css-url', resolve(site, 'ru/blog/p04/style.css'), (s) => s + "\n.leak { background: url('../d02/image.svg'); }");
reject('cross-raw', counter, (s) => s + "\nimport raw from '../d02/helper.js?raw'; console.log(raw);");
reject('cross-url', counter, (s) => s + "\nimport raw from '../d02/image.svg?url'; console.log(raw);");
reject('cross-glob', counter, (s) => s + "\nconsole.log(import.meta.glob('../d02/*.js'));");
reject('computed-import', counter, (s) => s + "\nexport const unsafe = (path) => import(path);");
reject('ignored-import', counter, (s) => s + "\nexport const unsafe = () => import(/* @vite-ignore */ './lazy.js');");
reject('network-import', counter, (s) => s + "\nimport 'https://example.test/runtime.js';");
reject('runtime-deep', counter, (s) => s + "\nimport 'react/cjs/react.production.js';");
reject('worker-query', counter, (s) => s + "\nimport WorkerEntry from './lazy.js?worker'; console.log(WorkerEntry);");
reject('public-worker', app, (s) => s + "\nnew Worker(new URL('/local/storage/edoc/ru/blog/d02/helper.js', import.meta.url), {type:'module'});");
const workerProbe = resolve('resources/js/Blog/worker-probe.js');
writeFileSync(workerProbe, "import '/local/storage/edoc/ru/blog/d02/helper.js';");
try { reject('public-worker-transitive', app, (s) => s + "\nnew Worker(new URL('./Blog/worker-probe.js', import.meta.url), {type:'module'});"); } finally { unlinkSync(workerProbe); }
reject('worker', counter, (s) => s + "\nexport const unsafe = () => new Worker(new URL('./lazy.js', import.meta.url));");
reject('computed-url', counter, (s) => s + "\nexport const unsafe = (path) => new URL(path, import.meta.url);");
const link = resolve(site, 'ru/blog/p04/alias.js');
if (!selected || selected.includes('symlink')) {
symlinkSync(resolve(site, 'ru/blog/d02/helper.js'), link);
try {
  const result = build();
  writeFileSync('/evidence/boundary-symlink.log', result.stdout + result.stderr);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /blog\.path: symlink/);
  records.push('symlink');
} finally { unlinkSync(link); }
}
const valid = build();
writeFileSync('/evidence/boundary-recovery.log', valid.stdout + valid.stderr);
assert.equal(valid.status, 0, valid.stdout + valid.stderr);
writeFileSync('/evidence/blog-boundaries.json', JSON.stringify({ rejected: records, validRecovery: true }, null, 2));
console.log('Rejected boundaries:', records.length);
