import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const calls=[];
function cli(...args){const r=spawnSync('/opt/browser/node_modules/.bin/playwright-cli',args,{encoding:'utf8',maxBuffer:16*1024*1024});const output=(r.stdout??'')+(r.stderr??'')+(r.error?.stack??'');calls.push({args,status:r.status,output});writeFileSync('/evidence/rework-public-docs.json',JSON.stringify(calls,null,2));assert.equal(r.status,0,output);assert(!output.includes('### Error'),output);}
try{
 cli('open','http://nginx/docs/content/themes','--config','/opt/browser/cli.config.json');cli('snapshot');
 cli('run-code',`async page=>{
  const checks=[];const ok=(v,m)=>{if(!v)throw Error(m)};const near=(a,b,m)=>ok(Math.abs(a-b)<3,m+': '+a+' / '+b);
  for(const prefix of ['', '/ru']){
   await page.setViewportSize({width:1440,height:1000});await page.goto('http://nginx'+prefix+'/docs/content/themes');await page.locator('.docs-document:not([aria-busy=true])').waitFor();
   const header=page.locator('.docs-header'),side=page.locator('.docs-sidebar');
   const geometry=()=>page.evaluate(()=>{const h=document.querySelector('.docs-header').getBoundingClientRect(),s=document.querySelector('.docs-sidebar').getBoundingClientRect(),f=document.querySelector('.docs-footer').getBoundingClientRect(),t=document.querySelector('.docs-sidebar-tools').getBoundingClientRect();return {headerBottom:h.bottom,sideTop:s.top,sideBottom:s.bottom,footerTop:f.top,footerBottom:f.bottom,toolsTop:t.top,scrollWidth:document.documentElement.scrollWidth,width:innerWidth}});
   let g=await geometry();ok(g.sideTop>=g.headerBottom-1,'Fresh docs sidebar below header');
   ok(await page.locator('.docs-onpage a').count()>0,'Actual documentation has a TOC');
   await page.locator('.docs-onpage a').last().click();ok(new URL(page.url()).hash.length>1,'TOC link updates hash');
   await page.screenshot({path:'/evidence/default-docs-sticky-'+(prefix?'ru':'en')+'.png'});
   for(const width of [1100,1440]){await page.setViewportSize({width,height:1000});g=await geometry();ok(g.sideTop>=g.headerBottom-1,'Resize preserves header offset');}
   await page.locator('.docs-sidebar-collapse').click();ok(await side.locator('nav').evaluate(n=>n.inert),'Collapsed actual docs tree is inert');await page.locator('.docs-sidebar-collapse').click();
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));g=await geometry();near(g.sideBottom,g.footerBottom,'Sidebar/footer bottom');near(g.toolsTop,g.footerTop,'Sidebar/footer band');ok(g.sideTop>=g.headerBottom-1,'Sidebar remains under header at footer');ok(g.scrollWidth<=g.width,'Docs no horizontal overflow');
   ok(await page.locator('.docs-footer a').evaluateAll(links=>links.every(link=>{const r=link.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&link.contains(document.elementFromPoint(x,y))})),'Every footer link receives pointer input, including under the TOC column');
   await page.screenshot({path:'/evidence/default-docs-footer-'+(prefix?'ru':'en')+'.png'});checks.push({prefix,...g});
  }
  return checks;
 }`);
}catch(error){try{cli('run-code','async page=>{await page.screenshot({path:"/evidence/public-docs-failure.png",fullPage:true});return {url:page.url(),text:(await page.locator("body").innerText()).slice(-2000)}}')}catch{}throw error;}
finally{spawnSync('/opt/browser/node_modules/.bin/playwright-cli',['close'],{encoding:'utf8'});}
