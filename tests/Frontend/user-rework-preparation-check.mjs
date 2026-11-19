import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { prepareSiteAcceptance } from './site-acceptance-prepare.mjs';
import { verifyAuthoredBlog } from './authored-blog-http.mjs';
import { verifyArticlePreviews } from './article-previews-http.mjs';

assert(process.cwd().startsWith('/app/'), 'Preparation checks require a disposable snapshot');
// Match the accepted regression clock; all imported authored posts predate it.
writeFileSync('/app/blog-clock.txt', '2026-11-12T12:00:00Z');
writeFileSync('/app/blog-test-prepend.php', readFileSync('tests/Support/blog-fpm-prepend.php'));
writeFileSync('public/.user.ini', 'auto_prepend_file=/app/blog-test-prepend.php\n');
const calls=[];
function run(argv, name) {
 const r=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',maxBuffer:24*1024*1024});
 const output=(r.stdout??'')+(r.stderr??'')+(r.error?.stack??'');
 writeFileSync(`/evidence/${name}.log`,output);assert.equal(r.status,0,output);return output;
}
function cli(...args) {
 const r=spawnSync('/opt/browser/node_modules/.bin/playwright-cli',args,{encoding:'utf8',maxBuffer:24*1024*1024});
 const output=(r.stdout??'')+(r.stderr??'')+(r.error?.stack??'');calls.push({args,status:r.status,output});
 writeFileSync('/evidence/preparation-browser.json',JSON.stringify(calls,null,2));assert.equal(r.status,0,output);assert(!output.includes('### Error'),output);
}
const site=resolve('../../local/me');
function authoredSources() {
 const files={};const walk=p=>{if(statSync(p).isDirectory())for(const name of readdirSync(p).sort())walk(resolve(p,name));else files[relative(site,p)]=createHash('sha256').update(readFileSync(p)).digest('hex');};
 for(const name of ['site.json','ru','en','components','theme','static'])walk(resolve(site,name));return files;
}
async function defaultCaptures(page) {
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://nginx/');await page.locator('.personal-doors > a').first().waitFor();
 if(await page.locator('[data-personal-theme]').count())throw Error('Public captures must use the default theme');
 if(await page.locator('.latest-articles .blog-card').count()!==2 || !(await page.locator('.latest-articles .blog-card h2').first().innerText()).startsWith('p01'))throw Error('The accepted fixed-clock latest fixture must be preserved');
 await page.locator('.latest-articles').screenshot({path:'/evidence/default-home-desktop.png'});
 await page.locator('.personal-doors > a').first().focus();await page.screenshot({path:'/evidence/default-card-links.png'});
 await page.goto('http://nginx/design-kit');await page.locator('.markdown-tabs--ui').first().waitFor();
 await page.locator('.markdown-tabs--ui').first().screenshot({path:'/evidence/default-tabs-desktop.png'});
 const video=page.locator('.docs-video').first();await video.scrollIntoViewIfNeeded();await page.screenshot({path:'/evidence/default-video-desktop.png'});
 if(await video.locator('iframe').count())throw Error('Video must remain opt-in in public captures');
 return {theme:'default',synthetic:true,artifacts:['default-home-desktop.png','default-card-links.png','default-tabs-desktop.png','default-video-desktop.png']};
}
try {
 const before=authoredSources();prepareSiteAcceptance('local');assert.deepEqual(authoredSources(),before,'Local preparation cannot replace authored sources');
 run(['node','tests/Frontend/user-rework-build.mjs','local'],'authored-production');assert.deepEqual(authoredSources(),before,'Authored build leaves content intact');
 writeFileSync('/evidence/authored-source-preservation.json',JSON.stringify({unchanged:true,files:before},null,2));
 await verifyAuthoredBlog();
 await verifyArticlePreviews();
 run(['node','tests/Frontend/article-cards-browser.mjs','authored'],'authored-article-cards');
 run(['node','tests/Frontend/user-rework-browser.mjs','authored'],'authored-ui');
 const fixture=prepareSiteAcceptance('default');
 writeFileSync('/evidence/composition-fixture.json',JSON.stringify({theme:'default',site:fixture.site,packageRoot:fixture.packageRoot}));
 run(['yarn','build'],'default-capture-production');
 run(['node','tests/Frontend/site-composition-browser.mjs'],'default-regression-ui');
 run(['node','tests/Frontend/article-cards-browser.mjs'],'default-article-cards');
 run(['node','tests/Frontend/user-rework-browser.mjs'],'default-rework-ui');
 writeFileSync('/evidence/default-capture-manifest.json',readFileSync('public/build/theme.json'));
 cli('open','http://nginx','--config','/opt/browser/cli.config.json');cli('snapshot');cli('run-code',`async page=>(${defaultCaptures.toString()})(page)`);
} catch(error) {
 try{cli('run-code','async page=>{await page.screenshot({path:"/evidence/preparation-failure.png",fullPage:true});return {url:page.url(),text:(await page.locator("body").innerText()).slice(0,1800)}}')}catch{}
 throw error;
} finally{spawnSync('/opt/browser/node_modules/.bin/playwright-cli',['close'],{encoding:'utf8'});}
