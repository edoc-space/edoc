import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const calls = [];
function cli(...args) {
  const r = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', args, {encoding:'utf8',maxBuffer:8*1024*1024});
  const output=(r.stdout??'')+(r.stderr??'');calls.push({args,status:r.status,output});writeFileSync('/evidence/layout-diagnostic.json',JSON.stringify(calls,null,2));
  assert.equal(r.status,0,output);assert(!output.includes('### Error'),output);
}
try {
  cli('open','http://nginx/design-kit','--config','/opt/browser/cli.config.json');cli('snapshot');
  cli('run-code',`async page => {
    await page.setViewportSize({width:390,height:844});
    const tabs=page.locator('.markdown-tabs--ui').first();await tabs.getByRole('tab').nth(1).click();
    const measure=()=>page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,25).map(n=>({tag:n.tagName,class:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right,minWidth:getComputedStyle(n).minWidth,columns:getComputedStyle(n).gridTemplateColumns}))}));
    const before=await measure();await tabs.scrollIntoViewIfNeeded();await page.screenshot({path:'/evidence/tabs-mobile-before.png'});
    await page.addStyleTag({content:'.markdown-tabs--ui .tabs {grid-template-columns:minmax(0,1fr);min-width:0} .markdown-tabs--ui .tabs-panel {min-width:0}'});
    const after=await measure();await page.screenshot({path:'/evidence/tabs-mobile-after.png'});
    if(after.scrollWidth>after.width)throw Error(JSON.stringify({before,after}));
    return {before,after,singleFactor:'grid min-content sizing'};
  }`);
} finally {spawnSync('/opt/browser/node_modules/.bin/playwright-cli',['close'],{encoding:'utf8'});}
