import {checkResearchArticle} from '../website-ai.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readWebsiteAssisted} from '../website-ai.mjs';
import {WebsiteError,readWebsite} from '../website.mjs';
const input={url:'https://example.com/report',language:'zh',llm:{baseURL:'http://model.local/v1',model:'local'}};
const endpoint=(base,path)=>new URL(path,base+'/');
const text='A reported article containing exact statements from a named public source, without any invented claims or conclusions.';
const fetcher=data=>async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(data)},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
const failure=details=>async()=>{throw new WebsiteError('no_content',{pageText:text,pageURL:input.url,pageTitle:'Report',...details})};
test('normal extraction avoids model calls',async()=>{const data=await readWebsiteAssisted(input,{endpoint,reader:async()=>({text,title:'Report',url:input.url}),fetcher:async()=>assert.fail('unexpected model call')});assert.equal(data.extractionMethod,'readability');});
test('model fallback accepts only exact ordered page paragraphs',async()=>{const data=await readWebsiteAssisted(input,{endpoint,reader:failure(),fetcher:fetcher({paragraphs:[text]})});assert.equal(data.text,text);assert.equal(data.extractionMethod,'llm-verified');const bad=await readWebsiteAssisted(input,{endpoint,reader:failure(),fetcher:fetcher({paragraphs:[text+' invented']})});assert.equal(bad.text,undefined);assert.equal(bad.failure.error,'no_content');assert.ok(bad.failure.assistanceError);});
test('blocked page gets a diagnosis and cannot become a source',async()=>{const data=await readWebsiteAssisted(input,{endpoint,reader:async()=>{throw new WebsiteError('http_error',{status:403});},fetcher:fetcher({paragraphs:[],diagnosis:'网站拒绝请求，可能触发访问验证。',nextStep:'请在浏览器中确认访问权限。'})});assert.equal(data.failure.httpStatus,403);assert.match(data.failure.message,/403/);assert.match(data.failure.diagnosis,/拒绝/);assert.equal(data.text,undefined);});
test('missing model and model failures preserve original fetch diagnosis',async()=>{let data=await readWebsiteAssisted({url:input.url},{reader:failure()});assert.equal(data.failure.error,'no_content');data=await readWebsiteAssisted(input,{endpoint,reader:failure(),fetcher:async()=>{throw Error('secret upstream data');}});assert.equal(data.failure.error,'no_content');assert.doesNotMatch(JSON.stringify(data),/secret upstream/);});
test('parser failure supplies sanitized text, excluding page scripts',async()=>{await assert.rejects(readWebsite(input.url,{request:async()=>({bytes:Buffer.from('<html><body><p>Brief.</p><script>secret script</script></body></html>'),contentType:'text/html'})}),error=>{assert.equal(error.code,'no_content');assert.equal(error.pageText,'Brief.');return true;});});
test('transient upstream errors retry once; 403 and long Retry-After do not',async()=>{let calls=0;const delays=[];const page=await readWebsiteAssisted({url:input.url},{endpoint,sleep:async ms=>delays.push(ms),reader:async()=>{if(++calls===1)throw new WebsiteError('http_error',{status:503});return {text,title:'Recovered',url:input.url};}});assert.equal(page.title,'Recovered');assert.equal(calls,2);assert.equal(delays.length,1);for(const details of [{status:403},{status:429,retryAfter:'120'}]){calls=0;await readWebsiteAssisted({url:input.url},{endpoint,reader:async()=>{calls++;throw new WebsiteError('http_error',details);}});assert.equal(calls,1);}});
test('browser hydration can recover text before invoking the LLM',async()=>{const page=await readWebsiteAssisted(input,{endpoint,reader:failure({pageHTML:'<html></html>'}),renderer:async()=>({text,title:'Rendered',url:input.url,extractionMethod:'browser'}),fetcher:async()=>assert.fail('unexpected LLM')});assert.equal(page.extractionMethod,'browser');});
test('canvas-only and blocked pages require manual text',async()=>{
 const page=await readWebsiteAssisted(input,{endpoint,reader:failure({pageHTML:'<canvas></canvas>',pageText:''}),renderer:async()=>({pageText:''}),fetcher:fetcher({paragraphs:[]})});
 assert.equal(page.failure.error,'no_content');
 const blocked=await readWebsiteAssisted(input,{endpoint,reader:async()=>{throw new WebsiteError('http_error',{status:403});},renderer:async()=>assert.fail('blocked page rendered'),fetcher:fetcher({paragraphs:[]})});
 assert.equal(blocked.failure.manualAllowed,true);
});

test('a failed direct request can recover via native browser navigation', async () => {
 const calls = [];
 const page = await readWebsiteAssisted(input, {
  endpoint,
  reader: async () => { throw new WebsiteError('fetch_failed'); },
  renderer: async options => {
   calls.push(options);
   return {text, title:'Recovered', url:input.url, extractionMethod:'browser-direct'};
  },
  fetcher: async () => assert.fail('unexpected model call')
 });
 assert.equal(page.text, text);
 assert.equal(calls.length, 1);
 assert.equal(calls[0].native, true);
 assert.equal(calls[0].html, undefined);
 assert.deepEqual(page.attempts.map(attempt=>attempt.method), ['direct','browser-direct']);
});

test('native navigation follows HTML replay when neither direct parsing nor replay finds a body', async () => {
 const modes = [];
 const page = await readWebsiteAssisted(input, {
  endpoint,
  reader: failure({pageText:'',pageHTML:'<html></html>'}),
  renderer: async ({native}) => {
   modes.push(native);
   return native
    ? {text,title:'Recovered',url:input.url,extractionMethod:'browser-direct'}
    : {pageText:'',pageURL:input.url,images:[]};
  },
  fetcher: async () => assert.fail('unexpected model call')
 });
 assert.deepEqual(modes,[false,true]);
 assert.equal(page.text,text);
});

test('website assistance reports real phases without exposing model reasoning or page content in progress',async()=>{
 const phases=[];
 const data=await readWebsiteAssisted(input,{endpoint,reader:failure(),onProgress:event=>phases.push(event),fetcher:async()=>new Response(new ReadableStream({start(controller){
  controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{reasoning_content:'private model thought'}}]})+'\n\n'));
  controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({paragraphs:[text]})},finish_reason:'stop'}]})+'\n\n'));
  controller.close();
 }}),{headers:{'Content-Type':'text/event-stream'}})});
 assert.equal(data.text,text);
 assert.deepEqual(phases.map(event=>event.phase),['reading','model','thinking','generating']);
 assert.doesNotMatch(JSON.stringify(phases),/private model thought|reported article/);
});

test('cancelling webpage model assistance aborts the real model request and never returns a fallback source',async()=>{
 const controller=new AbortController();let requested=false;
 const work=readWebsiteAssisted(input,{endpoint,reader:failure(),signal:controller.signal,fetcher:async(_url,options)=>{requested=true;return await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(requested,true);controller.abort();
 await assert.rejects(work,{name:'AbortError'});
});

test('research check aborts the direct fetch at 8s and the render at 30s including its queue wait',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});
 let readSignal,renderSignal,startRender;
 const phases=[],url='https://example.org/story';
 const pending=new Promise(()=>{});
 const read=checkResearchArticle({url,articleStage:'read'},{
  reader:(_url,{signal})=>{readSignal=signal;return pending;}
 });
 t.mock.timers.tick(7999);
 assert.equal(readSignal.aborted,false);
 t.mock.timers.tick(1);
 const next=await read;
 assert.equal(readSignal.aborted,true);
 assert.deepEqual(next,{needsRender:true,remainingMs:22000});
 const render=checkResearchArticle({url,articleStage:'render',remainingMs:next.remainingMs},{
  onProgress:({phase})=>phases.push(phase),
  browserSlot:(_signal,work)=>new Promise(resolve=>{
   startRender=()=>resolve(work(({signal})=>{renderSignal=signal;return pending;}));
  })
 });
 t.mock.timers.tick(15000);
 assert.deepEqual(phases,['queuedRender']);
 startRender();
 t.mock.timers.tick(6999);
 assert.equal(renderSignal.aborted,false);
 t.mock.timers.tick(1);
 assert.equal((await render).failure.error,'timeout');
 assert.equal(renderSignal.aborted,true);
 assert.deepEqual(phases,['queuedRender','rendering']);
});

test('a render can time out in the shared browser queue before Chrome starts',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout']});
 const phases=[];
 let queuedSignal;
 const work=checkResearchArticle({url:'https://example.org/story',articleStage:'render',remainingMs:7000},{
  browserSlot:signal=>{queuedSignal=signal;return new Promise(()=>{});},
  onProgress:event=>phases.push(event.phase)
 });
 t.mock.timers.tick(7000);
 const {failure}=await work;
 assert.equal(failure.error,'timeout');
 assert.equal(failure.manualAllowed,true);
 assert.equal(queuedSignal.aborted,true);
 assert.deepEqual(phases,['queuedRender']);
});

test('research stops on access restrictions and missing pages without rendering or model diagnosis',async()=>{
 for(const [code,status] of [['access_blocked'],['http_error',401],['http_error',403],['http_error',404],['private_url']]){
  const data=await checkResearchArticle({url:'https://example.org/story',articleStage:'read'},{
   reader:async()=>{throw Object.assign(new Error(code),{code,status});}
  });
  assert.equal(data.failure.error,code);
  assert.equal(data.failure.manualAllowed,code!=='private_url');
 }
});

test('independent research requests share site and concurrency limits and can cancel while queued',async()=>{
 const active=new Map(),started=[];
 const reader=url=>new Promise(resolve=>{
  started.push(url);
  active.set(url,()=>{active.delete(url);resolve({url,text:'Verified text'});});
 });
 const urls=['https://a.sample.co.uk/1','https://b.sample.co.uk/2','https://first.example.com/3','https://first.example.org/4','https://first.example.net/5'];
 const cancel=new AbortController();
 const requests=urls.map((url,index)=>checkResearchArticle({url,articleStage:'read'},{reader,signal:index===4?cancel.signal:undefined}));
 assert.deepEqual(started,[urls[0],urls[2],urls[3]]);
 cancel.abort();
 await assert.rejects(requests[4],{name:'AbortError'});
 active.get(urls[0])();
 await requests[0];
 assert.equal(started.at(-1),urls[1]);
 for(const finish of [...active.values()])finish();
 await Promise.all(requests.slice(0,4));
 assert.equal(started.length,4);
});
