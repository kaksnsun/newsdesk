import {test} from 'node:test';import assert from 'node:assert/strict';
import {diagnoseResearchModel,performResearch,searchQueries,rankedCandidates,searxURL} from '../research.mjs';
import {canonicalResearchURL,researchOriginalURL,mergeResearchResults} from '../public/research-model.js';
const endpoint=(base,path)=>new URL(path,base+'/');
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('the streaming query planner retries standard fields and settles on a finish event while the stream stays open', {timeout:2000},async()=>{
 const requests=[];
 let cancelled=false;
 const report=await diagnoseResearchModel({
  baseURL:'http://model.local/v1',model:'Qwen/Qwen3.5-9B-Turbo',query:'Private project',apiKey:'test-key'
 },{endpoint,fetcher:async(_url,options)=>{
  const payload=JSON.parse(options.body);
  requests.push(payload);
  if(requests.length===1)return new Response('',{status:422});
  return new Response(new ReadableStream({
   start(controller){
    const choice={delta:{content:'{"queries":["night buses","overnight transit"]}'},finish_reason:'stop'};
    controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[choice]})+'\n\n'));
   },
   cancel(){cancelled=true;}
  }),{headers:{'Content-Type':'text/event-stream'}});
 }});
 assert.equal(report.ok,true);
 assert.equal(report.queryCount,2);
 assert.equal(cancelled,true);
 assert.equal(requests[0].chat_template_kwargs.enable_thinking,false);
 assert.equal(requests[1].chat_template_kwargs,undefined);
 assert.match(requests[1].messages.at(-1).content,/\/no_think$/);
 assert.doesNotMatch(JSON.stringify(requests),/Private project|test-key/);
});

test('the diagnostic distinguishes an authentication failure from reasoning-only output and timeout',async()=>{
 const config={baseURL:'http://model.local/v1',model:'local'};
 const auth=await diagnoseResearchModel(config,{endpoint,fetcher:async()=>new Response('private message',{status:401})});
 assert.deepEqual(auth.issue,{stage:'planning',status:401});
 const thought=await diagnoseResearchModel(config,{endpoint,fetcher:async()=>response({
  choices:[{message:{content:'',reasoning_content:'private thought'},finish_reason:'length'}]
 })});
 assert.deepEqual(thought.issue,{stage:'planning',code:'reasoning_only'});
 const timeout=await diagnoseResearchModel(config,{endpoint,fetcher:async()=>{throw new DOMException('Timeout','TimeoutError');}});
 assert.deepEqual(timeout.issue,{stage:'planning',timedOut:true,timeoutSeconds:180});
 assert.doesNotMatch(JSON.stringify({auth,thought,timeout}),/private/);
});
test('supplement is a deduplicated union and replace touches only candidates',()=>{const previous=[{id:'old',url:'https://example.com/a?utm_source=one',score:90},{id:'keep',url:'https://example.com/keep',score:60}],incoming=[{id:'new',url:'https://example.com/a',score:95},{id:'b',url:'https://example.com/b',score:80}];assert.equal(mergeResearchResults(previous,incoming).length,3);assert.equal(mergeResearchResults(previous,incoming)[0].id,'old');assert.equal(mergeResearchResults(previous,incoming,'replace').length,2);assert.equal(previous.length,2);assert.equal(canonicalResearchURL('javascript:alert(1)'), '');});
test('ranking accepts only real candidate ids and never model-invented URLs',()=>{const candidates=[{id:'1',url:'https://example.com/real',title:'Real',snippet:'Original snippet'}];const rows=rankedCandidates({items:[{id:'fake',url:'https://fake.com',score:100},{id:'1',url:'https://fake.com',score:89,summary:'Summary'},{id:'1',score:90}]},candidates,'batch');assert.equal(rows.length,1);assert.equal(rows[0].url,candidates[0].url);assert.equal(rows[0].batchId,'batch');});
test('research performs only planning, parallel snippet searches, and ranking; never reads webpages',async()=>{const calls=[],phases=[];let models=0;const fetcher=async(url,options)=>{calls.push(String(url));if(String(url).includes('chat/completions')){models++;const body=JSON.parse(options.body);if(models===1){assert.match(body.messages[1].content,/previous/);return response({choices:[{message:{content:'{"queries":["query one","query two"]}'}}]});}return response({choices:[{message:{content:JSON.stringify({items:[{id:'1',score:93,recommended:true,summary:'Relevant material',reason:'Specific evidence'}]})}}]});}assert.match(String(url),/searx\.local/);return response({results:[{url:'https://example.com/report',title:'Report',content:'A useful search snippet.'}]});};const data=await performResearch({query:'Manufacturing AI cases',mode:'more',previous:[{title:'Old',url:'https://example.com/old'}],model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local',language:'en'},{fetcher,endpoint,onProgress:p=>phases.push(p.phase)});assert.equal(models,2);assert.equal(calls.length,4);assert.deepEqual(phases,['planning','searching','ranking']);assert.equal(data.results.length,1);assert.ok(!calls.includes('https://example.com/report'));});
test('partial search failure keeps successes; complete failure differs from no results',async()=>{const fetcher=async url=>new URL(url).searchParams.get('q')==='bad'?new Response('Forbidden',{status:403}):response({results:[]});const data=await searchQueries('http://searx.local',['good','bad'],{fetcher});assert.equal(data.warnings.length,1);assert.deepEqual(data.results,[]);await assert.rejects(searchQueries('http://searx.local',['bad'],{fetcher}),/403/);assert.throws(()=>searxURL('file:///etc/passwd','x'),/HTTP/);});
test('cancelled searches abort instead of committing an empty successful result',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(searchQueries('http://searx.local',['q'],{signal:controller.signal,fetcher:async()=>{throw new DOMException('Stopped','AbortError')}}),{name:'AbortError'});});
test('search limits concurrent queries to two',async()=>{let active=0,peak=0;await searchQueries('http://searx.local',['a','b','c','d'],{fetcher:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return response({results:[]});}});assert.equal(peak,2);});
test('transient HTTP failures back off and recover, respecting Retry-After',async()=>{let calls=0;const delays=[];const data=await searchQueries('http://searx.local',['q'],{random:()=>0,sleep:async ms=>delays.push(ms),fetcher:async()=>++calls===1?new Response('',{status:429,headers:{'Retry-After':'3'}}):calls===2?new Response('',{status:503}):response({results:[{url:'https://example.com/recovered'}]})});assert.deepEqual(delays,[3000,2000]);assert.equal(calls,3);assert.equal(data.results.length,1);assert.deepEqual(data.warnings,[]);});
test('partial engine retries target failing engines and retain successful results',async()=>{const urls=[];const data=await searchQueries('http://searx.local',['a','b'],{categories:'general,news',sleep:async()=>{},random:()=>0,fetcher:async url=>{const u=new URL(url);urls.push(u);return response({results:u.searchParams.has('engines')?[]:[{url:'https://example.com/'+u.searchParams.get('q')}],unresponsive_engines:[['brave','too many requests']]});}});assert.equal(urls.length,6);for(const {searchParams} of urls)assert.equal(searchParams.get('categories'),searchParams.has('engines')?null:'general,news');assert.equal(urls.filter(u=>u.searchParams.get('engines')==='brave').length,4);assert.equal(data.results.length,2);assert.deepEqual(data.warnings,['brave: too many requests']);});
test('recovered engine warnings disappear and retries stop on cancellation',async()=>{let calls=0;const data=await searchQueries('http://searx.local',['q'],{sleep:async()=>{},fetcher:async()=>response({results:[],unresponsive_engines:++calls===1?[['brave','too many requests']]:[]})});assert.deepEqual(data.warnings,[]);const controller=new AbortController();calls=0;await assert.rejects(searchQueries('http://searx.local',['a','b','c'],{concurrency:1,signal:controller.signal,sleep:async()=>{controller.abort();throw controller.signal.reason;},fetcher:async()=>{calls++;return new Response('',{status:429});}}),/abort/i);assert.equal(calls,1);});
test('blank model summaries fall back to available snippets',()=>{const candidates=[{id:'1',url:'https://example.com/a',title:'Report',snippet:'The report describes the actual published findings.'}];const rows=rankedCandidates({items:[{id:'1',score:80,summary:'   '}]},candidates,'round');assert.equal(rows[0].summary,candidates[0].snippet);});

test('Find more excludes known links before ranking and returns unselected candidates',async()=>{
 const old=Array.from({length:36},(_,index)=>({title:'Old '+index,url:'https://example.com/old-'+index}));
 const fetcher=async(url,options)=>{
  if(String(url).includes('chat/completions')){
   const payload=JSON.parse(JSON.parse(options.body).messages[1].content);
   if(!payload.candidates)return response({choices:[{message:{content:'{"queries":["a","b"]}'}}]});
   assert.deepEqual(payload.candidates.map(item=>item.url),['https://example.com/new-a','https://example.com/new-b']);
   return response({choices:[{message:{content:'{"items":[{"id":"1","score":95,"recommended":true,"summary":"Selected"},{"id":"2","score":66,"recommended":false}]}'}}]});
  }
  const query=new URL(url).searchParams.get('q');
  const offset=query==='a'?0:18;
  return response({results:[
   ...old.slice(offset,offset+18).map(item=>({...item,url:item.url+'?utm_source=feed'})),
   {url:'https://example.com/saved'},{url:'https://example.com/new-'+query,content:'Original snippet '+query}
  ]});
 };
 const result=await performResearch({
  query:'Topic',mode:'more',previous:old,excludeUrls:['https://example.com/saved'],
  model:'local',baseURL:'http://model.local',searchURL:'http://searx.local'
 },{fetcher,endpoint});
 assert.deepEqual(result.stats,{returned:40,unique:39,previousExcluded:37,candidates:2});
 assert.equal(result.results[0].url,'https://example.com/new-a');
 assert.equal(result.candidates[0].snippet,'Original snippet b');
 assert.equal(result.candidates[0].score,66);
});

test('search interleaves queries and retains candidates beyond the former cap',async()=>{
 const result=await searchQueries('http://searx.local',['a','b','c','d'],{
  fetcher:async url=>{
   const query=new URL(url).searchParams.get('q');
   return response({results:Array.from({length:20},(_,index)=>({url:'https://example.com/'+query+'/'+index}))});
  }
 });
 assert.deepEqual(result.results.slice(0,4).map(item=>new URL(item.url).pathname),['/a/0','/b/0','/c/0','/d/0']);
 assert.equal(result.results.length,80);
 assert.equal(result.stats.unique,80);
});

test('research scores across batches and can recommend more than eight results', async () => {
 const scoredIds=[];
 const fetcher=async(url,options)=>{
  if(!String(url).includes('chat/completions')){
   const query=new URL(url).searchParams.get('q');
   return response({results:Array.from({length:20},(_,i)=>({url:'https://example.com/'+query+'/'+i}))});
  }
  const {candidates}=JSON.parse(JSON.parse(options.body).messages[1].content);
  if(!candidates)return response({choices:[{message:{content:'{"queries":["a","b","c"]}'}}]});
  const items=candidates.map(({id})=>{
   scoredIds.push(id);
   return {id,score:100-Number(id),recommended:Number(id)<=12};
  });
  return response({choices:[{message:{content:JSON.stringify({items})}}]});
 };
 const result=await performResearch({
  query:'Topic',model:'local',baseURL:'http://model.local',searchURL:'http://searx.local'
 },{fetcher,endpoint});
 assert.equal(new Set(scoredIds).size,60);
 assert.equal(result.results.length,12);
 assert.equal(result.candidates.length,48);
 assert.equal(result.candidates[0].score,87);
});

test('a model 405 during planning still searches the original query and returns unscored candidates',async()=>{
 const searched=[];
 const result=await performResearch({
  query:'美国中期选举',language:'zh',model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local'
 },{endpoint,fetcher:async url=>{
  const target=new URL(url);
  if(target.hostname==='model.local')return new Response('Method Not Allowed',{status:405});
  searched.push([target.searchParams.get('q'),target.searchParams.get('language')]);
  return response({results:[{url:'https://example.com/elections',title:'Election coverage',content:'Election coverage snippet'}]});
 }});
 assert.deepEqual(searched,[['美国中期选举','zh-CN']]);
 assert.deepEqual(result.modelIssues,[{stage:'planning',status:405}]);
 assert.equal(result.sentForRanking,0);
 assert.deepEqual(result.results,[]);
 assert.equal(result.candidates[0].snippet,'Election coverage snippet');
 assert.equal(result.candidates[0].score,undefined);
});

test('a later ranking failure preserves completed scores and the remaining links',async()=>{
 let rankCalls=0;
 const result=await performResearch({
  query:'Topic',model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local'
 },{endpoint,fetcher:async(url,options)=>{
  const target=new URL(url);
  if(target.hostname==='searx.local'){
   const query=target.searchParams.get('q');
   return response({results:Array.from({length:20},(_,index)=>({url:'https://example.com/'+query+'/'+index}))});
  }
  const {candidates}=JSON.parse(JSON.parse(options.body).messages[1].content);
  if(!candidates)return response({choices:[{message:{content:'{"queries":["a","b"]}'}}]});
  if(++rankCalls>1)return new Response('',{status:503});
  const items=candidates.map(({id})=>({id,score:90,recommended:true}));
  return response({choices:[{message:{content:JSON.stringify({items})}}]});
 }});
 assert.deepEqual(result.modelIssues,[{stage:'ranking',status:503}]);
 assert.equal(result.results.length,8);
 assert.equal(result.candidates.length,32);
 assert.ok(result.candidates.every(item=>item.score===undefined));
});

test('a Wikipedia infobox provides a background link when web results are empty',async()=>{
 const url='https://zh.wikipedia.org/wiki/Example';
 const result=await searchQueries('http://searx.local',['topic'],{
  fetcher:async()=>response({results:[],infoboxes:[{id:url,infobox:'Background',content:'A search excerpt'}]})
 });
 assert.equal(result.results[0].url,url);
 assert.equal(result.results[0].snippet,'A search excerpt');
 assert.equal(result.stats.returned,1);
});

test('model connection probe validates a bounded completion without exposing upstream errors',async()=>{
 const {probeModelConnection}=await import('../research.mjs');
 const config={baseURL:'http://local/v1',model:'Qwen/Qwen3.5-9B-Turbo',apiKey:'test-secret'};
 const endpoint=(base,path)=>base+'/'+path;
 let payload;
 const connected=await probeModelConnection(config,{endpoint,fetcher:async(url,options)=>{
  payload=JSON.parse(options.body);
  return response({choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]});
 }});
 assert.deepEqual(connected,{connected:true});
 assert.equal(payload.max_tokens,32);
 assert.equal(payload.enable_thinking,false);
 assert.equal(payload.messages.length,1);
 const rejected=await probeModelConnection(config,{endpoint,fetcher:async()=>new Response('private error',{status:401})});
 assert.deepEqual(rejected,{connected:false});
 const unavailable=await probeModelConnection(config,{endpoint,fetcher:async()=>{throw new TypeError('private network error');}});
 assert.deepEqual(unavailable,{connected:false});
 const incomplete=await probeModelConnection({}, {endpoint,fetcher:()=>{throw Error('must not call');}});
 assert.deepEqual(incomplete,{connected:false});
});


test('Qwen scoring uses small direct-answer batches and retains every search candidate',async()=>{
 const batches=[];
 const result=await performResearch({
  query:'APEC 2026 Shenzhen',language:'en',model:'Qwen/Qwen3.6-35B-A3B-Turbo',baseURL:'http://model.local/v1',searchURL:'http://searx.local'
 },{endpoint,fetcher:async(url,options)=>{
  if(new URL(url).hostname==='searx.local')return response({results:Array.from({length:20},(_,index)=>({url:'https://example.com/apec/'+index,title:'APEC '+index,content:'Published source excerpt.'}))});
  const body=JSON.parse(options.body);
  const request=JSON.parse(body.messages[1].content);
  if(!request.candidates)return response({choices:[{message:{content:'{"queries":["apec shenzhen"]}'}}]});
  assert.equal(body.enable_thinking,false);
  assert.equal(body.chat_template_kwargs.enable_thinking,false);
  assert.ok(request.candidates.length<=8,'large scoring requests can exceed the local model deadline');
  batches.push(request.candidates.length);
  return response({choices:[{message:{content:JSON.stringify({items:request.candidates.map(({id})=>({id,score:85,recommended:true,summary:'Source excerpt.',reason:'Matches the topic.'}))})},finish_reason:'stop'}]});
 }});
 assert.deepEqual(batches,[8,8,4]);
 assert.equal(result.results.length,20);
 assert.equal(new Set(result.results.map(item=>item.url)).size,20);
 assert.deepEqual(result.modelIssues,[]);
});

test('ranking timeout reports the ranking deadline and preserves unscored search results',async()=>{
 const result=await performResearch({query:'Topic',model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local'},{endpoint,fetcher:async(url,options)=>{
  if(new URL(url).hostname==='searx.local')return response({results:[{url:'https://example.com/source',title:'Source'}]});
  const request=JSON.parse(JSON.parse(options.body).messages[1].content);
  if(!request.candidates)return response({choices:[{message:{content:'{"queries":["topic"]}'}}]});
  throw new DOMException('Timed out','TimeoutError');
 }});
 assert.deepEqual(result.modelIssues,[{stage:'ranking',timedOut:true,timeoutSeconds:180}]);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].url,'https://example.com/source');
});

test('empty rewritten searches retry the original wording and score the recovered source',async()=>{
 const query='Original title', searched=[];
 const result=await performResearch({query,model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local'},{
  endpoint,fetcher:async(url,options)=>{
   if(new URL(url).hostname==='searx.local'){
    const term=new URL(url).searchParams.get('q');
    searched.push(term);
    return response(term===query?{results:[{url:'https://example.org/source',title:query}]}:{results:[],unresponsive_engines:[['duckduckgo','CAPTCHA']]});
   }
   const request=JSON.parse(JSON.parse(options.body).messages[1].content);
   const data=request.candidates?{items:[{id:'1',score:92,recommended:true,summary:'Source.',reason:'Exact match.'}]}:{queries:['Reworded title']};
   return response({choices:[{message:{content:JSON.stringify(data)}}]});
  }
 });
 assert.deepEqual(searched,['Reworded title',query]);
 assert.deepEqual(result.queries,searched);
 assert.equal(result.results[0].score,92);
 assert.deepEqual(result.warnings,['duckduckgo: CAPTCHA']);
});

const engineGroups={
 default:['bing','reuters'],topic:['pubmed','crossref','europepmc','openalex'],
 standby:['duckduckgo','google','mojeek','brave.news','yahoo news']
};
async function routedRun({options={},plan,search}){
 const events=[],requests=[],ranked=[];
 const input={query:'clinical trial',mode:'replace',searchURL:'http://search.local',engineGroups,...options};
 if(plan)Object.assign(input,{model:'local',baseURL:'http://model.local/v1'});
 const fetcher=async(url,init)=>{
  if(String(url).includes('/chat/completions')){
   const body=JSON.parse(init.body),prompt=JSON.parse(body.messages[1].content);
   if(prompt.candidates){
    ranked.push(...prompt.candidates);
    return response({choices:[{message:{content:JSON.stringify({items:prompt.candidates.map(c=>({id:c.id,score:90}))})}}]});
   }
   assert.deepEqual(prompt.availableTopicEngines,engineGroups.topic);
   return plan instanceof Response?plan:response({choices:[{message:{content:JSON.stringify(plan)}}]});
  }
  const params=new URL(url).searchParams;
  const engines=params.get('engines').split(',');
  requests.push({engines,query:params.get('q')});
  const data=search(engines,requests.length);
  return data instanceof Response?data:response(data);
 };
 const data=await performResearch(input,{endpoint,fetcher,onProgress:event=>events.push(event)});
 return {data,events,requests,ranked};
}
test('Research validates planner engines and skips standby with two independent sites despite an engine error',async()=>{
 const run=await routedRun({plan:{queries:['trial'],topicEngines:['not-loaded','pubmed','pubmed','crossref','europepmc','openalex']},
  search:()=>({results:[{url:'https://nih.gov/a'},{url:'https://nature.com/b'}],unresponsive_engines:[['bing','timeout']]})});
 assert.deepEqual(run.requests,[{query:'trial',engines:['bing','reuters','pubmed','crossref','europepmc']}]);
 assert.deepEqual(run.data.routes,run.events.filter(e=>e.route).map(e=>e.route));
 assert.equal(run.ranked.length,2);
});
test('One publisher across subdomains triggers a single original-wording backup, with unique ranking IDs',async()=>{
 const run=await routedRun({plan:{queries:['rewritten trial']},search:(_,i)=>({results:i===1
  ?[{url:'https://www.example.co.uk/a'},{url:'https://news.example.co.uk/b'}]
  :[{url:'https://www.example.co.uk/a?utm_source=copy'},{url:'https://who.int/c'}]})});
 assert.deepEqual(run.requests.map(r=>r.query),['rewritten trial','clinical trial']);
 assert.deepEqual(run.requests[1].engines,['duckduckgo','google']);
 assert.deepEqual(run.data.routes.map(r=>r.kind),['primary','backup']);
 assert.deepEqual(run.data.stats,{returned:4,unique:3,previousExcluded:0,candidates:3});
 assert.deepEqual(run.ranked.map(r=>r.id),['1','2','3']);
});
test('Find more uses untried engines first and excludes previous links before checking coverage',async()=>{
 const run=await routedRun({options:{mode:'more',previousEngines:['bing','reuters','pubmed','duckduckgo'],excludeUrls:['https://nature.com/a']},
  plan:{queries:['trial'],topicEngines:['pubmed','crossref']},search:(_,i)=>({results:i===1
   ?[{url:'https://nature.com/a'},{url:'https://who.int/b'}]:[{url:'https://nature.com/a'},{url:'https://nih.gov/c'}]})});
 assert.deepEqual(run.data.routes.map(r=>r.kind),['expand','backup']);
 assert.deepEqual(run.requests[0].engines,['crossref','google','mojeek']);
 assert.deepEqual(run.requests[1].engines,['brave.news','yahoo news']);
 assert.deepEqual(run.data.stats,{returned:4,unique:3,previousExcluded:1,candidates:2});
});
test('Failed planning and an empty search still run standby; a backup error preserves first-pass candidates',async()=>{
 for(const empty of [true,false]){
  const run=await routedRun({plan:new Response('',{status:401}),search:(_,i)=>i===1
   ?{results:empty?[]:[{url:'https://who.int/a'}]}:empty?{results:[{url:'https://nih.gov/b'}]}:new Response('',{status:503})});
  assert.deepEqual(run.requests.map(r=>r.query),Array(empty?2:4).fill('clinical trial'));
  assert.equal(run.data.modelIssues[0].stage,'planning');
  assert.equal(run.data.candidates.length,1);
  assert.deepEqual(run.data.warnings,empty?[]:['Search HTTP 503']);
 }
});

test('Research uses the current query language across planning, primary and backup searches and ranking',async()=>{
 for(const [language,locale,name,query] of [
  ['en','en-US','English','How are climate policies changing?'],
  ['es','es','Spanish','¿Cómo cambia la política climática?'],
  ['fr','fr','French','Comment évolue la politique climatique ?'],
  ['zh','zh-CN','Chinese','APEC 对深圳有什么影响？'],
  ['ja','ja','Japanese','日本の気候政策はどう変わった？'],
  ['ko','ko','Korean','한국의 기후 정책은 어떻게 바뀌었나요?']
 ]){
  const searched=[],prompts=[];
  const data=await performResearch({query,mode:'more',originalQuery:'Prior subject',previousEngines:['backup'],language:language==='en'?'zh':'en',model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local',engineGroups:{default:['general'],topic:[],standby:['backup']}},
   {endpoint,fetcher:async(url,options)=>{
    const target=new URL(url);
    if(target.hostname==='model.local'){
     prompts.push(JSON.parse(options.body).messages[0].content);
     const answer=prompts.length===1?{language,queries:[query]}:{items:[{id:'1',score:80,recommended:true},{id:'2',score:80,recommended:true}]};
     return response({choices:[{message:{content:JSON.stringify(answer)}}]});
    }
    searched.push(target.searchParams.get('language'));
    const primary=searched.length===1;
    return response({results:[{url:primary?'https://first.org':'https://other.org',title:'Report',language:primary?'de':language}]});
   }});
  assert.deepEqual(searched,[locale,locale]);
  assert.match(prompts[0],/language of the current request/);
  assert.ok(prompts[1].includes('original articles in '+name));
  assert.deepEqual(data.results.map(item=>item.sourceLanguage),[language,'de']);
 }
});

test('Research without a planner detects input locally and leaves neutral terms unrestricted',async()=>{
 for(const [query,expected] of [['Anthropic 上市','zh-CN'],['일본의 경제 정책','ko'],['APEC の経済効果','ja'],['Comment évolue la politique climatique en Europe ?','fr'],['Cómo afecta la inteligencia artificial al mercado laboral','es'],['What is the effect of climate change on coastal areas?','en-US'],['2027','all'],['APEC','all']]){
  let actual;
  await performResearch({query,language:'fr',searchURL:'http://search.local'},{fetcher:async url=>{
   actual=new URL(url).searchParams.get('language');
   return response({results:[]});
  }});
  assert.equal(actual,expected,query);
 }
});

test('ranking requires a literal true recommendation regardless of score',()=>{
 for(const flag of [true,false,'false','true',1,null,undefined]){
  const input={id:'1',score:10};
  if(flag!==undefined)input.recommended=flag;
  const rows=rankedCandidates({items:[input]},[{id:'1',url:'https://example.org/a'}],'batch');
  assert.equal(rows[0].recommended,flag===true);
  assert.equal(rows[0].score,10);
 }
});

test('incomplete result links recover explicit destinations before deduplication and exclusions',async()=>{
 const url='https://example.org/story',wrapped='https://go/?url='+encodeURIComponent(url);
 const rows=[{url:wrapped},{url:'https://go/opaque',original_url:url},{url},
  {url:'https://go/opaque2'},{url:'https://publisher.org/report?url=https://other.org/'}];
 const run=excludeUrls=>searchQueries('http://search.local',['story'],{excludeUrls,fetcher:async()=>response({results:rows})});
 const result=await run([]);
 assert.equal(result.results.length,3);
 assert.equal(result.results[0].url,url);
 assert.equal(result.results.at(-1).url.startsWith('https://publisher.org/report'),true);
 assert.equal((await run([wrapped])).results.length,2);
 assert.equal(researchOriginalURL('https://go/'+encodeURIComponent(url)),url);
 assert.equal(canonicalResearchURL('https://duckduckgo.com/l/?uddg='+encodeURIComponent(wrapped)),url);
 for(const invalid of ['https://go/opaque2','https://go/?url=javascript:alert(1)','https://go/?url=https://u:p@example.org/']){
  assert.equal(researchOriginalURL(invalid),'');
 }
});

test('each empty or duplicate backup batch advances once until a new usable original is found',async()=>{
 const run=await routedRun({search:(_,n)=>{
  if(n===1)return {results:[{url:'https://go/a'},{url:'https://jump/b'},{url:'https://example.org/old'}]};
  if(n===2)return {results:[],unresponsive_engines:[['google','CAPTCHA']]};
  if(n===3)return {results:[{url:'https://example.org/old'}]};
  return {results:[{url:'https://go/?target=https://publisher.org/new'}]};
 }});
 assert.deepEqual(run.requests.map(r=>r.engines),[engineGroups.default,['duckduckgo','google'],['mojeek','brave.news'],['yahoo news']]);
 assert.deepEqual(run.data.routes.map(r=>r.reason),[undefined,'limitedCoverage','emptyBackup','emptyBackup']);
 assert.ok(run.data.candidates.some(x=>x.url==='https://publisher.org/new'));
 assert.deepEqual(run.data.warnings,['google: CAPTCHA']);
});

test('a 504 retries the same candidates once, skips only missing scores and continues',async()=>{
 const idsSeen=[],delays=[];
 const data=await performResearch({query:'Transport',model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local'},{
  endpoint,sleep:async ms=>delays.push(ms),fetcher:async(url,options)=>{
   if(new URL(url).hostname==='searx.local')return response({results:Array.from({length:19},(_,i)=>({url:'https://example.org/'+i}))});
   const {candidates}=JSON.parse(JSON.parse(options.body).messages[1].content);
   const completion=value=>response({choices:[{message:{content:JSON.stringify(value)}}]});
   if(!candidates)return completion({queries:['transport']});
   idsSeen.push(candidates.map(candidate=>candidate.id));
   // First batch recovers on retry. Second yields one valid score before its missing subset times out twice.
   if([1,4,5].includes(idsSeen.length))return new Response('',{status:504});
   const items=idsSeen.length===3?candidates.slice(0,1):candidates;
   return completion({items:items.map(({id})=>({id,score:91,recommended:true}))});
  }
 });
 assert.deepEqual(delays,[2000,2000]);
 assert.deepEqual(idsSeen.map(ids=>ids.length),[8,8,8,7,7,3]);
 assert.deepEqual(idsSeen[0],idsSeen[1]);assert.deepEqual(idsSeen[3],idsSeen[4]);
 assert.deepEqual(data.scoring,{scored:12,total:19,timedOut:7});
 assert.equal(data.sentForRanking,19);assert.equal(data.results.length,12);
 assert.deepEqual(data.candidates,[]);assert.deepEqual(data.modelIssues,[]);
});

test('a full scoring timeout removes its candidates and records a failed ranking',async()=>{
 let calls=0;
 const data=await performResearch({query:'Transport',model:'local',baseURL:'http://model.local/v1',searchURL:'http://searx.local'},{
  endpoint,sleep:async()=>{},fetcher:async(url,options)=>{
   if(new URL(url).hostname==='searx.local')return response({results:Array.from({length:10},(_,i)=>({url:'https://example.org/'+i}))});
   if(!JSON.parse(JSON.parse(options.body).messages[1].content).candidates)return response({choices:[{message:{content:'{"queries":["transport"]}'}}]});
   calls++;return new Response('',{status:504});
  }
 });
 assert.equal(calls,4);assert.deepEqual(data.scoring,{scored:0,total:10,timedOut:10});
 assert.deepEqual(data.results,[]);assert.deepEqual(data.candidates,[]);
 assert.deepEqual(data.modelIssues,[{stage:'ranking',status:504}]);
});
