import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const authored=process.argv[2]==='authored', root='/evidence/'+(authored?'authored':'default')+'/article-cards';
mkdirSync(root,{recursive:true});
const calls=[];
function cli(...args){
  const r=spawnSync('/opt/browser/node_modules/.bin/playwright-cli',args,{encoding:'utf8',maxBuffer:24*1024*1024});
  const output=(r.stdout??'')+(r.stderr??'')+(r.error?.stack??'');calls.push({args,status:r.status,output});
  writeFileSync(root+'/browser.json',JSON.stringify(calls,null,2));
  assert.equal(r.status,0,output);assert(!output.includes('### Error'),output);
}
async function check(page,authored,root){
  const ok=(value,label)=>{if(!value)throw Error(label);}, base='http://nginx',results=[],errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const links=(p,scope)=>p.locator(scope+' a.markdown-card-link').filter({has:p.locator('.blog-card')});
  const ready=async(p,url,scope,count)=>{const response=await p.goto(base+url);ok(response.status()===200,'Fresh entry '+url);await p.locator(scope).waitFor();if(count)await links(p,scope).first().waitFor();};
  for(const width of [1440,390])for(const prefix of ['','/en'])for(const surface of ['latest','blog']){
    const scope=surface==='latest'?'.latest-articles':'.blog-list',url=surface==='latest'?(prefix||'/'):prefix+'/blog';
    const expected=authored?(prefix?0:surface==='latest'?2:6):surface==='latest'?2:prefix?3:5;
    await page.setViewportSize({width,height:width===390?844:1000});await ready(page,url,scope,expected);
    const cards=links(page,scope);ok(await cards.count()===expected,`Card count ${url}`);
    if(!expected){ok(await page.locator(scope+' .collection-empty').isVisible(),'Honest empty state');continue;}
    for(const link of await cards.all()){
      ok(await link.evaluate(n=>n.tagName==='A'&&n.href&&document.getElementById(n.getAttribute('aria-labelledby'))?.textContent===n.querySelector('h2')?.textContent),'Native link with heading name');
      ok(await link.locator('a,button,input,select,textarea').count()===0,'No nested controls');
      ok(await link.evaluate(n=>getComputedStyle(n).textDecorationLine==='none'),'Card is not a paragraph-wide text underline');
      const r=await link.boundingBox(),c=await link.locator('.blog-card').boundingBox();
      ok(Math.abs(r.width-c.width)<2&&Math.abs(r.height-c.height)<2,'Whole card link geometry');
    }
    const styles=await cards.locator('.blog-card').evaluateAll(ns=>ns.map(n=>{const s=getComputedStyle(n);return [s.borderLeftWidth,s.borderRightWidth,s.borderTopWidth,s.borderBottomWidth,s.backgroundImage,s.paddingLeft].join('|');}));
    ok(styles.every(s=>s===styles[0]),'Siblings have identical borders/background/padding');
    if(authored){ok(styles[0].startsWith('1px|1px|1px|1px|'),'Full private card frame');}
    const images=cards.locator('.markdown-card__media img');
    for(const image of await images.all()){
      await image.scrollIntoViewIfNeeded();
      ok(await image.evaluate(async n=>{await n.decode();return n.naturalWidth>0&&getComputedStyle(n).objectFit==='contain';}),'Complete original raster without stretching/cropping');
    }
    if(!prefix){ok(await images.count()>0,'Media present on latest and blog');ok(await cards.filter({hasNot:page.locator('img')}).count()>0,'Text-only card omits media');}
    await cards.first().focus();ok(await cards.first().evaluate(n=>getComputedStyle(n).outlineStyle!=='none'),'Visible keyboard focus');
    const href=await cards.first().getAttribute('href');await page.keyboard.press('Enter');await page.waitForURL(base+href);await page.goBack();await cards.first().waitFor();
    const [popup]=await Promise.all([page.context().waitForEvent('page'),cards.first().click({modifiers:['ControlOrMeta']})]);
    await popup.waitForLoadState();ok(new URL(popup.url()).pathname===href,'Native new tab');await popup.close();
    // Click every rendered region, including free card padding, then restore the same selection.
    for(const zone of ['.markdown-card__metadata','h2','.markdown-card__content','.markdown-card__media','padding']){
      const link=zone==='.markdown-card__media'?cards.filter({has:page.locator('img')}).first():cards.first();
      if(!await link.count())continue;
      const target=await link.getAttribute('href');
      if(zone==='padding'){const r=await link.boundingBox();await link.click({position:{x:8,y:r.height-8}});}else if(zone === '.markdown-card__content' && authored) {
        ok(!await link.locator('.blog-card__description').isVisible(),'Personal description hidden');
        continue;
      } else await link.locator(zone).click();
      await page.waitForURL(base+target);await page.goBack();await cards.first().waitFor();
    }
    await page.reload();await cards.first().waitFor();ok(await cards.count()===expected,'Reload and Back preserve selection');
    for(const image of await images.all()){await image.scrollIntoViewIfNeeded();await image.evaluate(n=>n.decode());}
    await page.mouse.move(0,0);await page.evaluate(()=>document.fonts.ready);
    await page.locator(scope).screenshot({path:root+`/${surface}-${prefix?'en':'ru'}-${width}.png`,animations:'disabled'});
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
    if(authored&&!prefix&&surface==='blog'){
      await ready(page,'/blog?page=2',scope,6);
      const poster=page.locator('.blog-list a[href="/blog/telegram-13"] img');await poster.scrollIntoViewIfNeeded();
      ok(await poster.evaluate(async n=>{await n.decode();return n.naturalWidth>0;}),'Original video poster in blog card');
      await poster.locator('..').locator('..').screenshot({path:root+`/video-poster-${width}.png`,animations:'disabled'});
    }
    results.push({surface,prefix,width,expected,images:await images.count(),keyboard:true,newTab:true,regions:true,back:true,reload:true});
  }
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try{
    const touch=await context.newPage();
    for(const prefix of authored?['']:['','/en'])for(const surface of ['latest','blog']){
      const scope=surface==='latest'?'.latest-articles':'.blog-list',url=surface==='latest'?(prefix||'/'):prefix+'/blog';
      await ready(touch,url,scope,1);const link=links(touch,scope).first(),href=await link.getAttribute('href');
      await link.tap({position:{x:10,y:10}});await touch.waitForURL(base+href);await touch.goBack();await links(touch,scope).first().waitFor();
    }
  }finally{await context.close();}
  ok(!errors.length,errors.join('\n'));return {results,actualTouch:true,errors};
}
try{
  cli('open','http://nginx','--config','/opt/browser/cli.config.json');cli('snapshot');
  cli('run-code',`async page=>(${check.toString()})(page,${authored},${JSON.stringify(root)})`);
}catch(error){
  try{cli('run-code',`async page=>{await page.screenshot({path:${JSON.stringify(root+'/failure.png')},fullPage:true});return {url:page.url(),body:(await page.locator('body').innerText()).slice(0,1200)}}`);}catch{}
  throw error;
}finally{spawnSync('/opt/browser/node_modules/.bin/playwright-cli',['close'],{encoding:'utf8'});}
