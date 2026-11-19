import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
const dir=await mkdtemp(join(tmpdir(),'headcount-model-test-'));
const originalFetch=globalThis.fetch;
try{
 const src=await readFile(new URL('../supabase/functions/headcount-query/model-client.ts',import.meta.url),'utf8');
 await writeFile(join(dir,'client.mjs'),ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 const {ModelClient,readModelConfig}=await import(join(dir,'client.mjs'));
 globalThis.Deno={env:{get:name=>({LLM_PROVIDER:'nvidia',GOOGLE_MODEL:'old-gemma',GOOGLE_AI_API_KEY:'test-google',NVIDIA_API_KEY:'test-nvidia'}[name])}};
 assert.equal(readModelConfig().model,'gemini-4-hydrogen');
 assert.equal(readModelConfig().provider,'google');
 const google=readModelConfig(),nvidia=readModelConfig('nvidia');
 const success=provider=>Response.json(provider==='google'?{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]}:{choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]});
 let calls=[];
 globalThis.fetch=async(url,options)=>{calls.push(url);const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');return success('google');};
 let client=new ModelClient(google,110000,nvidia);assert.equal((await client.generate('fixed test')).ok,true);assert.deepEqual([...client.usedProviders],['google']);assert.equal(calls.length,1);
 // HTTP errors, timeouts, malformed/truncated output all switch; following stages stay on NVIDIA.
 for(const failure of [()=>new Response('',{status:503}),()=>new Response('',{status:403}),()=>new Response('',{status:429}),()=>new Response('',{status:404}),()=>{throw new DOMException('timeout','TimeoutError');},()=>Response.json({candidates:[{content:{parts:[{text:'bad json'}]}}]}),()=>Response.json({candidates:[{finishReason:'MAX_TOKENS'}]})]){
  calls=[];globalThis.fetch=async url=>{calls.push(url);return url.includes('googleapis')?failure():success('nvidia');};
  client=new ModelClient(google,110000,nvidia);await client.generate('test');await client.generate('chart');assert.equal(calls.length,3);assert.equal(client.provider,'nvidia');assert.equal(client.events.length,1);assert.equal(calls.filter(u=>u.includes('googleapis')).length,1);
 }
 calls=[];globalThis.fetch=async url=>{calls.push(url);return success('nvidia');};
 client=new ModelClient(nvidia);await client.generate('direct');assert.equal(calls.length,1);assert.equal(calls[0].includes('nvidia.com'),true);
 globalThis.fetch=async()=>new Response('',{status:503});
 await assert.rejects(new ModelClient(google,110000,nvidia).generate('both fail'),e=>e.code==='MODEL_ALL_PROVIDERS_FAILED');
 calls=[];globalThis.fetch=async url=>{calls.push(url);return Response.json({candidates:[{finishReason:'SAFETY'}]});};
 await assert.rejects(new ModelClient(google,110000,nvidia).generate('blocked'),e=>e.code==='MODEL_CONTENT_BLOCKED');assert.equal(calls.length,1);
 globalThis.fetch=()=>{throw Error('deadline should skip fetch');};
 await assert.rejects(new ModelClient(google,0,nvidia).generate('expired'),e=>e.code==='MODEL_ALL_PROVIDERS_FAILED');
 console.log('Model routing checks passed: primary, direct NVIDIA, failover, sticky routing, both down, safety and deadline.');
}finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
