import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engine = process.cwd();
const selection = process.argv[2] ?? 'default';
assert(['default', 'local', '@fixture/installed-theme'].includes(selection));
const site = resolve(engine, 'local/storage/edoc');
const temporary = mkdtempSync(resolve(engine, 'local/storage/theme-check-'));
const backup = `${temporary}/original`;
const content = `${temporary}/content`;
let server;
const results = [];

function command(argv) {
  const result = spawnSync(argv[0], argv.slice(1), { cwd: engine, encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${argv.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  renameSync(site, backup);
  cpSync(resolve(engine, 'tests/Fixtures/theme-content'), content, { recursive: true });
  if (selection === 'local') {
    // Private code stays in its site repository; the synthetic tree only links it.
    const theme = resolve(engine, '../me/theme');
    assert(existsSync(theme), 'The private theme must be available in this workspace.');
    symlinkSync(theme, `${content}/theme`);
  } else if (selection === '@fixture/installed-theme') {
    const installed = `${content}/node_modules/@fixture/installed-theme`;
    mkdirSync(installed, { recursive: true });
    cpSync(resolve(engine, 'tests/Fixtures/installed-theme'), installed, { recursive: true });
  }
  const config = {
    title: 'Проверка тем', description: 'Одинаковые синтетические данные для двух тем.',
    default_locale: 'ru', locales: [{ code: 'ru', label: 'Русский' }, { code: 'en', label: 'English', path: '/en' }],
    brand: { name: 'Проверка тем', href: '/' },
    navigation: [{ source: 'pages' }, { source: 'docs' }],
  };
  if (selection !== 'default') config.theme = { id: selection };
  writeFileSync(`${content}/site.json`, JSON.stringify(config));
  symlinkSync(content, site);
  command(['yarn', 'build']);
  const manifest = JSON.parse(readFileSync('public/build/theme.json', 'utf8'));
  assert.equal(manifest.id, selection);
  assert.equal(manifest.contractVersion, 1);
  assert(!JSON.stringify(manifest).includes(engine));
  const vite = JSON.parse(readFileSync('public/build/.vite/manifest.json', 'utf8'));
  const css = readFileSync(`public/build/${vite['resources/js/app.tsx'].css[0]}`, 'utf8');
  const privateCssPath = resolve(engine, '../me/theme/theme.css');
  if (existsSync(privateCssPath)) {
    // Read the private input in place; never copy its palette/selectors into public fixtures.
    const property = '--color-body-bg';
    const valueOf = (source) => source.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1].trim();
    const privateValue = valueOf(readFileSync(privateCssPath, 'utf8'));
    const defaultValue = valueOf(readFileSync('resources/js/Themes/default/theme.css', 'utf8'));
    assert(privateValue && defaultValue && privateValue !== defaultValue);
    if (selection === 'local') {
      assert(css.lastIndexOf(`${property}:${privateValue}`) > css.indexOf(`${property}:${defaultValue}`), 'Selected tokens must override default tokens.');
    } else {
      assert(!css.includes(`${property}:${privateValue}`), 'Private theme must not be in public outputs.');
    }
  }
  // The resolver must accept the exact manifest emitted by the real Vite build.
  const validation = command(['php', '-r', "require 'vendor/autoload.php'; $r=new App\\Feature\\Theme\\ThemeResolver(getcwd(), getcwd().'/local/storage/edoc'); if ($r->diagnostic(json_decode(file_get_contents('public/build/theme.json'),true))!==null) exit(1);"]);
  void validation;
  const port = 18743;
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public', 'tests/Support/theme-http-router.php'], {
    cwd: engine, env: { ...process.env, APP_ENV: 'prod', APP_DEBUG: '0', VITE_DEV_SERVER: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let started = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await fetch(base); started = true; break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert(started, `PHP HTTP server did not start: ${serverLog}`);
  for (const [path, status, component] of [
    ['/', 200, 'Web/Page/Show'], ['/about', 200, 'Web/Page/Show'],
    ['/docs/specimen', 200, 'Web/Documentation/Show'], ['/en', 200, 'Web/Page/Show'],
    ['/en/docs/specimen', 200, 'Web/Documentation/Show'], ['/missing', 404, 'Web/Error/Show'],
    ['/?theme=../../secret', 200, 'Web/Page/Show'],
  ]) {
    const response = await fetch(`${base}${path}`);
    const html = await response.text();
    assert.equal(response.status, status, `${path}: ${html}\n${serverLog}`);
    const json = html.match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    assert(json, `Missing initial Inertia data at ${path}: ${html}\n${serverLog}`);
    const page = JSON.parse(json);
    assert.equal(page.component, component);
    assert(!JSON.stringify(page.props).includes(temporary));
    if (path === '/about') assert(page.props.page.document.html.includes('THEME_PARITY_MARKER'));
    if (path === '/docs/specimen') {
      assert(page.props.documentation.toc.length >= 3);
      assert(page.props.documentation.search.length > 0);
      assert.equal(page.props.documentation.document.format, 'mdx');
    }
    results.push({ path, status: response.status, component });
  }
  assert.equal(manifest.schemaVersion, 2);
  assert(Object.keys(manifest.inputs).some((key) => key.endsWith(':resources/images/logo.svg')), 'Default component asset is a consumed build input.');
  const logoPath = resolve(engine, 'resources/images/logo.svg');
  const originalLogo = readFileSync(logoPath, 'utf8');
  try {
    writeFileSync(logoPath, originalLogo + '\n<!-- changed build input -->');
    const staleAsset = await fetch(base);
    assert.equal(staleAsset.status, 503);
    assert((await staleAsset.text()).includes('theme.stale'));
  } finally {
    writeFileSync(logoPath, originalLogo);
  }
  assert.equal((await fetch(base)).status, 200, 'Asset recovery');
  if (selection !== 'default') {
    const descriptorPath = selection === 'local' ? `${content}/theme/theme.json` : `${content}/node_modules/@fixture/installed-theme/theme.json`;
    const descriptor = readFileSync(descriptorPath, 'utf8');
    try {
      writeFileSync(descriptorPath, JSON.stringify({ contractVersion: 1, entry: 'bad\u0000.tsx' }));
      for (const method of ['GET', 'HEAD']) {
        const invalid = await fetch(base, { method });
        assert.equal(invalid.status, 503);
        assert.equal(invalid.headers.get('cache-control'), 'no-store');
        const body = await invalid.text();
        if (method === 'HEAD') assert.equal(body, '');
        else assert(body.includes('theme.invalid'));
        assert(!body.includes(engine) && !body.includes(content) && !body.includes('Stack trace'));
      }
    } finally {
      writeFileSync(descriptorPath, descriptor);
    }
    assert.equal((await fetch(base)).status, 200, 'NUL entry recovery');
  }
  config.theme = { id: '../../invalid' };
  writeFileSync(`${content}/site.json`, JSON.stringify(config));
  const unknown = await fetch(base);
  assert.equal(unknown.status, 503);
  assert((await unknown.text()).includes('theme.unknown'));
  config.theme = { id: selection === 'default' ? 'local' : 'default' };
  if (selection === 'default') config.theme = { id: '@fixture/missing' };
  writeFileSync(`${content}/site.json`, JSON.stringify(config));
  if (selection !== 'default') {
    const stale = await fetch(base);
    assert.equal(stale.status, 503);
    assert((await stale.text()).includes('theme.stale'));
  }
  const { inputs, ...manifestSummary } = manifest;
  console.log(JSON.stringify({ selection, manifest: { ...manifestSummary, inputCount: Object.keys(inputs).length }, http: results, negative: ['unknown HTTP input ignored', 'unknown root selection rejected', ...(selection !== 'default' ? ['changed selection stale'] : [])] }, null, 2));
} finally {
  if (server) {
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
  }
  if (existsSync(backup)) {
    rmSync(site, { force: true, recursive: true });
    renameSync(backup, site);
  }
  rmSync(temporary, { recursive: true, force: true });
}
