#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2);
if(!args.length){console.error('Usage: node deploy/aws.mjs <AWS service> <operation> [arguments]');process.exit(2);}
// Prevent flags or ambient credentials from bypassing the ownership check.
const forbidden=['--profile','--region','--endpoint-url','--no-sign-request'];
if(args.some(arg=>arg.startsWith('--')&&forbidden.some(flag=>flag.startsWith(arg.split('=')[0])))){
 console.error('Use the account and region recorded in deploy/production.json.');process.exit(2);
}
let config;
try{
 config=JSON.parse(readFileSync(new URL('./production.json',import.meta.url),'utf8'));
 if(!config||typeof config!=='object'||Array.isArray(config)
  ||typeof config.company!=='string'||!config.company.trim()
  ||typeof config.awsAccountId!=='string'||!/^\d{12}$/.test(config.awsAccountId)
  ||typeof config.awsProfile!=='string'||!config.awsProfile.trim()
  ||typeof config.region!=='string'||!config.region.trim())throw new Error('Invalid configuration');
}catch{
 console.error('Missing or invalid local deploy/production.json. Configure your verified account using deploy/production.example.json; never commit the populated file.');process.exit(2);
}
const env={...process.env};
for(const name of Object.keys(env))if(name.startsWith('AWS_'))delete env[name];
const common=['--profile',config.awsProfile,'--region',config.region,'--no-cli-pager'];
const identity=spawnSync('aws',[...common,'sts','get-caller-identity','--output','json'],{env,encoding:'utf8'});
if(identity.status!==0){console.error('AWS login unavailable. Renew the profile named in deploy/production.json.');process.exit(1);}
if(JSON.parse(identity.stdout).Account!==config.awsAccountId){
 console.error(`Refusing AWS operation: the active account does not belong to ${config.company}.`);process.exit(1);
}
const result=spawnSync('aws',[...common,...args],{env,stdio:'inherit'});
process.exit(result.status??1);
