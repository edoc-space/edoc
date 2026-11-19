import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/** Only build-time trusted site.json can choose the module. No HTTP/MDX path input. */
export function siteThemePlugin(engineRoot, siteRoot = resolve(engineRoot, 'local/storage/edoc')) {
    const resolveTheme = (files) => {
        try {
            const args = [resolve(engineRoot, 'tool/resolve-theme.php'), siteRoot];
            if (files) args.push('manifest');
            return JSON.parse(execFileSync('php', args, {
                encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
                input: files ? JSON.stringify(files) : undefined,
            }));
        } catch (error) {
            throw new Error(error.stderr?.toString().trim() || 'theme.invalid: Theme resolution failed.');
        }
    };
    const theme = resolveTheme();
    const watched = new Set();
    return {
        name: 'edoc-site-theme',
        configResolved(config) {
            // Rolldown (Vite 8) has addWatchFile, but no context.getWatchFiles.
            // Preserve every hook's behavior while observing the public watch API.
            // CSS @imports/url(), preprocessors and workers report dependencies here.
            const hooks = ['buildStart', 'resolveId', 'load', 'transform', 'moduleParsed', 'buildEnd', 'renderStart', 'renderChunk', 'generateBundle'];
            for (const plugin of config.plugins) {
                if (plugin.name === 'edoc-site-theme') continue;
                for (const name of hooks) {
                    const hook = plugin[name];
                    const handler = typeof hook === 'function' ? hook : hook?.handler;
                    if (typeof handler !== 'function') continue;
                    const wrapped = function (...args) {
                        const context = new Proxy(this, {
                            get(target, key) {
                                const value = Reflect.get(target, key, target);
                                if (key === 'addWatchFile') return (file) => {
                                    // Rollup/Rolldown resolve relative watch IDs against cwd,
                                    // independently of Vite root or the current module.
                                    watched.add(resolve(file));
                                    return value.call(target, file);
                                };
                                return typeof value === 'function' ? value.bind(target) : value;
                            },
                        });
                        return handler.apply(context, args);
                    };
                    plugin[name] = typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped };
                }
            }
        },
        resolveId(id) {
            return id === 'virtual:edoc-theme' ? '\0edoc-theme' : null;
        },
        load(id) {
            if (id !== '\0edoc-theme') return null;
            return `export { default } from ${JSON.stringify(theme.entry)};`;
        },
        generateBundle: { order: 'post', handler() {
            // Capture Rollup modules AND watched assets/CSS, including transitive npm
            // sources. Virtual modules have no file; filesystem imports outside the
            // declared roots are rejected by the shared PHP resolver.
            const modules = [
                ...this.getModuleIds(),
                resolve(engineRoot, 'package.json'), resolve(engineRoot, 'yarn.lock'),
                resolve(engineRoot, 'vite.config.js'), resolve(engineRoot, 'tool/theme-plugin.js'),
                resolve(engineRoot, 'tool/resolve-theme.php'),
                resolve(engineRoot, 'tool/component-plugins.js'), resolve(engineRoot, 'tool/build-site.mjs'),
                resolve(engineRoot, 'tool/blog-plugin.js'),
                resolve(engineRoot, 'src/Feature/Theme/ThemeResolver.php'),
            ].filter((id) => !id.startsWith('\0')).map((id) => id.split('?')[0])
                .filter((file) => isAbsolute(file) && existsSync(file) && statSync(file).isFile());
            const files = new Set([
                ...modules,
                // Explicit watch paths are files OR directories; never silently
                // discard a missing/unsupported declaration. PHP validates roots.
                ...watched,
            ]);
            const manifest = resolveTheme([...files].sort());
            this.emitFile({ type: 'asset', fileName: 'theme.json', source: JSON.stringify(manifest) });
        } },
    };
}
