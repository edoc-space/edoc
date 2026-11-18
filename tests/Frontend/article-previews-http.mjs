import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync, symlinkSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** Run on the built authored me snapshot; every mutation is restored. */
export async function verifyArticlePreviews() {
  assert(process.cwd().startsWith('/app/'));
  const base = 'http://nginx', site = resolve('../../local/me');
  const expected = JSON.parse(readFileSync(resolve(site, 'tests/fixtures/telegram-import.json'))).posts;
  const activePath = 'local/build/blog/active.json', saved = readFileSync(activePath), active = JSON.parse(saved);
  const hash = b => createHash('sha256').update(b).digest('hex'), requests = [];
  async function request(path, status = 200, method = 'GET', headers = {}) {
    const r = await fetch(base + path, {method, headers});
    const bytes = Buffer.from(await r.arrayBuffer());
    requests.push({path,method,status:r.status});
    assert.equal(r.status,status,`${method} ${path}: ${bytes.toString().slice(0,300)}`);
    assert.equal(r.headers.get('etag'),null);
    assert(r.headers.get('cache-control')?.includes('no-store'));
    if (method === 'HEAD') assert.equal(bytes.length,0);
    return {r,bytes};
  }
  const props = bytes => JSON.parse(bytes.toString().match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)[1]).props;
  async function summaries() {
    const all = [];
    for (let page=1;page<=4;page++) all.push(...props((await request('/blog?page='+page)).bytes).blog.articles);
    assert.equal(all.length,17);
    assert(!JSON.stringify(all).includes('ru/blog/'), 'No source paths in summaries');
    return all;
  }
  const original = await summaries();
  assert.equal(original.filter(p=>p.preview).length,10);
  for (const post of expected) {
    const item=original.find(p=>p.slug===post.slug);
    assert.equal(item.image,null,'Private preview never changes public image/OG');
    if (!post.preview) {assert.equal(item.preview,null);continue;}
    assert.match(item.preview,/^\/blog\/_modules\/[a-f0-9]{32}\/[a-f0-9]{32}\/assets\/preview-/);
    const {bytes,r}=await request(item.preview);
    assert.equal(hash(bytes),post.preview.sha256,post.slug);
    assert.match(r.headers.get('content-type'),/^image\//);
    assert.equal(hash(readFileSync(resolve('/app',post.preview.path))),post.preview.sha256);
    assert.equal(hash(readFileSync(resolve('/app',post.document)).toString().split('\n---\n').slice(1).join('\n---\n')),post.body_sha256);
    await request(item.preview,200,'HEAD');
    // Existing conditions never bypass the guard and images do not implement video ranges.
    const conditional=await request(item.preview,200,'GET',{Range:'bytes=0-1','If-None-Match':'*','If-Modified-Since':'Thu, 01 Jan 2099 00:00:00 GMT'});
    assert.equal(hash(conditional.bytes),post.preview.sha256);
    await request('/en'+item.preview,404);
  }
  const latest=props((await request('/')).bytes).latestArticles.items;
  assert.deepEqual(latest.map(p=>[p.slug,p.preview]),original.slice(0,2).map(p=>[p.slug,p.preview]));
  assert.equal(props((await request('/en')).bytes).latestArticles.items.length,0);
  const photo=original.find(p=>p.slug==='telegram-24'), post=expected.find(p=>p.slug===photo.slug);
  const [key,entry]=Object.entries(active.articles).find(([,e])=>e.slug===photo.slug);
  const output=resolve('local/build/blog',active.generation,key,entry.preview), originalOutput=readFileSync(output);
  const input=resolve('/app',post.preview.path), originalInput=readFileSync(input);
  async function unavailable(label) {
    for(const method of ['GET','HEAD']) for(const headers of [{},{Range:'bytes=0-1','If-None-Match':'*','If-Range':'old'}]) await request(photo.preview,404,method,headers);
    const items=await summaries();
    assert.equal(items.find(p=>p.slug===photo.slug).preview,null,label);
    assert.equal(props((await request('/')).bytes).latestArticles.items.find(p=>p.slug===photo.slug).preview,null,label);
  }
  try {
    writeFileSync(output,'CORRUPTED');await unavailable('corrupt output');writeFileSync(output,originalOutput);
    renameSync(input,input+'.saved');
    try {
      await unavailable('missing original');
      symlinkSync(input+'.saved',input);
      try {await unavailable('symlink original');} finally {unlinkSync(input);}
    } finally {renameSync(input+'.saved',input);}
    writeFileSync(input,'changed');await unavailable('stale input');writeFileSync(input,originalInput);
    for (const field of ['site','abi','generation','locale','prefix','bodyDigest','previewSource','preview']) {
      const bad=structuredClone(active);
      if(['site','abi','generation'].includes(field))bad[field]='invalid';else bad.articles[key][field]='invalid';
      writeFileSync(activePath,JSON.stringify(bad));await unavailable('invalid '+field);writeFileSync(activePath,saved);
    }
    renameSync(activePath,activePath+'.saved');
    try {await unavailable('missing build');}finally{renameSync(activePath+'.saved',activePath);}
    const invalidUrls=[photo.preview.replace(active.generation,'0'.repeat(32)),photo.preview.replace(key,'0'.repeat(32)),photo.preview.replace(/assets\/.+$/,'assets/%2e%2e/active.json'),photo.preview.replace(/assets\/.+$/,'assets/missing.jpg')];
    for(const url of invalidUrls) await request(url,404);
    // Strict authoring validation is cheap: it never runs a production build or MDX graph.
    const source=resolve('/app',post.document), sourceBytes=readFileSync(source,'utf8');
    try {
      for(const preview of ['../secret.jpg','telegram-23/cover.jpg','telegram-24/file.svg','telegram-24/missing.jpg']) {
        writeFileSync(source,sourceBytes.replace(/^preview:.*$/m,'preview: '+JSON.stringify(preview)));
        const r=spawnSync('php',['tool/blog-index.php',site],{encoding:'utf8'});
        assert.notEqual(r.status,0,preview);assert.match(r.stderr,/preview|file not found/);
      }
      writeFileSync(source,sourceBytes);writeFileSync(input,'not a raster');
      const r=spawnSync('php',['tool/blog-index.php',site],{encoding:'utf8'});
      assert.notEqual(r.status,0);assert.match(r.stderr,/unsupported raster/);
    } finally {writeFileSync(source,sourceBytes);writeFileSync(input,originalInput);}
    assert.deepEqual((await summaries()).map(p=>[p.slug,p.preview]),original.map(p=>[p.slug,p.preview]));
    console.log('Preview HTTP: 10 original rasters / 7 text-only, metadata/build/input/output/type/site/locale/generation/path guards, GET/HEAD/conditional and safe list fallback passed.');
  } finally {
    writeFileSync(activePath,saved);writeFileSync(output,originalOutput);writeFileSync(input,originalInput);
    writeFileSync('/evidence/article-previews-http.json',JSON.stringify({generation:active.generation,requests},null,2));
  }
}
if(process.argv[1]?.endsWith('/article-previews-http.mjs'))await verifyArticlePreviews();
