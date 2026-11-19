import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const calls=[];
function cli(...args){const r=spawnSync('/opt/browser/node_modules/.bin/playwright-cli',args,{encoding:'utf8',maxBuffer:8*1024*1024});const output=(r.stdout??'')+(r.stderr??'');calls.push({args,status:r.status,output});writeFileSync('/evidence/project-diagnostic.json',JSON.stringify(calls,null,2));assert.equal(r.status,0,output);assert(!output.includes('### Error'),output);}
try{
 cli('open','http://nginx/en','--config','/opt/browser/cli.config.json');cli('snapshot');
 cli('run-code',`async page=>{
  await page.setViewportSize({width:1440,height:1000});const links=page.locator('.personal-projects a.markdown-card-link');await links.first().waitFor();const results=[];
  for(let i=0;i<2;i++){
   const link=links.nth(i),href=await link.getAttribute('href');
   for(const part of ['.markdown-card__media','.markdown-card__metadata','.markdown-card__content','edge','keyboard','newtab']){
    await link.scrollIntoViewIfNeeded();
    const geometry=await link.evaluate(n=>{const r=n.getBoundingClientRect(),card=n.firstElementChild.getBoundingClientRect();const hit=(x,y)=>{const e=document.elementFromPoint(x,y);return e?.tagName+'.'+e?.className};return {rect:r.toJSON(),card:card.toJSON(),centerHit:hit(r.x+r.width/2,r.y+r.height/2),edgeHit:hit(r.x+r.width/2,r.bottom-5),scrollY}});
    results.push({i,part,geometry});console.log(JSON.stringify(results.at(-1)));
    try{
     if(part==='keyboard'){await link.focus();await page.keyboard.press('Enter');}
     else if(part==='edge'){const r=await link.boundingBox();await link.click({position:{x:r.width/2,y:r.height-5},timeout:3000});}
     else if(part==='newtab'){const [p]=await Promise.all([page.context().waitForEvent('page'),link.click({modifiers:['ControlOrMeta'],timeout:3000})]);await p.waitForLoadState();await p.close();continue;}
     else await link.locator(part).click({timeout:3000});
     await page.waitForURL('http://nginx'+href);await page.goBack();await link.waitFor();
    }catch(error){await page.screenshot({path:'/evidence/project-diagnostic-failure.png'});return {results,error:String(error)};}
   }
  }return {results};
 }`);
}finally{spawnSync('/opt/browser/node_modules/.bin/playwright-cli',['close'],{encoding:'utf8'});}
