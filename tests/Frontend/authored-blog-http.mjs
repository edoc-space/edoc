import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** Actual me content only; mutations are restored inside a disposable /app snapshot. */
export async function verifyAuthoredBlog() {
  assert(process.cwd().startsWith('/app/'));
  const base = 'http://nginx', site = resolve('../../local/me');
  const expected = JSON.parse(readFileSync(resolve(site, 'tests/fixtures/telegram-import.json'))).posts
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.slug.localeCompare(b.slug));
  const activeBytes = readFileSync('local/build/blog/active.json');
  const active = JSON.parse(activeBytes), requests = [];
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const pageProps = body => JSON.parse(body.match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)[1]).props;
  async function get(path, status = 200, method = 'GET', extra = {}, protectedResponse = true) {
    const r = await fetch(base + path, {method, headers:extra});
    const bytes = Buffer.from(await r.arrayBuffer());
    requests.push({path,status:r.status,method,type:r.headers.get('content-type')});
    assert.equal(r.status,status,`${method} ${path}: ${bytes.toString().slice(0,600)}`);
    if (protectedResponse && path.includes('/blog')) {
      assert(r.headers.get('cache-control')?.split(',').every(token => token.trim() === 'no-store'),path);
      assert.equal(r.headers.get('etag'),null,path);
    }
    if (method === 'HEAD') assert.equal(bytes.length,0);
    return {body:bytes.toString(),bytes,r};
  }
  async function feed(prefix = '') {
    const {body,r} = await get(prefix+'/blog/rss.xml');
    assert.match(r.headers.get('content-type'),/^application\/rss\+xml/);
    const parsed = spawnSync('php',['-r', '$x=simplexml_load_string(stream_get_contents(STDIN));if($x===false)exit(1);$a=[];foreach($x->channel->item as $i)$a[]=["title"=>(string)$i->title,"href"=>(string)$i->link,"guid"=>(string)$i->guid,"date"=>(string)$i->pubDate,"description"=>(string)$i->description];echo json_encode($a,JSON_THROW_ON_ERROR);'],{input:body,encoding:'utf8'});
    assert.equal(parsed.status,0,parsed.stderr);
    return JSON.parse(parsed.stdout);
  }
  const paths = slug => {
    const [key,entry] = Object.entries(active.articles).find(([,a])=>a.slug===slug && a.locale==='ru');
    return Object.entries(entry.files).map(([file,meta])=>({url:`${entry.prefix}/${active.generation}/${key}/${file}`,...meta}));
  };
  const clock = () => writeFileSync('/app/blog-clock.txt','2026-11-12T12:00:00Z');
  try {
    clock();
    assert.equal(expected.length,17);
    const found = [];
    for (const [page,count] of [[1,6],[2,6],[3,5]]) {
      const props = pageProps((await get('/blog'+(page===1?'':`?page=${page}`))).body);
      assert.equal(props.blog.total,17); assert.equal(props.blog.articles.length,count);
      assert.equal(props.blog.pagination.pageSize,6); assert.equal(props.blog.pagination.pages,3);
      assert.equal(props.meta.canonical,base+'/blog'+(page===1?'':`?page=${page}`));
      assert.equal(props.blog.pagination.first,'/blog'); assert.equal(props.blog.pagination.last,'/blog?page=3');
      assert.equal(props.blog.pagination.previous,page===1?null:page===2?'/blog':'/blog?page=2');
      assert.equal(props.blog.pagination.next,page===3?null:`/blog?page=${page+1}`);
      found.push(...props.blog.articles);
    }
    assert.deepEqual(found.map(p=>p.slug),expected.map(p=>p.slug));
    for (const post of expected) {
      const document = resolve('/app',post.document);
      assert.equal(hash(readFileSync(document)),post.document_sha256,post.slug);
      for (const asset of post.assets) assert.equal(hash(readFileSync(resolve('/app',asset.path))),asset.sha256);
      const props=pageProps((await get(post.href)).body);
      assert.equal(props.blog.article.title,post.title); assert.equal(props.blog.article.description,post.description);
      assert.equal(Date.parse(props.blog.article.date),Date.parse(post.date));
      assert.equal(props.meta.canonical,base+post.href);
      await get(post.href,200,'HEAD');
      const outputs=paths(post.slug);
      for (const asset of post.assets) {
        const output=outputs.find(o=>o.hash===asset.sha256);
        assert(output,'Original bytes must exist in guarded build: '+asset.path);
        const {bytes,r}=await get(output.url);
        assert.equal(hash(bytes),asset.sha256);
        assert.equal(r.headers.get('content-type'),output.mime);
        await get(output.url,200,'HEAD');
        if (output.mime === 'video/mp4') {
          assert.equal(r.headers.get('accept-ranges'),'bytes');
          for (const [range,start,end] of [['bytes=0-1',0,1],['bytes=100-',100,bytes.length-1],['bytes=-16',bytes.length-16,bytes.length-1]]) {
            const partial=await get(output.url,206,'GET',{Range:range});
            assert.equal(partial.r.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
            assert(partial.bytes.equals(bytes.subarray(start,end+1)));
          }
          const unsatisfiable=await get(output.url,416,'GET',{Range:`bytes=${bytes.length}-`});
          assert.equal(unsatisfiable.r.headers.get('content-range'),`bytes */${bytes.length}`);
          assert.equal(unsatisfiable.bytes.length,0);
          assert.equal((await get(output.url,200,'HEAD',{Range:'bytes=0-1'})).r.headers.get('content-length'),String(bytes.length));
          assert((await get(output.url,200,'GET',{Range:'bytes=0-1','If-Range':'old'})).bytes.equals(bytes));
        }
      }
    }
    for (const [year,count] of [[2025,11],[2026,6]]) assert.equal(pageProps((await get('/blog/archive/'+year)).body).blog.total,count);
    const rss=await feed(); assert.deepEqual(rss.map(i=>new URL(i.href).pathname),expected.map(i=>i.href));
    rss.forEach((item,i)=>{assert.equal(item.guid,item.href);assert.equal(item.title,expected[i].title);assert.equal(item.description,expected[i].description);assert.equal(Date.parse(item.date),Date.parse(expected[i].date));});
    writeFileSync('/evidence/authored-rss.xml',(await get('/blog/rss.xml')).body);
    const latest=pageProps((await get('/')).body).latestArticles;
    assert.deepEqual(latest.items.map(i=>i.slug),expected.slice(0,2).map(i=>i.slug));
    assert.equal(pageProps((await get('/en/blog')).body).blog.total,0);assert.deepEqual(await feed('/en'),[]);
    assert.equal(pageProps((await get('/en')).body).latestArticles.items.length,0);
    await get('/en/blog/telegram-25',404);await get('/blog?page=0',400);await get('/blog?page=4',404);await get('/blog/unknown',404);await get('/blog/tags/unknown',404);
    // Warmed policy: actual clips, posters, chunks, photo, list/latest/RSS all revoke together.
    for (const slug of ['telegram-13','telegram-24','telegram-25']) {
      const file=resolve(site,'ru/blog',slug+'.mdx'), original=readFileSync(file,'utf8');
      try {
        for (const transform of [s=>s.replace('draft: false','draft: true'),s=>s.replace(/^date:.*$/m,'date: "2099-01-01T00:00:00Z"')]) {
          writeFileSync(file,transform(original));
          await get('/blog/'+slug,404);
          for (const output of paths(slug)) for (const method of ['GET','HEAD']) await get(output.url,404,method,{Range:'bytes=0-1','If-None-Match':'old','If-Modified-Since':'Thu, 01 Jan 2099 00:00:00 GMT'});
          assert.equal(pageProps((await get('/blog')).body).blog.total,16);
          assert(!(await feed()).some(i=>i.href===base+'/blog/'+slug));
          assert(!pageProps((await get('/')).body).latestArticles.items.some(i=>i.slug===slug));
          writeFileSync(file,original);await get('/blog/'+slug);
        }
        writeFileSync(file,original+'\nChanged body.\n');await get('/blog/'+slug,503);
        for (const output of paths(slug)) await get(output.url,404);
      } finally {writeFileSync(file,original);}
    }
    const configPath=resolve(site,'site.json'), originalConfig=readFileSync(configPath,'utf8');
    try {
      const c=JSON.parse(originalConfig);c.blog.enabled=false;writeFileSync(configPath,JSON.stringify(c));
      await get('/blog',404,'GET',{},false);await get('/blog/rss.xml',404);await get('/blog/telegram-13',404,'GET',{},false);
      for (const output of paths('telegram-13')) await get(output.url,404);
    } finally {writeFileSync(configPath,originalConfig);}
    assert.equal(readFileSync('local/build/blog/active.json').equals(activeBytes),true,'Guard changes require no rebuild');
    const publicFiles=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?publicFiles(resolve(dir,e.name)):[resolve(dir,e.name)]);
    for (const file of publicFiles('public/build')) {
      const data=readFileSync(file);
      assert(!expected.some(post=>data.includes(Buffer.from(post.text.slice(0,100)))),'No authored body in public graph: '+file);
      assert(!expected.flatMap(p=>p.assets).some(a=>hash(data)===a.sha256),'No original assets in public build');
    }
    console.log('Authored HTTP: 17 RU / 0 EN, list 6/6/5, dates, RSS, latest, 13 original assets, draft/future/stale/disabled guards passed.');
  } finally {
    clock();writeFileSync('/evidence/authored-blog-http.json',JSON.stringify({generation:active.generation,expected:expected.map(p=>({slug:p.slug,date:p.date})),requests},null,2));
  }
}
if(process.argv[1]?.endsWith('/authored-blog-http.mjs')) await verifyAuthoredBlog();
