import { edocPluginResolver, installedPluginStyleImporter } from './component-plugins.js';
import { build } from 'vite';
import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import remarkGfm from 'remark-gfm';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, renameSync, realpathSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { runtimeEntries, runtimeIds, sha, inRoot, safeFile, watchInputs } from './blog-plugin.js';

const engine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = realpathSync(resolve(engine, 'local/storage/edoc'));
const privateRoot = resolve(engine, process.env.EDOC_BLOG_BUILD_ROOT || 'local/build/blog');
const generation = randomBytes(16).toString('hex');
const componentPlugins = edocPluginResolver(engine);
const componentRoot = resolve(site, 'components');
const pluginModulesPath = resolve(engine, 'local/plugins/node_modules');
const pluginModules = existsSync(pluginModulesPath) ? realpathSync(pluginModulesPath) : pluginModulesPath;
const engineModules = realpathSync(resolve(engine, 'node_modules'));
const packageRoots = Object.values(componentPlugins.installed).map(module => realpathSync(module.root));
const developmentRoots = Object.values(componentPlugins.aliases).map(entry => dirname(realpathSync(entry)));
const packageInputs = Object.values(componentPlugins.installed).map(module => realpathSync(module.manifest));
const packageMetadata = resolve(engine, 'local/plugins/package.json');
// Prepare persistent output parents before the public theme fingerprint observes
// directory inventories. Creating local/build afterwards makes a cold build stale.
mkdirSync(privateRoot, { recursive: true });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf', '.txt': 'text/plain', '.json': 'application/json', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
const index = JSON.parse(execFileSync('php', [resolve(engine, 'tool/blog-index.php'), site], { encoding: 'utf8' }));
// Validate content before replacing the public app. The generation is only
// activated after every private graph succeeds; failures close the ABI gate.
await build({ root: engine });
const runtime = JSON.parse(readFileSync(resolve(engine, 'public/build/blog-runtime.json')));
const manifest = JSON.parse(readFileSync(resolve(engine, 'public/build/.vite/manifest.json')));
const facades = Object.fromEntries(Object.entries(runtimeEntries).map(([key, entry]) => [key, '/build/' + manifest[entry].file]));
const active = { schema: 1, site: index.site, abi: runtime.abi, generation, articles: {} };
const virtualEntry = '\0edoc-blog-entry';

function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
}

for (const article of index.articles) {
    const source = resolve(site, article.source);
    const own = /\/index\.mdx?$/.test(source) ? dirname(source) : source.replace(/\.mdx?$/, '');
    const shared = resolve(site, article.source.split('/blog/')[0], 'blog/_shared');
    const publicStatic = resolve(site, 'static');
    const inputs = {};
    const attachments = {};
    const copiedAssets = {};
    const outputRoot = resolve(privateRoot, generation, article.key);
    mkdirSync(outputRoot, { recursive: true });
    const allowed = (id) => {
        if (id.startsWith('\0')) return;
        const file = id.split('?')[0];
        if (!existsSync(file)) throw new Error('blog.graph: missing input');
        // An article is the sole MD/MDX entry; helpers belong to its sidecar or
        // _shared directory. Another article can never be a dependency.
        if (file !== source && ![packageMetadata, ...packageInputs].includes(file) && (/\.mdx?$/.test(file) || ![own, shared, publicStatic, componentRoot, ...packageRoots, ...developmentRoots, engineModules].some((root) => inRoot(root, file)))) {
            throw new Error('blog.graph: cross-article or undeclared input: ' + relative(site, file));
        }
        if (file !== source && index.articles.some((other) => {
            if (other.key === article.key) return false;
            const otherSource = resolve(site, other.source);
            const otherOwn = /\/index\.mdx?$/.test(otherSource) ? dirname(otherSource) : otherSource.replace(/\.mdx?$/, '');
            return otherOwn.length >= own.length && inRoot(otherOwn, file);
        })) throw new Error('blog.graph: another article owns this input');
        const root = inRoot(site, file) ? site : inRoot(pluginModules, file) ? pluginModules : engine;
        safeFile(root, file);
        if (file !== source) inputs[(root === site ? 'site:' : root === pluginModules ? 'plugins:' : 'engine:') + relative(root, file)] = sha(readFileSync(file));
    };
    const namespace = article.prefix + '/' + generation + '/' + article.key + '/';
    if (article.format === 'mdx') {
        for (const path of [packageMetadata, ...packageInputs]) if (existsSync(path)) allowed(path);
        const boundary = {
            name: 'edoc-private-graph', enforce: 'pre',
            configResolved: watchInputs(allowed, 'edoc-private-graph'),
            resolveId(id, importer) {
                if (id === virtualEntry) return id;
                if (id in runtimeIds) return { id, external: true };
                if (id.startsWith('\0')) return;
                const parent = importer?.split('?')[0];
                const packageParent = parent && [...packageRoots, ...developmentRoots, engineModules].some(root => inRoot(root, parent));
                if (!id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0') && !(id in componentPlugins.installed) && !(id in componentPlugins.aliases) && !packageParent) throw new Error('blog.graph: undeclared component package: ' + id);
                if (/^(?:react(?:-dom)?\/|@mdx-js\/)/.test(id)) throw new Error('blog.graph: unsupported runtime deep import');
                if (/^(?:https?:|data:|\/\/)/.test(id)) throw new Error('blog.graph: network imports are forbidden');
            },
            load(id) {
                if (id === virtualEntry) return `export { default } from ${JSON.stringify(source)};`;
                allowed(id);
                if (id.split('?')[0] === source) return article.body;
            },
            transform: { order: 'pre', handler(code, id) {
                if (id.startsWith('\0')) return;
                allowed(id);
                if (/\.[cm]?[jt]sx?(?:\?|$)|\.mdx$/.test(id)) {
                    for (const match of code.matchAll(/\bimport\s*\(([^)]*)\)/g)) {
                        if (!/^\s*(['"])[^'"]+\1\s*$/.test(match[1])) throw new Error('blog.graph: computed imports are forbidden');
                    }
                    for (const match of code.matchAll(/new\s+URL\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g)) {
                        allowed(resolve(dirname(id.split('?')[0]), match[2]));
                    }
                    if (/new\s+URL\(\s*(?!\s*['"])/.test(code)) throw new Error('blog.graph: computed asset URL');
                    if (/@vite-ignore|\bnew\s+(?:Shared)?Worker\b|\.wasm\b|sourceMappingURL/.test(code)) throw new Error('blog.graph: unsupported worker, WASM or ignored import');
                }
                if (/\.css(?:\?|$)/.test(id) && /(?:@import|url\()\s*["']?(?:https?:|data:|\/\/)/i.test(code)) throw new Error('blog.graph: external CSS inputs are forbidden');
            } },
        };
        const syntax = {
            name: 'edoc-private-import-syntax', enforce: 'post',
            transform(code, id) {
                if (id.startsWith('\0') || !/\.[cm]?[jt]sx?(?:\?|$)|\.mdx$/.test(id)) return;
                const ast = this.parse(code);
                walk(ast, (node) => {
                    if (node.type === 'ImportExpression' && !(node.source?.type === 'Literal' && typeof node.source.value === 'string')) throw new Error('blog.graph: computed imports are forbidden');
                    if (node.type === 'NewExpression' && node.callee?.name === 'URL' && node.arguments?.[1]?.type === 'MemberExpression') {
                        if (node.arguments[0]?.type !== 'Literal') throw new Error('blog.graph: computed asset URL');
                    }
                });
            },
        };
        const remarkBlogLinks = () => (tree) => {
            const nodes = [];
            walk(tree, (node) => { if (['link', 'image', 'definition'].includes(node.type) && typeof node.url === 'string') nodes.push(node); });
            if (!nodes.length) return;
            let targets;
            try {
                targets = JSON.parse(execFileSync('php', [resolve(engine, 'tool/blog-links.php'), site, article.locale, article.source], {
                    encoding: 'utf8', input: JSON.stringify([...new Set(nodes.map((node) => node.url))]),
                }));
            } catch (error) { throw new Error(error.stderr?.toString() || 'blog.link: unresolved MDX URL'); }
            for (const node of nodes) {
                const target = targets[node.url];
                if (target.startsWith('__asset__:')) {
                    const [path, ...fragment] = target.slice('__asset__:'.length).split('#');
                    const file = resolve(site, path);
                    allowed(file);
                    const name = 'assets/' + sha(readFileSync(file)).slice(0, 24) + extname(file);
                    copiedAssets[name] = readFileSync(file);
                    node.url = namespace + name + (fragment.length ? '#' + fragment.join('#') : '');
                } else node.url = target;
            }
        };
        await build({ configFile: false, root: engine, publicDir: false, base: namespace,
            resolve: { dedupe: ['react', 'react-dom', '@mdx-js/react'], alias: componentPlugins.aliases },
            plugins: [boundary, installedPluginStyleImporter(componentPlugins.installed), mdx({ remarkPlugins: [remarkGfm, remarkBlogLinks], providerImportSource: '@mdx-js/react' }), react(), syntax],
            build: { outDir: outputRoot, emptyOutDir: true, manifest: false, sourcemap: false, assetsInlineLimit: 0, cssCodeSplit: true, modulePreload: false,
                rollupOptions: { input: virtualEntry, preserveEntrySignatures: 'strict', external: (id) => id in runtimeIds,
                    output: { format: 'es', entryFileNames: 'entry.js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]', paths: (id) => facades[runtimeIds[id]] || id } } },
        });
    } else {
        // All sidecar attachments are prepared privately, including link/download
        // assets, without copying arbitrary neighbouring article directories.
        for (const [target, relativePath] of Object.entries(article.attachments)) {
            const file = resolve(site, relativePath);
            allowed(file);
            const name = 'assets/' + sha(readFileSync(file)).slice(0, 24) + extname(file);
            mkdirSync(resolve(outputRoot, 'assets'), { recursive: true });
            writeFileSync(resolve(outputRoot, name), readFileSync(file));
            attachments[target] = name;
        }
    }
    for (const [name, bytes] of Object.entries(copiedAssets)) {
        mkdirSync(dirname(resolve(outputRoot, name)), { recursive: true });
        writeFileSync(resolve(outputRoot, name), bytes);
    }
    let preview = null;
    if (article.preview !== null) {
        const file = resolve(site, article.preview);
        allowed(file);
        preview = 'assets/preview-' + sha(readFileSync(file)).slice(0, 24) + extname(file).toLowerCase();
        mkdirSync(dirname(resolve(outputRoot, preview)), { recursive: true });
        writeFileSync(resolve(outputRoot, preview), readFileSync(file));
    }
    const files = {};
    const scan = (directory) => {
        for (const item of readdirSync(directory, { withFileTypes: true })) {
            const file = resolve(directory, item.name);
            if (item.isDirectory()) scan(file);
            else {
                const type = mime[extname(file)];
                if (!type || /\.map$|manifest/.test(item.name)) throw new Error('blog.output: unsupported output');
                const bytes = readFileSync(file);
                files[relative(outputRoot, file)] = { mime: type, size: bytes.length, hash: sha(bytes) };
            }
        }
    };
    scan(outputRoot);
    active.articles[article.key] = { source: article.source, slug: article.slug, locale: article.locale, prefix: article.prefix,
        bodyDigest: article.bodyDigest, previewSource: article.preview, preview, inputs, files, attachments, entry: article.format === 'mdx' ? 'entry.js' : null,
        css: Object.keys(files).filter((file) => file.endsWith('.css')) };
}
mkdirSync(privateRoot, { recursive: true });
writeFileSync(resolve(privateRoot, 'active.next.json'), JSON.stringify(active));
renameSync(resolve(privateRoot, 'active.next.json'), resolve(privateRoot, 'active.json'));
console.log('Blog generation activated:', generation, 'articles:', index.articles.length);
