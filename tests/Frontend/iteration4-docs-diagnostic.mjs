import { existsSync, symlinkSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

assert(process.cwd().startsWith('/app/'));
if (!existsSync('/app/public')) symlinkSync(resolve('public'), '/app/public');
writeFileSync('/app/blog-test-prepend.php', readFileSync('tests/Support/blog-fpm-prepend.php'));
writeFileSync('public/.user.ini', 'auto_prepend_file=/app/blog-test-prepend.php\n');
writeFileSync('/app/blog-clock.txt', '2026-11-12T12:00:00Z');
mkdirSync('.playwright-cli', { recursive: true });
const build=spawnSync('yarn',['build'],{encoding:'utf8'});
writeFileSync('/evidence/i4-docs-diagnostic-build.log',build.stdout+build.stderr);
assert.equal(build.status,0,build.stdout+build.stderr);
const diagnostic=()=>{
 const code=String.raw`require 'vendor/autoload.php'; $r=new App\Feature\Theme\ThemeResolver(getcwd(),realpath('local/storage/edoc')); $m=json_decode(file_get_contents('public/build/theme.json'),true); $t=$r->resolve(); $ref=new ReflectionClass($r); $roots=$ref->getMethod('inputRoots')->invoke($r,$t); $paths=$ref->getMethod('pathRoots')->invoke($r,$t); $actual=$ref->getMethod('inputHashes')->invoke($r,array_keys($m['inputs']),$roots,$paths); $diff=[]; foreach($m['inputs'] as $key=>$hash) if(($actual[$key]??null)!==$hash) $diff[$key]=['built'=>$hash,'current'=>$actual[$key]??null]; echo json_encode(['diagnostic'=>$r->diagnostic($m),'changedInputs'=>$diff]);`;
 const result=spawnSync('php',['-r',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
};
const results=[{phase:'after-build',...diagnostic()}];
for(let request=1;request<=3;request++){
 const response=await fetch('http://nginx/docs/content/markdown-and-mdx');
 const html=await response.text();writeFileSync('/evidence/i4-docs-diag-'+request+'.html',html);
 results.push({request,status:response.status,inertia:html.includes('data-page='),...diagnostic()});
}
rmSync('.playwright-cli', { recursive: true, force: true });
const removed=diagnostic();
assert.equal(removed.diagnostic?.code,'theme.stale','CLI root is a recorded build inventory input');
assert(removed.changedInputs['dir:engine:.'],'Exact changed input must be engine root inventory');
const withoutCli=await fetch('http://nginx/docs/content/markdown-and-mdx');
assert.equal(withoutCli.status,503);
results.push({phase:'without-cli-directory',status:withoutCli.status,...removed});
mkdirSync('.playwright-cli', { recursive: true });
const restored=diagnostic();
assert.equal(restored.diagnostic,null);
const withCli=await fetch('http://nginx/docs/content/markdown-and-mdx');
assert.equal(withCli.status,200);
results.push({phase:'restored-cli-directory',status:withCli.status,...restored});
writeFileSync('/evidence/i4-docs-diagnostic.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
