import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const wrapper=fileURLToPath(new URL('./aws.mjs',import.meta.url));
const config=JSON.parse(readFileSync(new URL('./production.json',import.meta.url),'utf8'));
function run(account,args){
 const dir=mkdtempSync(join(tmpdir(),'crossfire-ownership-'));
 try{
  const calls=join(dir,'calls.jsonl'),mock=join(dir,'aws');
  writeFileSync(mock,`#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({args:process.argv.slice(2),ambientCredential:!!process.env.AWS_ACCESS_KEY_ID})+'\\n');console.log(JSON.stringify({Account:${JSON.stringify(account)}}));\n`,{mode:0o700});
  const result=spawnSync(process.execPath,[wrapper,...args],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,AWS_ACCESS_KEY_ID:'test-ambient-credential'}});
  let invoked=[];try{invoked=readFileSync(calls,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}catch{}
  return {...result,invoked};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('wrong company account stops before the requested AWS operation',()=>{
 const r=run('000000000000',['ec2','describe-instances']);
 assert.equal(r.status,1);assert.equal(r.invoked.length,1);assert.match(r.stderr,/does not belong/);
});
test('verified Proteus account dispatches with explicit profile and no ambient credentials',()=>{
 const r=run(config.awsAccountId,['ec2','describe-instances']);
 assert.equal(r.status,0);assert.equal(r.invoked.length,2);
 for(const call of r.invoked){assert.equal(call.ambientCredential,false);assert.equal(call.args[1],config.awsProfile);assert.equal(call.args[3],config.region);}
});
test('full, abbreviated, and equals-form account or endpoint overrides are rejected',()=>{
 for(const flag of ['--profile','--prof','--region=us-west-2','--endpoint-url=https://example.com','--no-sign-request']){
  const r=run(config.awsAccountId,['ec2','describe-instances',flag]);
  assert.equal(r.status,2);assert.equal(r.invoked.length,0);
 }
});
