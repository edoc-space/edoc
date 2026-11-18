import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import { siteThemePlugin } from '../../tool/theme-plugin.js';

const engine = process.cwd();
mkdirSync(resolve(engine, 'local/tests'), { recursive: true });
const site = mkdtempSync(resolve(engine, 'local/tests/theme-inputs-'));
const outside = mkdtempSync(resolve(tmpdir(), 'edoc-theme-outside-'));
const write = (path, value) => writeFileSync(resolve(site, path), value);
const diagnostic = (manifest) => {
    const result = spawnSync('php', ['-r', "require 'vendor/autoload.php'; $r=new App\\Feature\\Theme\\ThemeResolver(getcwd(),$argv[1]); echo json_encode($r->diagnostic(json_decode(stream_get_contents(STDIN),true)));", site], {
        encoding: 'utf8', input: JSON.stringify(manifest),
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
};
const compile = async () => {
    const result = await build({
        configFile: false, root: engine, logLevel: 'silent', plugins: [siteThemePlugin(engine, site)],
        build: { write: false, lib: { entry: `${site}/probe.js`, formats: ['es'] } },
    });
    const output = Array.isArray(result) ? result.flatMap((item) => item.output) : result.output;
    return { manifest: JSON.parse(output.find((item) => item.fileName === 'theme.json').source), code: output.filter((item) => item.fileName !== 'theme.json').map((item) => item.type === 'chunk' ? item.code : item.source).join('\n') };
};
try {
    mkdirSync(`${site}/theme`, { recursive: true });
    mkdirSync(`${site}/node_modules/fixture-input`, { recursive: true });
    write('site.json', JSON.stringify({ theme: { id: 'local' } }));
    write('theme/theme.json', JSON.stringify({ contractVersion: 1, entry: 'index.js' }));
    const entry = "import './styles.css'; import {value} from '../shared.js'; import asset from '../asset.svg?raw'; import {dependency} from 'fixture-input'; export default {contractVersion:1,slots:{Header:()=>value+asset+dependency}};";
    write('theme/index.js', entry);
    write('theme/styles.css', "@import '../shared.css'; .asset { background-image: url('../style-asset.svg?inline'); }");
    write('probe.js', "export {default} from 'virtual:edoc-theme';");
    write('node_modules/fixture-input/package.json', JSON.stringify({ name: 'fixture-input', type: 'module', exports: './index.js' }));
    const sources = {
        'shared.js': "export const value='helper-before';",
        'asset.svg': '<svg>asset-before</svg>',
        'style-asset.svg': '<svg>css-asset-before</svg>',
        'shared.css': '.shared { --example: before; }',
        'node_modules/fixture-input/index.js': "export const dependency='dependency-before';",
    };
    for (const [path, value] of Object.entries(sources)) write(path, value);
    const original = await compile();
    assert.equal(original.manifest.schemaVersion, 2);
    assert.equal(diagnostic(original.manifest), null);
    for (const [path, value] of Object.entries(sources)) {
        write(path, value.replaceAll('before', 'after'));
        assert.equal(diagnostic(original.manifest)?.code, 'theme.stale', path);
        const changed = await compile();
        assert.notEqual(changed.code, original.code, `${path} must be really consumed`);
        assert.notEqual(changed.manifest.fingerprint, original.manifest.fingerprint, path);
        assert.equal(diagnostic(changed.manifest), null);
        write(path, value);
        assert.equal(diagnostic(original.manifest), null);
    }
    write('node_modules/fixture-input/package.json', JSON.stringify({ name: 'fixture-input', type: 'module', exports: './alternate.js' }));
    assert.equal(diagnostic(original.manifest)?.code, 'theme.stale', 'Package resolution metadata');
    writeFileSync(`${outside}/helper.js`, 'export const outside=1;');
    write('theme/index.js', `import {outside} from ${JSON.stringify(`${outside}/helper.js`)}; export default {contractVersion:1,slots:{Header:()=>outside}};`);
    await assert.rejects(compile(), /theme.invalid: Импорт вне корней/);
    console.log(JSON.stringify({ passed: ['consumed external helper', 'consumed asset', 'consumed npm module', 'CSS @import', 'inline CSS url asset', 'package exports metadata', 'recovery', 'unsupported external import rejected'], schemaVersion: 2, inputCount: Object.keys(original.manifest.inputs).length }));
} finally {
    rmSync(site, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
}
