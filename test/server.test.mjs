import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {server,endpoint} from '../server.mjs';
test('base URL preserves compatible API prefixes',()=>{assert.equal(endpoint('http://localhost:11434/v1/','models').href,'http://localhost:11434/v1/models');assert.throws(()=>endpoint('file:///tmp/test','models'));});
test('a pasted completion endpoint resolves to the same completion path and the sibling model list',()=>{
 const base='http://localhost:11434/proxy/v1/chat/completions/';
 assert.equal(endpoint(base,'chat/completions').pathname,'/proxy/v1/chat/completions');
 assert.equal(endpoint(base,'models').pathname,'/proxy/v1/models');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(()=>server.close());
test('serves application and rejects unknown paths',async()=>{assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/missing')).status,404)});
test('proxy forwards model, messages and optional API key',async()=>{const mock=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers.authorization,'Bearer test-key');assert.equal(JSON.parse(body).model,'test-model');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'edited'}}]}))});await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));try{const response=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({baseURL:`http://127.0.0.1:${mock.address().port}/v1`,apiKey:'test-key',model:'test-model',messages:[{role:'user',content:'hello'}]})});assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,'edited')}finally{mock.close()}});
test('rejects cross-origin API requests',async()=>{assert.equal((await fetch(base+'/api/models',{method:'POST',headers:{Origin:'https://example.com'},body:'{}'})).status,403)});
test('streams reasoning status and text, then completes without reasoning disclosure',async()=>{const mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;assert.equal(JSON.parse(raw).stream,true);res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: {"choices":[{"delta":{"reasoning_content":"private thought"}}]}\n\n');res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');res.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')});await new Promise(r=>mock.listen(0,'127.0.0.1',r));try{const res=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({baseURL:`http://127.0.0.1:${mock.address().port}/v1`,model:'test',messages:[],stream:true})});const raw=await res.text();const events=raw.trim().split('\n').map(JSON.parse);assert.ok(events.some(e=>e.phase==='thinking'));assert.equal(events.at(-1).data.choices[0].message.content,'Hello');assert.ok(!raw.includes('private thought'))}finally{mock.close()}});
test('incomplete model streams return an error instead of accepting partial text',async()=>{const mock=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n')});await new Promise(r=>mock.listen(0,'127.0.0.1',r));try{const res=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({baseURL:`http://127.0.0.1:${mock.address().port}/v1`,stream:true})});assert.equal(JSON.parse((await res.text()).trim().split('\n').at(-1)).phase,'error')}finally{mock.close()}});
test('generation uses server token defaults rather than a fixed 4096-token ceiling',async()=>{const mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);assert.equal(body.max_tokens,undefined);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'Complete review'},finish_reason:'stop'}]}))});await new Promise(r=>mock.listen(0,'127.0.0.1',r));try{const response=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({baseURL:`http://127.0.0.1:${mock.address().port}/v1`,stream:true})});assert.equal(JSON.parse((await response.text()).trim().split('\n').at(-1)).phase,'done')}finally{mock.close()}});
test('non-streaming provider truncation cannot be accepted as a complete review',async()=>{const mock=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'{"issues":['},finish_reason:'length'}]}))});await new Promise(r=>mock.listen(0,'127.0.0.1',r));try{const response=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({baseURL:`http://127.0.0.1:${mock.address().port}/v1`,stream:true})});assert.equal(JSON.parse((await response.text()).trim().split('\n').at(-1)).phase,'error')}finally{mock.close()}});
test('serves the approved Alpine stylesheet and wallpaper without stale caching',async()=>{const css=await fetch(base+'/alpine.css?v=test');assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);assert.equal(css.headers.get('cache-control'),'no-store');const image=await fetch(base+'/assets/alpine-wallpaper.jpg');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');assert.ok((await image.arrayBuffer()).byteLength>1000);});

test('connection status probes the selected model and returns only connection state',async()=>{
 let mode='connected';
 const mock=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  assert.equal(req.url,'/v1/chat/completions');
  assert.equal(req.headers.authorization,'Bearer fixture-key');
  const input=JSON.parse(raw);
  assert.equal(input.model,'fixture-model');
  assert.equal(input.max_tokens,32);
  if(mode==='denied'){res.writeHead(401);res.end('private upstream diagnostic');return;}
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]}));
 });
 await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
 try{
  const input={baseURL:`http://127.0.0.1:${mock.address().port}/v1`,model:'fixture-model',apiKey:'fixture-key'};
  const probe=()=>fetch(base+'/api/model-status',{method:'POST',body:JSON.stringify(input)}).then(response=>response.json());
  assert.deepEqual(await probe(),{connected:true});
  mode='denied';assert.deepEqual(await probe(),{connected:false});
 }finally{mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));}
});

test('generation finishes on the provider finish event without waiting for socket EOF',{timeout:2500},async()=>{
 const mock=http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.write('data: '+JSON.stringify({choices:[{delta:{content:'Complete article'},finish_reason:'stop'}]})+'\n\n');
 });
 await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({baseURL:`http://127.0.0.1:${mock.address().port}/v1`,model:'test',messages:[],stream:true})});
  const events=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).phase,'done');
  assert.equal(events.at(-1).data.choices[0].message.content,'Complete article');
 }finally{mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));}
});

test('webpage streaming keeps the JSON result contract and reports an actual reading phase',async()=>{
 const response=await fetch(base+'/api/website',{method:'POST',body:JSON.stringify({url:'file:///not-a-public-page',language:'en',stream:true})});
 assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
 const events=(await response.text()).trim().split('\n').map(JSON.parse);
 assert.equal(events[0].phase,'reading');
 assert.equal(events.at(-1).phase,'done');
 assert.equal(events.at(-1).data.failure.error,'invalid_url');
 assert.equal(events.at(-1).data.failure.manualAllowed,false);
 assert.equal(events.some(event=>event.phase==='model'),false);
});
