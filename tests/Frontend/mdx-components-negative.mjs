import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareMdxComponentsFixture } from './mdx-components-fixture.mjs';

const fixture = prepareMdxComponentsFixture('default');
const cases=[];
function rejected(name,path,text,pattern,privateBuild=false) {
  const original=readFileSync(path,'utf8');
  try {
    writeFileSync(path,text);
    const result=spawnSync('yarn',privateBuild?['build']:['exec','vite','build'],{encoding:'utf8'});
    const output=result.stdout+result.stderr;
    writeFileSync('/evidence/pc3-negative-'+name+'.log',output);
    assert.notEqual(result.status,0,name+' must fail');
    assert.match(output,pattern,name+' diagnostic');
    cases.push(name);
  } finally { writeFileSync(path,original); }
}
const source=resolve(fixture.site,'components/LocalProbe.tsx');
rejected('missing-local',source,readFileSync(source,'utf8')+"\nimport './MissingComponent.tsx';",/MissingComponent/);
const packageSource=resolve(fixture.packageRoot,'index.jsx');
rejected('incompatible-export',packageSource,'export const DifferentComponent = null;',/PackageProbe/);
rejected('public-private-transitive',source,readFileSync(source,'utf8')+"\nimport '../ru/blog/d02/helper.js';",/blog\.public/);
const article=resolve(fixture.site,'ru/blog/p04.mdx');
rejected('cross-article',article,readFileSync(article,'utf8')+"\nimport './d02/helper.js';",/blog\.graph: (cross-article|another article)/,true);
rejected('undeclared-package',article,readFileSync(article,'utf8')+"\nimport 'unregistered-component';",/blog\.graph: undeclared component package: unregistered-component/,true);
console.log(JSON.stringify({passed:cases}));
