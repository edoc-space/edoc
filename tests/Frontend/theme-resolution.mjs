import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import { siteThemePlugin } from '../../tool/theme-plugin.js';

// Real production bundles: a changed dependency must change output AND invalidate
// the old manifest before rebuilding. No package installation or network involved.
const engine = process.cwd();
mkdirSync(resolve(engine, 'local/tests'), { recursive: true });
const site = mkdtempSync(resolve(engine, 'local/tests/theme-resolution-'));
const write = (path, value) => {
    const full = resolve(site, path);
    mkdirSync(resolve(full, '..'), { recursive: true });
    writeFileSync(full, value);
};
const diagnostic = (manifest) => {
    const result = spawnSync('php', ['-r', "require 'vendor/autoload.php'; $r=new App\\Feature\\Theme\\ThemeResolver(getcwd(),$argv[1]); echo json_encode($r->diagnostic(json_decode(stream_get_contents(STDIN),true)));", site], { encoding: 'utf8', input: JSON.stringify(manifest) });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
};
const compile = async (plugins = []) => {
    const result = await build({
        configFile: false, root: site, publicDir: false, logLevel: 'silent',
        plugins: [siteThemePlugin(engine, site), ...plugins],
        build: { write: false, minify: false, rollupOptions: { input: `${site}/probe.js` } },
    });
    const output = Array.isArray(result) ? result.flatMap(item => item.output) : result.output;
    return {
        manifest: JSON.parse(output.find(item => item.fileName === 'theme.json').source),
        code: output.filter(item => item.fileName !== 'theme.json').map(item => item.type === 'chunk' ? item.code : item.source).join('\n'),
    };
};
const results = [];
const check = async (name, scenario) => {
    try { await scenario(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
};
try {
    write('site.json', JSON.stringify({ theme: { id: 'local' } }));
    write('theme/theme.json', JSON.stringify({ contractVersion: 1, entry: 'index.js' }));
    write('probe.js', "import theme from 'virtual:edoc-theme'; console.log(theme);");
    // Relative addWatchFile is relative to process.cwd(), even when Vite root
    // differs. Exercise load/transform/buildStart and object hook metadata.
    for (const hook of ['load', 'transform', 'buildStart']) {
        for (const form of ['absolute', 'relative', 'dot-relative']) {
            await check(`watch ${hook} ${form}`, async () => {
                write('theme/index.js', "import value from 'virtual:theme-data'; export default {contractVersion:1,value};");
                write('metadata.txt', 'watch-before');
                const absolute = resolve(site, 'metadata.txt');
                const watch = form === 'absolute' ? absolute : `${form === 'dot-relative' ? './' : ''}${relative(engine, absolute)}`;
                const reportWatch = function () { this.addWatchFile(watch); };
                const plugin = {
                    name: 'generated-theme-data',
                    resolveId(id) { if (id === 'virtual:theme-data') return '\0theme-data'; },
                    load(id) {
                        if (id !== '\0theme-data') return;
                        if (hook === 'load') reportWatch.call(this);
                        return `export default ${JSON.stringify(readFileSync(absolute, 'utf8'))};`;
                    },
                    ...(hook === 'buildStart' ? { buildStart: { order: 'pre', handler: reportWatch } } : {}),
                    ...(hook === 'transform' ? { transform: { handler(code, id) { if (id === '\0theme-data') reportWatch.call(this); return null; } } } : {}),
                };
                const original = await compile([plugin]);
                assert.equal(diagnostic(original.manifest), null);
                write('metadata.txt', 'watch-after');
                const stale = diagnostic(original.manifest);
                const changed = await compile([plugin]);
                assert.notEqual(changed.code, original.code, 'watch input is really consumed');
                assert.equal(stale?.code, 'theme.stale', 'old manifest before rebuild');
                assert.notEqual(changed.manifest.fingerprint, original.manifest.fingerprint);
                assert.equal(diagnostic(changed.manifest), null);
                write('metadata.txt', 'watch-before');
                assert.equal(diagnostic(original.manifest), null, 'recovery');
            });
        }
    }
    for (const specifier of ['@input/helper', 'plain-helper', '@input/alias']) {
        for (const alias of [false, true]) {
            await check(`nested lookup ${specifier} ${alias ? 'symlink' : 'directory'}`, async () => {
                rmSync(`${site}/theme/node_modules`, { recursive: true, force: true });
                write('theme/index.js', `import {value} from '${specifier}'; export default {contractVersion:1,value};`);
                const descriptor = JSON.stringify({ name: specifier === '@input/alias' ? 'different-package-name' : specifier, type: 'module', exports: './index.js' });
                write(`node_modules/${specifier}/package.json`, descriptor);
                write(`node_modules/${specifier}/index.js`, "export const value='outer-package';");
                // Scope already exists: adding its child must be detected.
                write('theme/node_modules/@input/unrelated/package.json', '{"name":"@input/unrelated"}');
                if (alias) {
                    mkdirSync(`${site}/lookup-target`, { recursive: true });
                    rmSync(`${site}/theme/node_modules`, { recursive: true, force: true });
                    symlinkSync(`${site}/lookup-target`, `${site}/theme/node_modules`);
                    write('theme/node_modules/@input/unrelated/package.json', '{"name":"@input/unrelated"}');
                }
                const original = await compile();
                assert.equal(diagnostic(original.manifest), null);
                write(`theme/node_modules/${specifier}/package.json`, descriptor);
                write(`theme/node_modules/${specifier}/index.js`, "export const value='nearer-package';");
                const stale = diagnostic(original.manifest);
                const changed = await compile();
                assert.notEqual(changed.code, original.code, 'nearer package changes real output');
                assert.equal(stale?.code, 'theme.stale', 'shadowing before rebuild');
                assert.notEqual(changed.manifest.fingerprint, original.manifest.fingerprint);
                assert.equal(diagnostic(changed.manifest), null);
                rmSync(`${site}/theme/node_modules/${specifier}`, { recursive: true });
                assert.equal(diagnostic(original.manifest), null, 'recovery after removing nearer package');
                assert.equal(diagnostic(changed.manifest)?.code, 'theme.stale', 'removed consumed package');
                if (alias) rmSync(`${site}/lookup-target`, { recursive: true, force: true });
            });
        }
    }
    // File AND directory are the public addWatchFile forms. Directory watches
    // consume the whole declared tree, including nested/hidden dependency files.
    const readTree = (directory) => readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(item => item.isDirectory() ? [item.name, readTree(`${directory}/${item.name}`)]
            : [item.name, readFileSync(`${directory}/${item.name}`, 'utf8')]);
    for (const hook of ['load', 'transform', 'buildStart']) {
        for (const form of ['absolute', 'relative', 'dot-relative', 'symlink']) {
            await check(`directory watch ${hook} ${form}`, async () => {
                rmSync(`${site}/directory-data`, { recursive: true, force: true });
                write('directory-data/nested/input.txt', 'before');
                write('directory-data/.cache/control.txt', 'cache-before');
                const directory = resolve(site, 'directory-data');
                const alias = `${site}/directory-alias`;
                rmSync(alias, { force: true });
                symlinkSync(directory, alias);
                const watch = form === 'absolute' ? directory : form === 'symlink' ? alias
                    : `${form === 'dot-relative' ? './' : ''}${relative(engine, directory)}`;
                write('theme/index.js', "import value from 'virtual:directory-data'; export default {contractVersion:1,value};");
                const reportWatch = function () { this.addWatchFile(watch); };
                const plugin = {
                    name: 'directory-generated-data',
                    resolveId(id) { if (id === 'virtual:directory-data') return '\0directory-data'; },
                    load(id) {
                        if (id !== '\0directory-data') return;
                        if (hook === 'load') reportWatch.call(this);
                        return `export default ${JSON.stringify(readTree(directory))};`;
                    },
                    ...(hook === 'buildStart' ? { buildStart: { order: 'pre', handler: reportWatch } } : {}),
                    ...(hook === 'transform' ? { transform: { handler(code, id) { if (id === '\0directory-data') reportWatch.call(this); return null; } } } : {}),
                };
                const original = await compile([plugin]);
                assert.equal(diagnostic(original.manifest), null);
                const mutations = [
                    ['content', () => write('directory-data/nested/input.txt', 'after'), () => write('directory-data/nested/input.txt', 'before')],
                    ['add', () => write('directory-data/new/deep.txt', 'added'), () => rmSync(`${directory}/new`, { recursive: true })],
                    ['remove', () => rmSync(`${directory}/nested/input.txt`), () => write('directory-data/nested/input.txt', 'before')],
                    ['hidden-content', () => write('directory-data/.cache/control.txt', 'cache-after'), () => write('directory-data/.cache/control.txt', 'cache-before')],
                ];
                for (const [name, mutate, recover] of mutations) {
                    mutate();
                    const stale = diagnostic(original.manifest);
                    const changed = await compile([plugin]);
                    assert.notEqual(changed.code, original.code, `${name}: real output changes`);
                    assert.equal(stale?.code, 'theme.stale', `${name}: old manifest before rebuild`);
                    assert.notEqual(changed.manifest.fingerprint, original.manifest.fingerprint, name);
                    assert.equal(diagnostic(changed.manifest), null, `${name}: rebuilt manifest`);
                    recover();
                    assert.equal(diagnostic(original.manifest), null, `${name}: recovery`);
                }
                assert(!JSON.stringify(original.manifest).includes(engine), 'No absolute paths');
            });
        }
    }
    // Consume through each declared alias: changing a link must invalidate
    // resolution identity even while the old canonical target remains intact.
    for (const kind of ['file', 'directory']) {
        for (const topology of ['leaf', 'ancestor', 'chain', 'shared']) {
            for (const form of ['absolute', 'relative']) {
                await check(`alias retarget ${kind} ${topology} ${form}`, async () => {
                    const base = `${site}/alias-case`;
                    rmSync(base, { recursive: true, force: true });
                    const link = (path, target) => {
                        mkdirSync(resolve(path, '..'), { recursive: true });
                        rmSync(path, { force: true });
                        symlinkSync(target, path);
                    };
                    for (const [target, value] of [['a', 'before'], ['b', 'after']]) {
                        write(`alias-case/targets/${target}/input.txt`, value);
                        write(`alias-case/targets/${target}/nested/input.txt`, value);
                    }
                    const live = `${base}/aliases/deep/live`;
                    let switched = live;
                    let suffix = kind === 'file' ? '/input.txt' : '';
                    let watches;
                    let reads;
                    if (topology === 'shared') {
                        switched = `${base}/hops/right`;
                        link(`${base}/watched/left`, `${base}/targets/a`);
                        link(`${base}/watched/right`, switched);
                        watches = kind === 'directory' ? [`${base}/watched`]
                            : [`${base}/watched/left/input.txt`, `${base}/watched/right/input.txt`];
                        reads = [`${base}/watched/left/input.txt`, `${base}/watched/right/input.txt`];
                    } else {
                        if (topology === 'chain') {
                            switched = `${base}/hops/middle`;
                            link(live, switched);
                        }
                        if (topology === 'ancestor') suffix = `/nested${suffix}`;
                        watches = [topology === 'leaf' ? live : live + suffix];
                        reads = [watches[0] + (kind === 'directory' ? '/input.txt' : '')];
                    }
                    const targetOf = (target) => `${base}/targets/${target}${topology === 'leaf' && kind === 'file' ? '/input.txt' : ''}`;
                    const point = (target) => link(switched, targetOf(target));
                    point('a');
                    write('theme/index.js', "import value from 'virtual:alias-value'; export default {contractVersion:1,value};");
                    const plugin = {
                        name: 'consumed-alias-value',
                        resolveId(id) { if (id === 'virtual:alias-value') return '\0alias-value'; },
                        load(id) {
                            if (id !== '\0alias-value') return;
                            for (const watch of watches) this.addWatchFile(form === 'absolute' ? watch : relative(engine, watch));
                            return `export default ${JSON.stringify(reads.map(path => readFileSync(path, 'utf8')))};`;
                        },
                    };
                    const original = await compile([plugin]);
                    assert.equal(diagnostic(original.manifest), null);
                    point('b');
                    const staleA = diagnostic(original.manifest);
                    const changed = await compile([plugin]);
                    assert.notEqual(changed.code, original.code, 'Loader reads through retargeted alias');
                    assert.equal(staleA?.code, 'theme.stale', 'a -> b before rebuild');
                    assert.notEqual(changed.manifest.fingerprint, original.manifest.fingerprint);
                    assert.equal(diagnostic(changed.manifest), null);
                    point('a');
                    assert.equal(diagnostic(changed.manifest)?.code, 'theme.stale', 'b -> a before rebuild');
                    assert.equal(diagnostic(original.manifest), null, 'Original manifest recovery');
                    const recovered = await compile([plugin]);
                    assert.equal(recovered.code, original.code);
                    assert.equal(recovered.manifest.fingerprint, original.manifest.fingerprint);
                    assert.equal(diagnostic(recovered.manifest), null);
                    assert(!JSON.stringify(changed.manifest).includes(site), 'No absolute site path');
                });
            }
        }
    }
    await check('watch containment and existence diagnostics', async () => {
        const outside = mkdtempSync(resolve(tmpdir(), 'edoc-watch-outside-'));
        write('theme/index.js', "import value from 'virtual:watch-boundary'; export default {contractVersion:1,value};");
        const boundaryPlugin = (watch) => ({
            name: 'watch-boundary',
            resolveId(id) { if (id === 'virtual:watch-boundary') return '\0watch-boundary'; },
            load(id) {
                if (id !== '\0watch-boundary') return;
                this.addWatchFile(watch);
                return 'export default 1;';
            },
        });
        try {
            writeFileSync(`${outside}/input.txt`, 'outside');
            for (const path of [outside, `${outside}/input.txt`, `${site}/missing-watch`]) {
                await assert.rejects(compile([boundaryPlugin(path)]), /theme.invalid/, path);
            }
            rmSync(`${site}/directory-data`, { recursive: true, force: true });
            mkdirSync(`${site}/directory-data`);
            symlinkSync(outside, `${site}/directory-data/escape`);
            await assert.rejects(compile([boundaryPlugin(`${site}/directory-data`)]), /theme.invalid/);
            rmSync(`${site}/directory-data/escape`);
            const fifo = spawnSync('mkfifo', [`${site}/directory-data/special`], { encoding: 'utf8' });
            assert.equal(fifo.status, 0, fifo.stderr);
            await assert.rejects(compile([boundaryPlugin(`${site}/directory-data`)]), /theme.invalid/);
        } finally { rmSync(outside, { recursive: true, force: true }); }
    });
    console.log(JSON.stringify({ results }, null, 2));
    assert.ok(results.every(result => result.passed), 'Theme watch/lookup matrix must pass');
} finally {
    rmSync(site, { recursive: true, force: true });
}
