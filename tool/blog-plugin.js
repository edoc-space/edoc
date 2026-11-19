import { realpathSync, existsSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export const runtimeEntries = {
    react: 'resources/js/Blog/runtime/react.js',
    jsx: 'resources/js/Blog/runtime/jsx.ts',
    dom: 'resources/js/Blog/runtime/dom.ts',
    client: 'resources/js/Blog/runtime/client.ts',
    mdx: 'resources/js/Blog/runtime/mdx.ts',
    shared: 'resources/js/Blog/runtime/shared.ts',
};
export const runtimeIds = {
    react: 'react', 'react/jsx-runtime': 'jsx', 'react-dom': 'dom',
    'react-dom/client': 'client', '@mdx-js/react': 'mdx', '@edoc/mdx': 'shared',
};
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function inRoot(root, file) {
    const rel = relative(root, file);
    return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel));
}
export function safeFile(root, file) {
    if (!inRoot(root, file)) throw new Error('blog.graph: input outside allowed root');
    let current = root;
    for (const segment of relative(root, file).split('/')) {
        current = resolve(current, segment);
        if (lstatSync(current).isSymbolicLink()) throw new Error('blog.graph: symlink input');
    }
    if (!lstatSync(file).isFile()) throw new Error('blog.graph: regular file required');
    return realpathSync(file);
}

/** Guard applies to the whole public graph, before tree shaking. */
export function publicBlogBoundary(engineRoot) {
    const abi = randomBytes(32).toString('hex');
    const site = realpathSync(resolve(engineRoot, 'local/storage/edoc'));
    const check = (id) => {
        if (typeof id !== 'string' || id.startsWith('\0')) return;
        const file = id.split('?')[0];
        if (!isAbsolute(file) || !existsSync(file)) return;
        const canonical = realpathSync(file);
        if ([file, canonical].some((path) => inRoot(site, path) && relative(site, path).split('/').includes('blog'))) {
            throw new Error('blog.public: blog inputs cannot enter the public graph');
        }
    };
    return {
        name: 'edoc-public-blog-boundary', enforce: 'pre',
        configResolved: watchInputs(check, 'edoc-public-blog-boundary'),
        async resolveId(source, importer, options) {
            if (source === 'virtual:edoc-blog-abi') return '\0edoc-blog-abi';
            if (!importer || source.startsWith('\0')) return;
            const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
            if (resolved) check(resolved.id);
            return resolved;
        },
        load(id) {
            if (id === '\0edoc-blog-abi') return `export default ${JSON.stringify(abi)};`;
            check(id);
        },
        generateBundle: { order: 'post', handler(_options, bundle) {
            for (const id of this.getModuleIds()) check(id);
            const files = Object.fromEntries(Object.entries(bundle).map(([file, output]) => [file, sha(output.type === 'chunk' ? output.code : output.source)]));
            // ABI changes with all runtime outputs and declared build configuration.
            const graphDigest = sha(JSON.stringify([1, files, ...['yarn.lock', 'vite.config.js', 'tool/blog-plugin.js', 'tool/component-plugins.js', 'tool/build-site.mjs'].map((file) => sha(readFileSync(resolve(engineRoot, file))))]));
            this.emitFile({ type: 'asset', fileName: 'blog-runtime.json', source: JSON.stringify({ schema: 1, abi, graphDigest }) });
        } },
    };
}

// Vite reports CSS @import/url and other non-module inputs through addWatchFile.
// Observe the same supported hook as the theme build; validate before emitting.
export function watchInputs(check, selfName) {
    return (config) => {
        for (const plugin of config.plugins) {
            if (plugin.name === selfName) continue;
            for (const name of ['buildStart', 'resolveId', 'load', 'transform', 'moduleParsed', 'buildEnd', 'renderStart', 'renderChunk', 'generateBundle']) {
                const hook = plugin[name];
                const handler = typeof hook === 'function' ? hook : hook?.handler;
                if (typeof handler !== 'function') continue;
                const wrapped = function (...args) {
                    const context = new Proxy(this, { get(target, key) {
                        const value = Reflect.get(target, key, target);
                        if (key === 'addWatchFile') return (id) => { check(resolve(id)); return value.call(target, id); };
                        return typeof value === 'function' ? value.bind(target) : value;
                    } });
                    return handler.apply(context, args);
                };
                plugin[name] = typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped };
            }
        }
    };
}
