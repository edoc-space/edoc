import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import {dirname, isAbsolute, normalize, relative, resolve} from 'path';
import {existsSync, readFileSync, readdirSync} from 'fs';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);

const devServerUrl = () => {
    const value = process.env.VITE_DEV_SERVER || 'https://vite.domain.local';

    return new URL(value);
};

const edocPluginResolver = () => {
    const pluginsRoot = resolve(projectRoot, 'local/plugins');
    const aliases = {};
    const installed = {};

    if (!existsSync(pluginsRoot)) {
        return {aliases, installed};
    }

    for (const [name, sourcePath] of Object.entries(localDevelopmentPluginAliases(pluginsRoot))) {
        aliases[name] = sourcePath;
    }

    for (const [name, module] of Object.entries(installedPluginModules(pluginsRoot, aliases))) {
        installed[name] = module;
    }

    return {aliases, installed};
};

const localDevelopmentPluginAliases = (pluginsRoot) => {
    const aliases = {};

    for (const directory of readdirSync(pluginsRoot, {withFileTypes: true})) {
        if (!directory.isDirectory()) {
            continue;
        }

        if (directory.name === 'node_modules' || directory.name.startsWith('.')) {
            continue;
        }

        const pluginRoot = resolve(pluginsRoot, directory.name);
        const manifestPath = resolve(pluginRoot, 'package.json');
        if (!existsSync(manifestPath)) {
            continue;
        }

        const manifest = readLocalPluginManifest(manifestPath);
        if (typeof manifest.name !== 'string' || manifest.name === '') {
            throw new Error(localPluginError(manifestPath, 'manifest must define a non-empty string "name".'));
        }

        if (aliases[manifest.name]) {
            throw new Error(localPluginError(manifestPath, `duplicate plugin package name "${manifest.name}".`));
        }

        const source = typeof manifest.edoc?.source === 'string'
            ? manifest.edoc.source
            : 'src/index.tsx';
        const sourcePath = resolveLocalPluginSource(pluginRoot, source, manifestPath);

        aliases[manifest.name] = sourcePath;
    }

    return aliases;
};

const installedPluginModules = (pluginsRoot, existingAliases) => {
    const packageNames = localPluginPackageNames(pluginsRoot);
    const modules = {};

    for (const packageName of packageNames) {
        if (existingAliases[packageName]) {
            continue;
        }

        const manifestPath = resolveInstalledPluginManifest(pluginsRoot, packageName);
        const packageRoot = dirname(manifestPath);
        const manifest = readLocalPluginManifest(manifestPath);

        modules[packageName] = {
            entrypoint: resolveInstalledPluginEntrypoint(packageRoot, manifest, manifestPath),
            stylesheet: resolveInstalledPluginStylesheet(packageRoot, manifest, manifestPath),
        };
        modules[packageName].hasDefaultExport = hasDefaultExport(modules[packageName].entrypoint);
    }

    return modules;
};

const localPluginPackageNames = (pluginsRoot) => {
    const manifestPath = resolve(pluginsRoot, 'package.json');
    if (!existsSync(manifestPath)) {
        return [];
    }

    const manifest = readLocalPluginManifest(manifestPath);
    const dependencies = {
        ...objectValue(manifest.dependencies),
        ...objectValue(manifest.optionalDependencies),
    };

    return Object.keys(dependencies).sort();
};

const resolveInstalledPluginManifest = (pluginsRoot, packageName) => {
    const directManifestPath = resolve(pluginsRoot, 'node_modules', ...packageName.split('/'), 'package.json');
    if (existsSync(directManifestPath)) {
        return directManifestPath;
    }

    try {
        return nodeRequire.resolve(`${packageName}/package.json`, {paths: [pluginsRoot]});
    } catch (error) {
        throw new Error(`[edoc plugin] ${packageName}: package is listed in local/plugins/package.json but is not installed. Run "cd local/plugins && yarn install".`);
    }
};

const resolveInstalledPluginEntrypoint = (packageRoot, manifest, manifestPath) => {
    const exportedEntry = resolvePackageExportTarget(manifest.exports);
    if (exportedEntry) {
        return resolvePackagePath(packageRoot, exportedEntry, manifestPath, '"exports"');
    }

    for (const field of ['module', 'jsnext:main', 'browser', 'main']) {
        if (typeof manifest[field] === 'string' && manifest[field] !== '') {
            return resolvePackagePath(packageRoot, manifest[field], manifestPath, `"${field}"`);
        }
    }

    if (typeof manifest.edoc?.source === 'string') {
        const sourcePath = tryResolvePackagePath(packageRoot, manifest.edoc.source);
        if (sourcePath) {
            return sourcePath;
        }
    }

    for (const candidate of ['dist/index.js', 'index.js']) {
        const sourcePath = resolve(packageRoot, candidate);
        if (existsSync(sourcePath)) {
            return sourcePath;
        }
    }

    throw new Error(localPluginError(manifestPath, 'package entrypoint was not found. Add "edoc.source", "exports", "module" or "main".'));
};

const resolvePackageExportTarget = (exportsField) => {
    if (typeof exportsField === 'string') {
        return exportsField;
    }

    if (!isPlainObject(exportsField)) {
        return null;
    }

    if (exportsField['.'] !== undefined) {
        return resolvePackageExportTarget(exportsField['.']);
    }

    for (const condition of ['import', 'module', 'browser', 'default']) {
        const target = resolvePackageExportTarget(exportsField[condition]);
        if (target) {
            return target;
        }
    }

    return null;
};

const resolvePackageStyleExportTarget = (exportsField) => {
    if (!isPlainObject(exportsField)) {
        return null;
    }

    for (const exportName of ['./style.css', './style', './styles.css']) {
        if (exportsField[exportName] !== undefined) {
            return resolvePackageExportTarget(exportsField[exportName]);
        }
    }

    return null;
};

const resolveInstalledPluginStylesheet = (packageRoot, manifest, manifestPath) => {
    const exportedStyle = resolvePackageStyleExportTarget(manifest.exports);
    if (exportedStyle) {
        return resolvePackagePath(packageRoot, exportedStyle, manifestPath, '"exports" stylesheet');
    }

    for (const candidate of ['dist/style.css', 'style.css', 'styles.css']) {
        const sourcePath = resolve(packageRoot, candidate);
        if (existsSync(sourcePath)) {
            return sourcePath;
        }
    }

    return null;
};

const normalizeImportPath = (path) => {
    return path.replace(/\\/g, '/');
};

const hasDefaultExport = (entrypoint) => {
    try {
        const code = readFileSync(entrypoint, 'utf8');

        return /\bexport\s+default\b/.test(code) || /\bas\s+default\b/.test(code);
    } catch (error) {
        return false;
    }
};

const installedPluginStyleImporter = (installedModules) => {
    const virtualPrefix = '\0edoc-installed-plugin:';

    return {
        name: 'edoc-installed-plugin-style-importer',
        enforce: 'pre',
        resolveId(id) {
            if (id.startsWith(virtualPrefix)) {
                return id;
            }

            if (installedModules[id]) {
                return virtualPrefix + id;
            }

            return null;
        },
        load(id) {
            if (!id.startsWith(virtualPrefix)) {
                return null;
            }

            const packageName = id.slice(virtualPrefix.length);
            const module = installedModules[packageName];
            if (!module) {
                return null;
            }

            const entrypoint = normalizeImportPath(module.entrypoint);
            const lines = [];
            if (module.stylesheet) {
                lines.push(`import ${JSON.stringify(normalizeImportPath(module.stylesheet))};`);
            }
            lines.push(`export * from ${JSON.stringify(entrypoint)};`);
            if (module.hasDefaultExport) {
                lines.push(`export { default } from ${JSON.stringify(entrypoint)};`);
            }

            return lines.join('\n');
        },
    };
};

const readLocalPluginManifest = (manifestPath) => {
    try {
        return JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(localPluginError(manifestPath, `invalid JSON: ${message}`));
    }
};

const resolveLocalPluginSource = (pluginRoot, source, manifestPath) => {
    return resolvePackagePath(pluginRoot, source, manifestPath, '"edoc.source"');
};

const resolvePackagePath = (packageRoot, source, manifestPath, fieldName) => {
    const normalizedSource = normalize(source).replace(/\\/g, '/');
    if (
        normalizedSource === ''
        || isAbsolute(normalizedSource)
        || normalizedSource === '..'
        || normalizedSource.startsWith('../')
        || normalizedSource.includes('/../')
    ) {
        throw new Error(localPluginError(manifestPath, `${fieldName} must stay inside plugin directory.`));
    }

    const sourcePath = resolve(packageRoot, normalizedSource);
    if (!existsSync(sourcePath)) {
        throw new Error(localPluginError(manifestPath, `${fieldName} file does not exist: ${source}`));
    }

    return sourcePath;
};

const tryResolvePackagePath = (packageRoot, source) => {
    const normalizedSource = normalize(source).replace(/\\/g, '/');
    if (
        normalizedSource === ''
        || isAbsolute(normalizedSource)
        || normalizedSource === '..'
        || normalizedSource.startsWith('../')
        || normalizedSource.includes('/../')
    ) {
        return null;
    }

    const sourcePath = resolve(packageRoot, normalizedSource);

    return existsSync(sourcePath) ? sourcePath : null;
};

const objectValue = (value) => {
    return isPlainObject(value) ? value : {};
};

const isPlainObject = (value) => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const localPluginError = (manifestPath, message) => {
    const path = relative(projectRoot, manifestPath) || manifestPath;

    return `[edoc local plugin] ${path}: ${message}`;
};

export default defineConfig(({command}) => {
    const isDev = command === 'serve';
    const devUrl = devServerUrl();
    const devPort = Number(process.env.VITE_PORT || devUrl.port || 5173);
    const isSecure = devUrl.protocol === 'https:';
    const edocPlugins = edocPluginResolver();

    const stripMdxFrontMatter = () => ({
        name: 'edoc-strip-mdx-front-matter',
        enforce: 'pre',
        transform(code, id) {
            if (!id.endsWith('.mdx')) {
                return null;
            }

            return code.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
        },
    });

    return {
        plugins: [
            installedPluginStyleImporter(edocPlugins.installed),
            stripMdxFrontMatter(),
            mdx({remarkPlugins: [remarkGfm]}),
            react(),
        ],
        root: projectRoot,
        base: isDev ? '/' : '/build/',
        publicDir: false,
        build: {
            outDir: 'public/build',
            emptyOutDir: true,
            manifest: true,
            rollupOptions: {
                input: 'resources/js/app.tsx',
            },
        },
        server: {
            host: true,
            port: devPort,
            strictPort: true,
            cors: true,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            hmr: {
                host: devUrl.hostname,
                protocol: isSecure ? 'wss' : 'ws',
                clientPort: Number(devUrl.port || (isSecure ? 443 : 80)),
            },
            origin: devUrl.origin,
        },

        css: {
            preprocessorOptions: {
                scss: {
                    api: 'modern-compiler',
                    quietDeps: true,
                }
            }
        },
        resolve: {
            dedupe: ['react', 'react-dom', '@mdx-js/react'],
            alias: {
                '@': resolve(projectRoot, 'resources/js'),
                ...edocPlugins.aliases,
            },
        }
    };
});
