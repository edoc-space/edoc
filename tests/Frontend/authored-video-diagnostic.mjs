import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const calls=[];
function cli(...args){const r=spawnSync('/opt/browser/node_modules/.bin/playwright-cli',args,{encoding:'utf8',maxBuffer:8*1024*1024});const output=(r.stdout??'')+(r.stderr??'')+(r.error?.stack??'');calls.push({args,status:r.status,output});writeFileSync('/evidence/video-diagnostic.json',JSON.stringify(calls,null,2));assert.equal(r.status,0,output);assert(!output.includes('### Error'),output);}
try{
 cli('open','http://nginx/blog/telegram-13','--config','/opt/browser/cli.config.json');cli('snapshot');
 cli('run-code',`async page=>{
  await page.locator('.blog-document:not([aria-busy=true]) video').first().waitFor();
  const report=[];
  for(const video of await page.locator('video').all()){
   await video.scrollIntoViewIfNeeded();await video.click();
   report.push(await video.evaluate(async v=>{
    const ranges=r=>Array.from({length:r.length},(_,i)=>[r.start(i),r.end(i)]);
    const state=()=>({time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,ready:v.readyState,network:v.networkState,buffered:ranges(v.buffered),seekable:ranges(v.seekable),error:v.error?.message,paused:v.paused});
    const events=[];for(const type of ['playing','progress','waiting','seeking','seeked','error','canplaythrough'])v.addEventListener(type,()=>events.push({type,...state()}));
    const before=state();await v.play();await new Promise(r=>setTimeout(r,1200));v.pause();const played=state();
    v.currentTime=Math.min(2,v.duration/2);await new Promise(r=>setTimeout(r,1500));const sought=state();
    v.preload='auto';await v.play();await new Promise(r=>setTimeout(r,1800));v.pause();const preloadAuto=state();
    v.currentTime=Math.min(3,v.duration/2);await new Promise(r=>setTimeout(r,1500));const soughtAuto=state();
    return {src:v.currentSrc,before,played,sought,preloadAuto,soughtAuto,events};
   }));
  }
  await page.screenshot({path:'/evidence/video-diagnostic.png',fullPage:true});return report;
 }`);
}finally{spawnSync('/opt/browser/node_modules/.bin/playwright-cli',['close'],{encoding:'utf8'});}
