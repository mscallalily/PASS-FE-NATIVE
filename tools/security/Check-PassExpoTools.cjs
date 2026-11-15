#!/usr/bin/env node
'use strict';
// Inspects installed package metadata and synthetic objects only. No network,
// application configuration, signing key, document or database is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),req=createRequire(path.join(root,'package.json'));
function main(){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const expoReq=createRequire(req.resolve('expo/package.json'));
  const cliPath=expoReq.resolve('@expo/cli/package.json'),cli=JSON.parse(fs.readFileSync(cliPath,'utf8')),cliReq=createRequire(cliPath);
  const configPath=cliReq.resolve('@expo/config/package.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const configRoot=path.dirname(configPath),cliRoot=path.dirname(cliPath);
  let checks=0;const check=(_name,run)=>{run();checks++;};
  check('reviewed CLI installed',()=>assert.equal(cli.version,'58.1.18'));
  check('reviewed config installed',()=>assert.equal(config.version,'58.0.10'));
  const manifest=req(path.join(path.dirname(req.resolve('expo/package.json')),'bundledNativeModules.json'));
  const semver=req('semver'),project=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  for(const name of Object.keys(project.dependencies||{}).filter(name=>manifest[name]))check('local SDK range '+name,()=>{
    const installed=JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8'));
    assert.ok(semver.satisfies(installed.version,manifest[name]),name+' does not match the installed SDK\'s bundled range '+manifest[name]);
  });
  for(const file of [cliPath,configPath])check('installed metadata matches its lock entry',()=>{
    const rel=path.relative(root,path.dirname(file)).split(path.sep).join('/');assert.equal(lock.packages[rel]?.version,JSON.parse(fs.readFileSync(file,'utf8')).version);
  });
  check('CLI no longer declares Zod',()=>assert.equal(cli.dependencies?.zod,undefined));
  check('no Zod lock entries remain',()=>assert.equal(Object.keys(lock.packages).some(n=>/(?:^|\/)node_modules\/zod$/.test(n)),false));
  check('config no longer declares deepmerge',()=>assert.equal(config.dependencies?.deepmerge,undefined));
  check('Expo and signing consumers retain the reviewed Forge',()=>{
    for(const consumer of [cliReq,createRequire(req.resolve('@expo/code-signing-certificates/package.json'))])assert.equal(consumer('node-forge/package.json').version,'1.4.2');
  });
  const {mergeConfig}=req(path.join(configRoot,'build/mergeConfig.js'));
  const {serializeAndEvaluate,serializeSkippingMods}=req(path.join(configRoot,'build/Serialize.js'));
  const malicious=JSON.parse('{"session":{"__proto__":{"admin":true}},"__proto__":{"admin":true}}');
  for(const target of [{session:null},Object.create(null),JSON.parse('{"session":{"__proto__":{"admin":true}}}')])check('prototype input cannot become inherited privileges',()=>{
    const result=mergeConfig(target,malicious);assert.equal(result.admin,undefined);assert.equal(result.session.admin,undefined);
    assert.equal(Object.getPrototypeOf(result),Object.prototype);assert.equal(Object.getPrototypeOf(result.session),Object.prototype);
    assert.equal(Object.prototype.hasOwnProperty.call(result,'__proto__'),false);
  });
  check('normal nested configuration still merges',()=>assert.deepEqual(mergeConfig({extra:{enabled:true}},{extra:{zone:'M-04'}}),{extra:{enabled:true,zone:'M-04'}}));
  check('normal arrays preserve concatenation',()=>assert.deepEqual(mergeConfig({items:[1]},{items:[2]}),{items:[1,2]}));
  check('callers can retain their array policy',()=>assert.deepEqual(mergeConfig({items:[1]},{items:[2]},(_a,b)=>b),{items:[2]}));
  check('inherited input fields are excluded',()=>{
    const source=Object.assign(Object.create({inherited:'unsafe'}),{own:'kept'});assert.deepEqual(mergeConfig({},source),{own:'kept'});
  });
  check('shared non-circular values remain supported',()=>{
    const shared={ok:true};assert.deepEqual(mergeConfig({},{one:shared,two:shared}),{one:{ok:true},two:{ok:true}});
  });
  check('circular configuration is rejected',()=>{const source={};source.self=source;assert.throws(()=>mergeConfig({},source),/circular/i);});
  for(const serialize of [serializeAndEvaluate,serializeSkippingMods])check('serialization does not restore prototype payloads',()=>{
    const result=serialize(malicious);assert.equal(result.admin,undefined);assert.equal(result.session.admin,undefined);
    assert.equal(Object.getPrototypeOf(result),Object.prototype);assert.equal(Object.prototype.hasOwnProperty.call(result,'__proto__'),false);
  });
  const {PluginSchema}=req(path.join(cliRoot,'build/src/start/server/devtools/DevToolsPlugin.schema.js'));
  const schema=cliReq('@expo/schema-utils');
  check('valid DevTools metadata is still accepted',()=>assert.doesNotThrow(()=>schema.validate(PluginSchema,{packageName:'pass-synthetic',packageRoot:'/synthetic/pass'})));
  check('missing DevTools fields are rejected',()=>assert.throws(()=>schema.validate(PluginSchema,{})));
  check('invalid extension parameters are rejected',()=>assert.throws(()=>schema.validate(PluginSchema,{packageName:'pass-synthetic',packageRoot:'/synthetic/pass',cliExtensions:{description:'test',entryPoint:'index.js',commands:[{name:'test',title:'Test',environments:['cli'],parameters:[{name:'input',type:'unsupported'}]}]}})));
  console.log('PASS EXPO TOOLS CHECK | CLI '+cli.version+' | config '+config.version+' | '+checks+' checks');
  console.log('Zod removed; Expo configuration merge/serialization and DevTools validation checks passed.');
  console.log('A09 remains open: review the current npm audit for deepmerge (Jest), glob and minimatch.');
}
if(require.main===module)try{main();}catch(error){console.error('EXPO TOOLS CHECK FAILED: '+error.message);process.exitCode=1;}
module.exports={main};
