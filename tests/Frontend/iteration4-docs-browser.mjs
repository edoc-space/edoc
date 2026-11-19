import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.cwd().startsWith('/app/')) throw new Error('Documentation browser requires disposable runtime');
if (!existsSync('/app/public')) symlinkSync(resolve('public'), '/app/public');
writeFileSync('/app/blog-test-prepend.php', readFileSync('tests/Support/blog-fpm-prepend.php'));
writeFileSync('public/.user.ini', 'auto_prepend_file=/app/blog-test-prepend.php\n');
writeFileSync('/app/blog-clock.txt', '2026-11-12T12:00:00Z');
const probe = await fetch('http://nginx/docs/content/markdown-and-mdx');
const initialHtml = await probe.text();
writeFileSync('/evidence/i4-docs-initial.html', initialHtml);
assert.equal(probe.status, 200, initialHtml.slice(0, 800));
assert(initialHtml.includes('data-page='), initialHtml.slice(0, 1200));

// Actual public documentation tree; no synthetic fixture replaces its articles.
const calls = [];
const cliPath = '/opt/browser/node_modules/.bin/playwright-cli';
function cli(...args) {
  const result = spawnSync(cliPath, args, { encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  calls.push({ args, status: result.status, error: result.error?.message, output });
  writeFileSync('/evidence/i4-docs-cli.json', JSON.stringify(calls, null, 2));
  assert.equal(result.status, 0, result.error?.message || output);
  assert(!output.includes('### Error'), output);
  return output;
}
try {
  cli('open', 'http://nginx/docs/content/markdown-and-mdx', '--config', '/opt/browser/cli.config.json');
  cli('snapshot');
  cli('run-code', `async page => {
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:1440,height:1000});
    const names=${JSON.stringify(process.argv.includes('--rework') ? ['markdown-and-mdx','site-pages','themes','block-catalog'] : ['markdown-and-mdx','site-pages','themes','blog','content-model','languages','rss','block-catalog','plugins-overview'])};
    const results=[]; const links=new Set();
    for(const language of ['en','ru']) {
      const prefix=language==='en'?'':'/ru';
      for(const name of names) {
        const path=prefix+'/docs/'+(name==='plugins-overview'?'plugins/overview':'content/'+name);
        const response=await page.goto('http://nginx'+path);
        if(response.status()!==200) throw new Error(path+': HTTP '+response.status());
        const article=page.locator('.docs-document');
        await article.getByRole('heading',{level:1}).waitFor();
        await page.waitForTimeout(150);
        const text=await article.innerText();
        if(text.length<60 || /MDX module not found:|Failed to load MDX module:|ReferenceError:|Error:/.test(text)) throw new Error(path+': render failure '+text.slice(-500));
        if(name==='markdown-and-mdx') {
          const label=language==='ru'?'Первый':'First';
          const other=language==='ru'?'Второй':'Second';
          await article.getByRole('button',{name:label+': 0',exact:true}).click();
          await article.getByRole('button',{name:label+': 1',exact:true}).waitFor();
          await article.getByRole('button',{name:other+': 0',exact:true}).waitFor();
          const locales=await article.locator('.component-example > span').allTextContents();
          if(locales.join()!==[language,language].join()) throw new Error(path+': context '+locales);
        }
        if(name==='block-catalog') await article.locator('[data-catalog-instance]').first().waitFor();
        const examples=article.locator('img[src*="/examples/composition/"]');
        for(const image of await examples.all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(async node=>{await node.decode();if(!node.complete||node.naturalWidth===0)throw Error('Documentation example image failed to decode: '+node.src)});
        }
        if(await examples.count()) await examples.last().screenshot({path:'/evidence/i4-image-'+language+'-'+name+'.png'});
        if(name==='markdown-and-mdx') await article.locator('.component-example').first().scrollIntoViewIfNeeded();
        for(const href of await article.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')))) {
          const url=new URL(href,'http://nginx'+path);
          if(url.origin==='http://nginx' && /^\\/(?:ru\\/)?docs\\//.test(url.pathname)) links.add(url.pathname);
        }
        if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)) throw new Error(path+': horizontal overflow');
        await page.screenshot({path:'/evidence/i4-docs-'+language+'-'+name+'-desktop.png',fullPage:false});
        results.push({language,path,name,textLength:text.length});
      }
    }
    const brokenLinks=[];
    for(const path of links) {
      const response=await page.request.get('http://nginx'+path);
      if(response.status()!==200) brokenLinks.push({path,status:response.status()});
    }
    await page.setViewportSize({width:390,height:844});
    for(const name of ${JSON.stringify(process.argv.includes('--rework') ? ['markdown-and-mdx','site-pages','themes','block-catalog'] : ['markdown-and-mdx','rss','block-catalog'])}) {
      await page.goto('http://nginx/ru/docs/content/'+name);
      await page.locator('.docs-document').getByRole('heading',{level:1}).waitFor();
      if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)) throw new Error(name+': mobile overflow');
      await page.screenshot({path:'/evidence/i4-docs-ru-'+name+'-mobile.png',fullPage:false});
    }
    console.log(JSON.stringify({brokenLinks}));
    if(brokenLinks.length) throw new Error('Broken documentation links '+JSON.stringify(brokenLinks));
    if(errors.length) throw new Error(errors.join('\\n'));
    console.log(JSON.stringify({passed:results,documentationLinks:links.size,desktop:[1440,1000],mobile:[390,844],theme:'default'}));
  }`);
  cli('snapshot');
  cli('console', 'error');
} finally { cli('close'); }
