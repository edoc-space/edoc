import { readFileSync, writeFileSync, mkdirSync, rmSync, realpathSync, lstatSync, cpSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { prepareBlogListFixture } from './blog-list-fixture.mjs';

/** Synthetic author components; mutations are permitted only in the disposable runtime. */
export function prepareMdxComponentsFixture(theme = 'default') {
  if (!process.cwd().startsWith('/app/')) throw new Error('MDX fixtures require the disposable runtime');
  const fixture = prepareBlogListFixture(theme);
  const put = (root, path, text) => {
    const file = resolve(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text);
  };
  const plugins = resolve('local/plugins');
  // The configured runtime mounts installed plugins read-only. Copy only in this
  // disposable command snapshot to add a neutral package without installation.
  const modules = resolve(plugins, 'node_modules');
  if (lstatSync(modules).isSymbolicLink()) {
    const source = realpathSync(modules); rmSync(modules); cpSync(source, modules, { recursive: true });
  }
  const manifest = existsSync(resolve(plugins, 'package.json')) ? JSON.parse(readFileSync(resolve(plugins, 'package.json'), 'utf8')) : { private: true };
  manifest.dependencies = { ...manifest.dependencies, '@fixture/mdx-components': '1.0.0' };
  put(plugins, 'package.json', JSON.stringify(manifest));
  const packageRoot = resolve(modules, '@fixture/mdx-components');
  put(packageRoot, 'package.json', JSON.stringify({ name: '@fixture/mdx-components', version: '1.0.0', type: 'module', exports: { '.': './index.jsx', './style.css': './style.css' }, peerDependencies: { react: '^19', '@mdx-js/react': '^3' } }));
  const component = (name, kind) => `import React, {useState, useContext} from 'react';\nimport {useMDXComponents} from '@mdx-js/react';\nimport {MdxLayoutContext} from '@edoc/mdx';\n${kind === 'local' ? "import './probe.css';" : ''}\nexport function ${name}({label='${kind}'}) { const [count,setCount]=useState(0); const context=useContext(MdxLayoutContext); const mdx=useMDXComponents(); return <section className="pc3-${kind}" data-pc3="${kind}"><p>{context.locale?.code} / {mdx.h2 ? 'provider' : 'missing'}</p><button type="button" onClick={()=>setCount(value=>value+1)}>{label}: {count}</button></section>; }`;
  put(packageRoot, 'index.jsx', component('PackageProbe', 'package'));
  put(packageRoot, 'style.css', '.pc3-package { border: 3px solid rgb(39, 124, 69); padding: 1rem; }');
  put(fixture.site, 'components/LocalProbe.tsx', component('LocalProbe', 'local'));
  put(fixture.site, 'components/probe.css', '.pc3-local { border: 3px solid rgb(98, 63, 174); padding: 1rem; }');
  const body = `import {LocalProbe} from '../../components/LocalProbe.tsx'\nimport {PackageProbe} from '@fixture/mdx-components'\n\n# React components\n\n<LocalProbe />\n<LocalProbe label="independent" />\n<PackageProbe />\n`;
  for (const locale of ['ru', 'en']) {
    for (const [section, path] of [['pages', 'components'], ['docs', 'components']]) {
      put(fixture.site, `${locale}/${section}/${path}.mdx`, `---\ntitle: React components\n---\n\n${body}`);
    }
    const article = resolve(fixture.site, `${locale}/blog/p04.mdx`);
    const original = readFileSync(article, 'utf8');
    writeFileSync(article, original + '\n' + body.replace('# React components\n', ''));
  }
  return { ...fixture, packageRoot };
}
if (process.argv[1]?.endsWith('/mdx-components-fixture.mjs')) prepareMdxComponentsFixture(process.argv[2]);
