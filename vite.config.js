import { edocPluginResolver, installedPluginStyleImporter } from './tool/component-plugins.js';
import { publicBlogBoundary, runtimeEntries } from './tool/blog-plugin.js';
import { siteThemePlugin } from './tool/theme-plugin.js';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

const devServerUrl = () => {
    const value = process.env.VITE_DEV_SERVER || 'https://vite.domain.local';

    return new URL(value);
};

export default defineConfig(({command}) => {
    const isDev = command === 'serve';
    const devUrl = devServerUrl();
    const devPort = Number(process.env.VITE_PORT || devUrl.port || 5173);
    const isSecure = devUrl.protocol === 'https:';
    const edocPlugins = edocPluginResolver(projectRoot);

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
            publicBlogBoundary(projectRoot),
            siteThemePlugin(projectRoot),
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
                input: { app: 'resources/js/app.tsx', ...runtimeEntries },
                preserveEntrySignatures: 'strict',
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
                '@edoc/mdx': resolve(projectRoot, 'resources/js/Blog/runtime/shared.ts'),
                ...edocPlugins.aliases,
            },
        }
    };
});
