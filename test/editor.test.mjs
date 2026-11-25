import {getDomain} from 'tldts';
import {words,resolveInterfaceLanguage,languageNames} from '../public/locales/index.js';
import {canonicalResearchURL,researchOriginalURL,mergeResearchResults} from '../public/research-model.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { markdownToText } from '../public/markdown.js';
import {defaultWritingTitle,writingPresets,articleFields,makeWriting,migrateProject,selectedSources,sourcesForPrompt,locateAnnotation,splitGeneratedArticle,articleChanges,locateArticleChange,verifiedSourceCorrections} from '../public/writing-model.js';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
function setup(output,storage=new Map()){
 if(!storage.has('newsroom-local'))storage.set('newsroom-local',JSON.stringify({lang:'zh',model:'mock',article:'Original sentence.'}));
 const elements=new Map();
 function element(){return {value:'',hidden:false,dataset:{},textContent:'',children:[],classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes},focus(){},click(){this.onclick?.()},showModal(){this.open=true},close(){this.open=false},setSelectionRange(){}}}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const context=vm.createContext({library:{state:JSON.parse(storage.get('newsroom-local')),phase:'saved',meta:{},queue(snapshot){storage.set('newsroom-local',JSON.stringify(snapshot()))}},document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>element(),createElement:element,createTextNode:text=>({textContent:text}),addEventListener(){},documentElement:{dataset:{},style:{setProperty(key,value){this[key]=value}}},body:{classList:{add(){},remove(){},toggle(){}}}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},crypto:{randomUUID},window:{scrollTo(){},addEventListener(){}},setTimeout:()=>0,clearTimeout(){},fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:output}}]})}),setInterval:()=>0,clearInterval(){},getDomain,AbortController,DOMException,URL,TextDecoder,words,resolveInterfaceLanguage,languageNames,defaultWritingTitle,writingPresets,markdownToText,articleFields,makeWriting,migrateProject,selectedSources,sourcesForPrompt,locateAnnotation,splitGeneratedArticle,articleChanges,locateArticleChange,verifiedSourceCorrections,canonicalResearchURL,researchOriginalURL,mergeResearchResults,console});
 vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
 vm.runInContext('if(currentProject())openProject(activeProjectId)',context);
 return {get,run:code=>vm.runInContext(code,context),setFetch:fn=>context.fetch=fn};
}
 test('suggestions cannot replace a draft edited while awaiting review',async()=>{const app=setup('New sentence.');await app.run("run('rewrite')");app.get('article').value='My newer draft.';app.get('accept').onclick();assert.equal(app.get('article').value,'My newer draft.');assert.match(app.get('status').textContent,/稿件已变化/)});
 test('review opens on demand and issue replacement supports undo',async()=>{const app=setup(JSON.stringify({issues:[{quote:'Original sentence.',reason:'Too vague',replacement:'Clear sentence.'}]}));assert.equal(app.get('reviewButton')['aria-expanded'],undefined);await app.run("run('check')");assert.equal(app.get('reviewDrawer').hidden,false);const card=app.get('issues').children[0];const actions=card.children.at(-1);assert.equal(actions.children[1].disabled,false);actions.children[1].onclick();assert.equal(app.get('article').value,'Clear sentence.');app.get('undo').onclick();assert.equal(app.get('article').value,'Original sentence.');app.get('closeReview').onclick();assert.equal(app.get('reviewDrawer').hidden,true)});
 test('ambiguous quotations cannot trigger automatic issue replacement',async()=>{const app=setup(JSON.stringify({issues:[{quote:'Original',reason:'Unclear',replacement:'Clear'}]}));app.get('article').value='Original Original';await app.run("run('check')");const actions=app.get('issues').children[0].children.at(-1);actions.children[1].onclick();assert.equal(app.get('article').value,'Original Original');assert.match(app.get('status').textContent,/唯一/)});
 test('legacy drafts migrate into a project and stay isolated from new projects',()=>{const app=setup('');assert.equal(app.run('projects.length'),1);const oldId=app.run('activeProjectId');app.run("createProject('Second story')");app.get('article').value='Second draft';app.run('save()');app.run(`openProject(${JSON.stringify(oldId)})`);assert.equal(app.get('article').value,'Original sentence.');app.run("openProject(projects[1].id)");assert.equal(app.get('article').value,'Second draft')});
 test('source collections and output snapshots belong to their project',()=>{const app=setup('');app.run("addProjectSource('Interview','Source notes')");assert.equal(app.run('currentProject().sources[0].text'),'Source notes');app.run("recordOutput('Snapshot','txt')");app.get('article').value='Updated draft';app.run('save()');assert.equal(app.run('currentProject().outputs[0].text'),'Original sentence.');assert.equal(app.run('currentProject().outputs[0].content'),'Snapshot')});
 test('all-sources view filters source files instead of exported drafts',()=>{const app=setup('');app.run("addProjectSource('notes.md','notes','source',{fileType:'md',createdAt:new Date('2026-11-03T12:00:00').getTime()})");app.run("recordOutput('Not a source','txt')");assert.equal(app.run('filteredAssets().length'),1);app.run("assetType='json'");assert.equal(app.run('filteredAssets().length'),0);app.run("assetType='md'");app.get('assetFrom').value='2026-11-04';assert.equal(app.run('filteredAssets().length'),0);app.get('assetFrom').value='2026-11-03';app.get('assetTo').value='2026-11-03';assert.equal(app.run('filteredAssets().length'),1)});
 test('website sources retain URL metadata and are available to writing with provenance',()=>{const app=setup('');app.run("websiteProjectId=activeProjectId;websiteDraft={requestedURL:'https://example.com/article',url:'https://example.com/article',siteName:'Example'}");app.get('websiteURL').value='https://example.com/article';app.get('websiteTitle').value='Source article';app.get('websiteText').value='Extracted article text';app.get('saveWebsite').onclick();assert.equal(app.run('currentProject().sources[0].url'),'https://example.com/article');assert.equal(app.run('sourceType(currentProject().sources[0])'),'website');assert.match(app.get('materials').value,/https:\/\/example.com\/article/);app.run("assetType='website'");assert.equal(app.run('filteredAssets().length'),1)});

test('undo redo and regeneration preserve project and request text',async()=>{const app=setup('Edited sentence.');await app.run("run('rewrite')");app.get('accept').onclick();app.get('undo').onclick();assert.equal(app.get('article').value,'Original sentence.');app.get('redo').onclick();assert.equal(app.get('article').value,'Edited sentence.');app.get('undo').onclick();await app.run("run('rewrite')");app.get('accept').onclick();assert.equal(app.get('article').value,'Edited sentence.');assert.equal(app.get('redo').disabled,true)});
test('article output language persists per project independently of interface',()=>{const app=setup('');app.get('outputLanguage').value='en';app.run('save()');assert.equal(app.run('lang'),'zh');const id=app.run('activeProjectId');app.run("createProject('Other')");app.run(`openProject(${JSON.stringify(id)})`);assert.equal(app.get('outputLanguage').value,'en')});

test('API key survives app initialization, stays out of drafts and follows endpoint',()=>{const storage=new Map();const app=setup('',storage);app.get('apiKey').value='test-secret-not-real';app.run('persistAPIKey();save()');assert.ok(!storage.get('newsroom-local').includes('test-secret-not-real'));const restored=setup('',storage);assert.equal(restored.get('apiKey').value,'test-secret-not-real');restored.get('baseURL').value='http://other-model/v1';restored.run('restoreAPIKey()');assert.equal(restored.get('apiKey').value,'');restored.get('baseURL').value='http://127.0.0.1:1234/v1/';restored.run('restoreAPIKey()');assert.equal(restored.get('apiKey').value,'test-secret-not-real');restored.get('apiKey').value='';restored.run('persistAPIKey();save()');assert.equal(setup('',storage).get('apiKey').value,'')});
test('Markdown toggle converts editor and pending suggestion together and remains undoable',async()=>{const app=setup('## 新标题\n\n**新正文**');app.get('markdownToggle').onclick();app.get('article').value='# 标题\n\n**正文**';await app.run("run('rewrite')");assert.match(app.get('result').value,/\*\*/);app.get('markdownToggle').onclick();assert.equal(app.get('article').value,'标题\n\n正文');assert.equal(app.get('result').value,'新标题\n\n新正文');app.get('accept').onclick();assert.equal(app.get('article').value,'新标题\n\n新正文');app.get('undo').onclick();assert.equal(app.get('article').value,'标题\n\n正文');app.get('undo').onclick();assert.match(app.get('article').value,/\*\*/)});
test('plain-text mode normalizes Markdown returned by the model',async()=>{const app=setup('## Heading\n\n**Body**');await app.run("run('rewrite')");assert.equal(app.get('result').value,'Heading\n\nBody')});

test('article tabs isolate drafts and briefs while sharing numbered sources',()=>{const app=setup('');app.run("addProjectSource('A','A text')");const first=app.run('currentWriting().id');app.get('brief').value='First angle';app.run('save()');app.run('createWriting()');assert.equal(app.get('article').value,'');assert.equal(app.get('brief').value,'');assert.equal(app.run('currentWriting().selectedSourceIds.length'),1);app.get('article').value='Second text';app.run(`switchWriting(${JSON.stringify(first)})`);assert.equal(app.get('article').value,'Original sentence.');assert.equal(app.get('brief').value,'First angle');app.run('switchWriting(currentProject().writings[1].id)');assert.equal(app.get('article').value,'Second text')});
test('background completion goes to its owning tab while another project is open',async()=>{const app=setup('');let resolve;app.setFetch(async url=>url.includes('generate')?await new Promise(r=>resolve=r):{ok:false,json:async()=>({})});const firstProject=app.run('activeProjectId');const firstWriting=app.run('currentWriting().id');const job=app.run("run('polish')");app.run("createProject('Other')");app.get('article').value='Other article';app.run('save()');resolve({ok:true,json:async()=>({choices:[{message:{content:'Edited original'}}]})});await job;assert.equal(app.get('article').value,'Other article');assert.equal(app.run(`projects.find(p=>p.id===${JSON.stringify(firstProject)}).writings[0].pending.output`),'Edited original');app.run(`openProject(${JSON.stringify(firstProject)});switchWriting(${JSON.stringify(firstWriting)})`);app.get('accept').onclick();assert.equal(app.get('article').value,'Edited original')});
test('selected source IDs limit the model payload and imported articles stay separate',async()=>{const app=setup('Result');app.run("addProjectSource('A','Keep this');addProjectSource('B','Exclude this');addProjectSource('Mine.md','# My draft','article',{fileType:'md'});currentWriting().selectedSourceIds=[currentProject().sources[0].id];refreshSelectedMaterials()");let payload;app.setFetch(async(url,options)=>{if(url.includes('generate'))payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Result'}}]})}});await app.run("run('polish')");const input=JSON.parse(payload.messages[1].content);assert.match(input.sources,/Source #1: A/);assert.match(input.sources,/Keep this/);assert.ok(!input.sources.includes('Exclude this'));assert.equal(app.run('currentProject().sources.length'),2);assert.equal(app.run('currentProject().importedArticles.length'),1);assert.equal(app.run('filteredAssets().length'),2)});
test('comment queue keeps independent suggestions and safely applies after another edit',async()=>{const app=setup('');app.get('article').value='First. Second.';app.run("save();currentWriting().annotations=[{id:'one',quote:'First.',start:0,end:6,snapshot:'First. Second.',instruction:'Improve first',status:'queued'},{id:'two',quote:'Second.',start:7,end:14,snapshot:'First. Second.',instruction:'Improve second',status:'queued'}]");app.setFetch(async(url,options)=>{const body=JSON.parse(options.body),target=JSON.parse(body.messages[1].content).targetText;return {ok:true,json:async()=>({choices:[{message:{content:target==='First.'?'First revised.':'Second revised.'}}]})}});await app.run('processAnnotations()');assert.equal(app.run('currentWriting().annotations[0].status'),'ready');assert.equal(app.run('currentWriting().annotations[1].status'),'ready');app.run("applyAnnotation('one');applyAnnotation('two')");assert.equal(app.get('article').value,'First revised. Second revised.');app.get('undo').onclick();assert.equal(app.get('article').value,'First revised. Second.')});
test('empty exploration shows generated text directly without overwriting another tab',async()=>{const app=setup('# Generated');app.run("createWriting();addProjectSource('Notes','Facts')");await app.run("run('draft')");assert.equal(app.get('article').value,'Generated');assert.equal(app.get('documentArea').hidden,false);assert.equal(app.run('currentWriting().pending'),null);});
test('Markdown off converts legacy article on load and on restores source formatting',()=>{const storage=new Map([['newsroom-local',JSON.stringify({model:'mock',article:'# Title\n\n**Body**',markdownMode:'off'})]]);const app=setup('',storage);assert.equal(app.get('article').value,'Title\n\nBody');app.get('markdownToggle').onclick();assert.equal(app.get('article').value,'# Title\n\n**Body**');app.get('markdownToggle').onclick();assert.equal(app.get('article').value,'Title\n\nBody')});
test('Markdown round-trip preserves the scope of a pending passage suggestion',async()=>{const app=setup('**Changed**');app.get('markdownToggle').onclick();app.get('article').value='Intro. **Target**. End.';app.get('article').selectionStart=7;app.get('article').selectionEnd=17;app.run('rememberSelection()');await app.run("run('rewrite')");app.get('markdownToggle').onclick();app.get('markdownToggle').onclick();app.get('accept').onclick();assert.equal(app.get('article').value,'Intro. **Changed**. End.')});
test('two article jobs may finish out of order without sharing output or controllers',async()=>{const app=setup('');const responses=[];app.setFetch(async()=>await new Promise(resolve=>responses.push(resolve)));const firstId=app.run('currentWriting().id');const first=app.run("run('polish')");app.run('createWriting()');app.get('brief').value='Write a second article';app.run('save()');const secondId=app.run('currentWriting().id');const second=app.run("run('draft')");responses[1]({ok:true,json:async()=>({choices:[{message:{content:'Second output'}}]})});await second;assert.equal(app.get('article').value,'Second output');responses[0]({ok:true,json:async()=>({choices:[{message:{content:'First output'}}]})});await first;assert.equal(app.get('article').value,'Second output');app.run(`switchWriting(${JSON.stringify(firstId)})`);assert.equal(app.get('result').value,'First output');assert.equal(app.run(`currentProject().writings.find(w=>w.id===${JSON.stringify(secondId)}).article`),'Second output')});
test('finishing a review while browsing styles does not open its drawer over the page',async()=>{const app=setup('');let resolve;app.setFetch(async()=>await new Promise(r=>resolve=r));const task=app.run("run('polish')");app.run("navigate('styles')");resolve({ok:true,json:async()=>({choices:[{message:{content:'Better draft'}}]})});await task;assert.equal(app.get('reviewDrawer').hidden,true);assert.equal(app.run('currentWriting().pending.output'),'Better draft');});
test('uploaded articles are available as a starting mode without joining source selection',async()=>{const app=setup('');app.get('articleFile').files=[{name:'Own.md',size:15,text:async()=> '# Uploaded\n\nBody'}];await app.get('articleFile').onchange();assert.equal(app.run('currentProject().sources.length'),0);assert.equal(app.run('currentProject().importedArticles.length'),1);assert.equal(app.run('currentProject().writings[0].article'),'Original sentence.');assert.equal(app.run('currentProject().writings.length'),2);app.run('createWriting();startFromImported(currentProject().importedArticles[0].id)');assert.equal(app.get('article').value,'# Uploaded\n\nBody');assert.equal(app.get('markdownMode').value,'on');assert.equal(app.get('documentArea').hidden,false);assert.equal(app.get('startImported').hidden,false)});

test('deleted tabs can be restored with their full draft and deletion of the final tab creates a blank',()=>{const app=setup('');const id=app.run('currentWriting().id');app.run(`deleteWriting(${JSON.stringify(id)})`);assert.equal(app.get('article').value,'');assert.equal(app.run('currentProject().writings.filter(w=>!w.deletedAt).length'),1);app.run(`restoreWriting(${JSON.stringify(id)})`);assert.notEqual(app.run('currentWriting().id'),id);app.run(`switchWriting(${JSON.stringify(id)})`);assert.equal(app.get('article').value,'Original sentence.');assert.equal(app.run('currentWriting().deletedAt'),undefined)});
test('the create-style option navigates to the library without persisting the sentinel',()=>{const app=setup('');app.get('style').value='objective';app.run('save()');app.get('style').value='__new__';app.run('save()');app.get('style').onchange();assert.equal(app.run('currentView'),'styles');assert.equal(app.get('styleDialog').open,true);assert.equal(app.run('currentWriting().style'),'objective')});
test('full generation assigns title and body separately and undo restores both',async()=>{const app=setup(JSON.stringify({title:'Generated headline',body:'Generated body'}));app.run('createWriting()');app.get('brief').value='Write a report';await app.run("run('draft')");assert.equal(app.get('title').value,'Generated headline');assert.equal(app.get('article').value,'Generated body');app.get('undo').onclick();assert.equal(app.get('title').value,'');assert.equal(app.get('article').value,'')});
test('accepting a regenerated article applies the proposed headline with its body',async()=>{const app=setup(JSON.stringify({title:'New headline',body:'New body'}));app.get('title').value='Old headline';app.run('save()');await app.run("run('draft')");assert.equal(app.get('title').value,'Old headline');assert.equal(app.get('proposedTitle').textContent,'New headline');app.get('accept').onclick();assert.equal(app.get('title').value,'New headline');assert.equal(app.get('article').value,'New body');app.get('undo').onclick();assert.equal(app.get('title').value,'Old headline')});
test('deleting a running tab aborts its request and preserves the recoverable article',async()=>{const app=setup('');app.setFetch(async(url,options)=>await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Stopped'),{name:'AbortError'})))));const id=app.run('currentWriting().id');const task=app.run("run('polish')");app.run(`deleteWriting(${JSON.stringify(id)})`);await task;assert.equal(app.run(`writingJobs.get(${JSON.stringify(id)}).phase`),'stoppedModel');assert.equal(app.run(`currentProject().writings.find(w=>w.id===${JSON.stringify(id)}).article`),'Original sentence.');app.run(`restoreWriting(${JSON.stringify(id)});switchWriting(${JSON.stringify(id)})`);assert.equal(app.get('article').value,'Original sentence.')});
test('unified composer preserves separate full-article and passage instructions across task switches',()=>{const app=setup('');app.get('brief').value='Whole story brief';app.get('writingAction').value='outline';app.run("save();currentWriting().annotations=[{id:'one',quote:'First.',instruction:'First instructions',status:'queued'},{id:'two',quote:'Second.',instruction:'Second instructions',status:'queued'}];selectEditTask('one')");assert.equal(app.get('brief').value,'First instructions');app.get('brief').value='Updated first';app.run("selectEditTask('two')");assert.equal(app.get('brief').value,'Second instructions');app.get('brief').value='Updated second';app.run('selectEditTask(null)');assert.equal(app.get('brief').value,'Whole story brief');assert.equal(app.get('writingAction').value,'outline');assert.equal(app.run('currentWriting().annotations[0].instruction'),'Updated first');assert.equal(app.run('currentWriting().annotations[1].instruction'),'Updated second');});
test('unified composer runs only the selected edit and keeps the other task queued',async()=>{const app=setup('First revised.');app.get('article').value='First. Second.';app.run("save();currentWriting().annotations=[{id:'one',quote:'First.',start:0,end:6,snapshot:'First. Second.',instruction:'Revise first',status:'queued'},{id:'two',quote:'Second.',start:7,end:14,snapshot:'First. Second.',instruction:'Revise second',status:'queued'}];selectEditTask('one')");await app.get('customRun').onclick();assert.equal(app.run('currentWriting().annotations[0].status'),'ready');assert.equal(app.run('currentWriting().annotations[1].status'),'queued');assert.equal(app.get('annotationResult').textContent,'First revised.');assert.equal(app.get('brief').disabled,true);app.run("selectEditTask('two')");assert.equal(app.get('brief').value,'Revise second');assert.equal(app.get('brief').disabled,false);assert.equal(app.get('annotationReview').hidden,true);});
test('summary generation requests and assigns a separate headline',async()=>{const app=setup(JSON.stringify({title:'Summary headline',body:'Summary body.'}));app.get('article').value='';app.get('title').value='';app.get('brief').value='Summarize sources';await app.run("run('summary')");assert.equal(app.get('title').value,'Summary headline');assert.equal(app.get('article').value,'Summary body.');});
test('summary without provider headline gets a nonempty fallback without consuming its lead',async()=>{const app=setup('Ordinary summary lead.');app.get('article').value='';app.get('title').value='';app.get('brief').value='Summarize';await app.run("run('summary')");assert.ok(app.get('title').value.trim());assert.equal(app.get('article').value,'Ordinary summary lead.');});
test('global queue retains separate full-generation jobs and every pending passage edit',async()=>{const app=setup('Result.');await app.run("run('summary')");await app.run("run('outline')");app.run("currentWriting().annotations=[{id:'a',instruction:'one',quote:'First.',status:'queued'},{id:'b',instruction:'two',quote:'Second.',status:'queued'}];navigate('home');queueExpanded=true;renderTaskbar()");assert.equal(app.get('generationBar').children.length,5);assert.equal(app.run('taskJobs.size'),2);});
test('queue starts compact, expands on demand and restores pending decisions after refresh',async()=>{const app=setup('Suggestion.');await app.run("run('summary')");app.run("navigate('home')");assert.equal(app.get('generationBar').children.length,1);app.get('generationBar').children[0].onclick();assert.equal(app.get('generationBar').children.length,2);app.run('taskJobs.clear();renderTaskbar()');assert.equal(app.run('[...taskJobs.values()][0].recovered'),true);app.get('discard').onclick();assert.equal(app.get('reviewDrawer').hidden,true);assert.equal(app.run('currentWriting().pending'),null);});
test('free writing starts without source dependencies and generates from only the brief',async()=>{const app=setup('{"title":"An idea","body":"A fresh draft."}');app.run("createProject('Fresh','writing',{started:'free'});addProjectSource('Research','Unrelated material')");app.get('clearSources').onclick();assert.equal(app.run('currentWriting().selectedSourceIds.length'),0);assert.equal(app.run('currentWriting().autoSelectSources'),false);app.get('brief').value='Write a creative introduction';await app.run("run('draft')");assert.equal(app.get('article').value,'A fresh draft.');assert.equal(app.get('title').value,'An idea');});
test('starting from a pasted draft defaults to continuation and keeps original text until accepted',async()=>{const app=setup('New ending.');app.get('startingDraft').value='My unfinished draft.';app.get('editStartingDraft').onclick();assert.equal(app.get('writingAction').value,'continue');await app.run("run('continue')");assert.equal(app.get('article').value,'My unfinished draft.');app.get('accept').onclick();assert.equal(app.get('article').value,'My unfinished draft.\n\nNew ending.');});
test('new article creates an empty free-writing tab without a dialog',()=>{const app=setup('');const before=app.run('currentProject().writings.length');app.get('addWritingTab').onclick();assert.equal(app.run('currentProject().writings.length'),before+1);assert.equal(app.get('articleStart').open,undefined);assert.equal(app.get('article').value,'');assert.equal(app.run('currentWriting().selectedSourceIds.length'),0);});
test('deleted projects leave dashboard and sources, and restore with all drafts intact',()=>{const app=setup('');app.run("addProjectSource('Notes','Research');save();globalThis.deletedId=activeProjectId;deleteProject(deletedId)");assert.equal(app.get('projectTotal').textContent,0);assert.equal(app.run('filteredAssets().length'),0);assert.equal(app.get('deletedProjects').hidden,false);app.run('restoreProject(deletedId);openProject(deletedId)');assert.equal(app.get('article').value,'Original sentence.');assert.equal(app.run('currentProject().sources[0].text'),'Research');assert.equal(app.get('projectTotal').textContent,1);});
test('renaming a writing tab persists its own name without changing its headline or another tab',()=>{const storage=new Map(),app=setup('',storage);app.get('title').value='Headline';app.run("save();globalThis.firstTab=currentWriting().id;createWriting({title:'Other headline'});openWritingRename(firstTab)");app.get('writingTabName').value='Feature version';app.get('renameWritingForm').onsubmit({preventDefault(){}});assert.equal(app.run('currentProject().writings[0].name'),'Feature version');assert.equal(app.run('currentProject().writings[0].title'),'Headline');assert.equal(app.get('title').value,'Other headline');const restored=setup('',storage);assert.equal(restored.run('currentProject().writings[0].name'),'Feature version');app.run('openWritingRename(firstTab)');app.get('writingTabName').value='Cancelled';app.get('cancelWritingRename').onclick();assert.equal(app.run('currentProject().writings[0].name'),'Feature version');});
test('style details edit preset prompts used by generation and support delete/restore',async()=>{const storage=new Map(),app=setup('Output.',storage);app.run("openStyleDetails('objective')");app.get('globalStyleName').value='Restrained';app.get('globalStyleRules').value='Use short factual sentences.';app.get('saveGlobalStyle').onclick();app.run("currentWriting().style='objective';loadWriting(currentWriting())");let payload;app.setFetch(async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Output.'}}]})}});await app.run("run('polish')");assert.equal(JSON.parse(payload.messages[1].content).styleRules,'Use short factual sentences.');app.run("deleteStyle('objective')");assert.equal(app.run('chosenStyle(currentWriting()).rules'),'');assert.equal(app.get('deletedStyles').hidden,false);app.run("restoreStyle('objective')");assert.equal(app.run('chosenStyle(currentWriting()).rules'),'Use short factual sentences.');const restored=setup('',storage);assert.equal(restored.run("presetStyle('objective').rules"),'Use short factual sentences.');});
test('custom style editing retains identity and deletion is recoverable',()=>{const app=setup('');app.run("personalStyles.push({id:'custom-one',name:'Old',rules:'Old prompt',reference:''});openStyleDetails('custom-one')");app.get('globalStyleName').value='New';app.get('globalStyleRules').value='New prompt';app.get('saveGlobalStyle').onclick();assert.equal(app.run("personalStyles.filter(s=>s.id==='custom-one').length"),1);assert.equal(app.run("styleEntry('custom-one').rules"),'New prompt');app.run("deleteStyle('custom-one');restoreStyle('custom-one')");assert.equal(app.run("styleEntry('custom-one').name"),'New');assert.equal(app.run("styleEntry('custom-one').deletedAt"),undefined);});

test('pasting a draft opens the editor in its empty writing tab',()=>{
 const app=setup('');
 app.run("createProject('Fresh','writing',{started:'free',showEditor:true})");
 assert.equal(app.get('documentArea').hidden,true);
 app.get('openDraftUpload').onclick();
 app.get('editStartingDraft').onclick();
 assert.equal(app.get('draftUploadError').hidden,false);
 app.get('startingDraft').value='An unfinished draft.';
 app.get('editStartingDraft').onclick();
 assert.equal(app.run('currentProject().writings.length'),1);
 assert.equal(app.get('documentArea').hidden,false);
 assert.equal(app.get('article').value,'An unfinished draft.');
});
test('automatic first draft and completed review have truthful task states',async()=>{const app=setup('{"title":"Headline","body":"Body"}');app.run("createProject('Fresh')");app.get('brief').value='Write';await app.run("run('draft')");assert.equal(app.run('currentJob().decision'),'written');assert.match(app.run('jobText(currentJob())'),/写入正文/);const review=setup('{"issues":[]}');await review.run("run('check')");assert.equal(review.run('currentJob().decision'),'reviewed');assert.match(review.run('jobText(currentJob())'),/审阅完成/);});
test('interface language changes do not reopen review on the homepage',async()=>{const app=setup('Suggestion');await app.run("run('polish')");app.run("navigate('home');lang='en';translate()");assert.equal(app.get('reviewDrawer').hidden,true);});
test('passage output retains its heading instead of moving it to article title',async()=>{const app=setup('# Section\n\nPassage.');app.run("selection={start:0,end:8}");await app.run("run('polish')");assert.match(app.get('result').value,/Section/);assert.equal(app.run('pending.title'),'');});
test('file reads finishing after a project switch cannot attach to the wrong project',async()=>{const app=setup('');let finish;const file={name:'notes.txt',size:20,text:()=>new Promise(resolve=>finish=resolve)};const input={files:[file],value:'notes.txt'};const reading=app.get('importFile').onchange({target:input});app.run("createProject('Different project')");finish('Private interview');await reading;assert.equal(app.run('currentProject().sources.length'),0);assert.equal(input.value,'');});
test('new successful suggestions replace old decisions, failed requests retain prior suggestions',async()=>{const app=setup('First proposal');await app.run("run('polish')");const old=app.run('currentJob().id');app.setFetch(async()=>{throw Error('Disconnected')});await app.run("run('polish')");assert.equal(app.run('pending.output'),'First proposal');app.setFetch(async()=>({ok:true,json:async()=>({choices:[{message:{content:'Second proposal'}}]})}));await app.run("run('polish')");assert.equal(app.run('pending.output'),'Second proposal');assert.equal(app.run(`taskJobs.get(${JSON.stringify(old)}).decision`),'superseded');});
test('source editing preserves original and trash excludes prompts then restores number and selection',()=>{const app=setup('');app.run("addProjectSource('Notes','Initial text')");const id=app.run('currentProject().sources[0].id');app.run(`sourceEditingId=${JSON.stringify(id)}`);app.get('sourceName').value='Edited notes';app.get('sourceText').value='Corrected text';app.get('sourceForm').onsubmit({preventDefault(){}});assert.equal(app.run('currentProject().sources[0].originalText'),'Initial text');assert.match(app.get('materials').value,/Corrected text/);app.run(`trashSource(${JSON.stringify(id)})`);assert.equal(app.run('filteredAssets().length'),0);assert.equal(app.get('materials').value,'');app.run(`restoreSource(${JSON.stringify(id)})`);assert.equal(app.run('currentProject().sources[0].number'),1);assert.match(app.get('materials').value,/Corrected text/);});

test('styles require a prompt and keep sample attachments separate from writing constraints',()=>{const app=setup('');app.get('createStyle').onclick();app.get('globalStyleName').value='Sample voice';app.get('globalReference').value='Sample article text';app.run("styleReferenceAttachments=[{name:'sample.txt',text:'Attached sample'}]");app.get('saveGlobalStyle').onclick();assert.equal(app.run("personalStyles.some(s=>s.name==='Sample voice')"),false);app.get('globalStyleRules').value='Use short factual sentences.';app.get('saveGlobalStyle').onclick();assert.equal(app.run("personalStyles.find(s=>s.name==='Sample voice').reference"),'');app.run("openStyleDetails(personalStyles.find(s=>s.name==='Sample voice').id)");assert.equal(app.get('globalReference').value,'');assert.equal(app.run('styleReferenceAttachments[0].name'),'sample.txt');assert.equal(app.run('combinedStyleReference()'),'Attached sample\n\nSample article text');});

test('new project requires a nonblank name and cancellation creates nothing',()=>{
 const app=setup('');
 const before=app.run('projects.length');
 app.get('newProjectButton').onclick();
 assert.equal(app.get('projectDialog').open,true);
 app.get('newProjectName').value='   ';
 app.get('projectForm').onsubmit({preventDefault(){}});
 assert.equal(app.get('projectSetupNameError').hidden,false);
 assert.equal(app.get('projectStartChoices').hidden,true);
 assert.equal(app.run('projects.length'),before);
 app.get('newProjectName').value='New story';
 app.get('newProjectName').oninput();
 assert.equal(app.get('projectSetupNameError').hidden,true);
 app.get('projectForm').onsubmit({preventDefault(){}});
 assert.equal(app.get('projectStartChoices').hidden,false);
 app.get('backToProjectName').onclick();
 assert.equal(app.get('newProjectName').value,'New story');
 app.get('closeProjectDialog').onclick();
 assert.equal(app.get('projectDialog').open,false);
 assert.equal(app.run('projects.length'),before);
});
test('the homepage writing entry opens a named project without an empty editor',()=>{
 const app=setup('');
 app.get('homeStartWriting').onclick();
 assert.equal(app.get('projectDialog').open,true);
 app.get('newProjectName').value='  City transport  ';
 app.get('projectForm').onsubmit({preventDefault(){}});
 assert.equal(app.get('projectDialog').open,true);
 assert.notEqual(app.run('currentProject().name'),'City transport');
 app.get('projectStartWriting').onclick();
 assert.equal(app.get('projectDialog').open,false);
 assert.equal(app.run('currentProject().name'),'City transport');
 assert.equal(app.run('projectTab'),'writing');
 assert.equal(app.run('currentProject().writings.length'),1);
 assert.equal(app.get('documentArea').hidden,true);
 assert.equal(app.get('writingExport').disabled,true);
});
test('natural-language discussion leaves article and pending edits intact',async()=>{const app=setup(JSON.stringify({kind:'message',body:'Consider the cost angle.'}));app.get('article').value='Original draft';app.get('brief').value='Suggest a few angles';app.run('save()');await app.run("run('auto')");assert.equal(app.get('article').value,'Original draft');assert.equal(app.run('currentWriting().conversation[0].reply'),'Consider the cost angle.');assert.equal(app.run('currentWriting().pending'),null);});
test('natural-language article requests write first drafts and require approval for existing drafts',async()=>{for(const original of ['','Original draft']){const app=setup(JSON.stringify({kind:'article',title:'Headline',body:'Generated article'}));app.get('article').value=original;app.get('brief').value='Write an article';app.run('save()');await app.run("run('auto')");if(original){assert.equal(app.get('article').value,original);assert.equal(app.run('currentWriting().pending.output'),'Generated article');}else{assert.equal(app.get('article').value,'Generated article');assert.equal(app.get('title').value,'Headline');}}});

test('pasted style samples become TXT attachments and close their composer',()=>{const app=setup('');app.get('createStyle').onclick();app.get('globalReference').value='Sample text';app.get('savePastedStyleSample').onclick();assert.equal(app.get('globalReference').value,'');assert.equal(app.get('stylePasteComposer').hidden,true);assert.match(app.run('styleReferenceAttachments[0].name'),/\.txt$/);assert.equal(app.run('styleReferenceAttachments[0].text'),'Sample text');});
test('stream preview decodes incomplete JSON body without exposing its envelope',()=>{const app=setup('');assert.equal(app.run('partialOutputString(\'{"kind":"article","title":"News","body":"First\\\\nSecond\',"body")'),'First\nSecond');assert.equal(app.run('partialOutputString(\'{"body":"Keep\\\\\"quote\\\\\"\',"body")'),'Keep"quote"');});
test('style generation reveals editable rules and switches actions only after completion',async()=>{const app=setup('');app.get('createStyle').onclick();app.run("styleReferenceAttachments=[{name:'sample.txt',text:'Writing sample'}];var finishStyle;request=async(path,extra,options)=>{options.onProgress({phase:'generating',text:'Use short '});return await new Promise(resolve=>finishStyle=resolve);}");const work=app.get('analyzeStyle').onclick();assert.equal(app.get('globalStyleRules').value,'');assert.equal(app.get('stylePromptDetails').hidden,true);assert.equal(app.get('saveGlobalStyle').disabled,true);app.run("finishStyle({choices:[{message:{content:'Use short sentences.'}}]})");await work;assert.equal(app.get('globalStyleRules').value,'Use short sentences.');assert.equal(app.get('stylePromptDetails').hidden,false);assert.equal(app.get('analyzeStyle').hidden,true);assert.equal(app.get('regenerateStyle').disabled,false);assert.equal(app.get('saveGlobalStyle').disabled,false);});

test('article generation previews streamed text without replacing the existing draft',async()=>{const app=setup('');app.get('article').value='Original draft';app.get('brief').value='Rewrite this article';app.run('save()');app.run(`var finishArticle;request=async(path,extra,options)=>{options.onProgress({phase:'generating',text:'{"kind":"article","title":"New title","body":"Live paragraph'});return await new Promise(resolve=>finishArticle=resolve);}`);const work=app.run("run('auto')");await new Promise(resolve=>setImmediate(resolve));assert.equal(app.get('generationPreview').hidden,false);assert.equal(app.get('editorFields').hidden,true);assert.equal(app.get('generationPreviewBody').textContent,'Live paragraph');assert.equal(app.get('article').value,'Original draft');app.run(`finishArticle({choices:[{message:{content:JSON.stringify({kind:'article',title:'New title',body:'Live paragraph completed.'})}}]})`);await work;assert.equal(app.get('generationPreview').hidden,true);assert.equal(app.get('editorFields').hidden,false);assert.equal(app.get('article').value,'Original draft');assert.equal(app.run('currentWriting().pending.output'),'Live paragraph completed.');});

test('saved styles separate browsing from editing and cancel restores saved content',()=>{const app=setup('');app.get('createStyle').onclick();app.get('globalStyleName').value='Saved voice';app.get('globalStyleRules').value='Facts first.';app.get('saveGlobalStyle').onclick();app.run("openStyleDetails(personalStyles.find(s=>s.name==='Saved voice').id)");assert.equal(app.get('styleReadView').hidden,false);assert.equal(app.get('styleEditView').hidden,true);assert.equal(app.get('styleReadPrompt').textContent,'Facts first.');app.get('editSavedStyle').onclick();assert.equal(app.get('styleEditView').hidden,false);app.get('globalStyleName').value='Unsaved';app.get('globalStyleRules').value='Unsaved prompt';app.get('cancelStyleEdit').onclick();assert.equal(app.get('styleReadName').textContent,'Saved voice');assert.equal(app.get('globalStyleRules').value,'Facts first.');assert.equal(app.get('styleEditView').hidden,true);});

test('project view and sort choices persist and name sorting does not mutate projects',()=>{const app=setup('');app.get('projectsGridView').onclick();assert.equal(app.run('projectViewPreference'),'grid');app.get('projectSort').value='name';app.get('projectSort').onchange();assert.equal(app.run('projectSortPreference'),'name');assert.equal(app.run("orderProjectList([{name:'Zulu'},{name:'Alpha'}])[0].name"),'Alpha');assert.equal(app.run("devicePrefs.getItem('newsroom-project-view')"),'grid');});
test('new style hides saving until a complete prompt is available',()=>{const app=setup('');app.get('createStyle').onclick();assert.equal(app.get('saveGlobalStyle').hidden,true);app.get('globalStyleRules').value='Use precise attribution.';app.run('styleHasResult=true;syncStyleSaveVisibility()');assert.equal(app.get('saveGlobalStyle').hidden,false);app.run('styleStreamController=new AbortController();syncStyleSaveVisibility()');assert.equal(app.get('saveGlobalStyle').hidden,true);});

test('glass transparency is bounded and persists independently of model settings',()=>{const storage=new Map();const app=setup('',storage);assert.equal(app.get('glassTransparency').value,'100');assert.equal(app.run('setGlassTransparency(150,true)'),100);assert.equal(JSON.parse(storage.get('newsroom-local')).preferences['newsroom-glass-transparency'],'100');assert.equal(app.get('glassTransparencyValue').textContent,'100%');const reloaded=setup('',storage);assert.equal(reloaded.get('glassTransparency').value,'100');assert.equal(app.run('setGlassTransparency(-20)'),0);});

test('wallpaper choices persist independently of model settings',()=>{
 const storage=new Map([['newsroom-wallpaper','history']]);
 const app=setup('',storage);
 assert.equal(app.run('document.documentElement.dataset.wallpaper'),'dunes');
 assert.equal(app.get('wallpaperChoices').children.length,6);
 app.run("chooseSettingsPanel('models')");
 assert.equal(app.get('systemSettingsPanel').hidden,true);
 app.run("chooseSettingsPanel('system')");
 assert.equal(app.get('modelSettingsPanel').hidden,true);
 const coast=app.get('wallpaperChoices').children.find(button=>button.dataset.wallpaper==='coast');
 coast.onclick();
 assert.equal(app.run('document.documentElement.dataset.wallpaper'),'coast');
 assert.equal(JSON.parse(storage.get('newsroom-local')).preferences['newsroom-wallpaper'],'coast');
 assert.equal(setup('',storage).run('document.documentElement.dataset.wallpaper'),'coast');
});

test('permanent project deletion requires confirmation and cannot resurrect from legacy fields',()=>{const storage=new Map(),app=setup('',storage);app.run('var purgeProjectId=activeProjectId;deleteProject(purgeProjectId);requestPurge("project",purgeProjectId)');assert.equal(app.get('purgeDialog').open,true);assert.equal(app.run('projects.length'),1);app.get('cancelPurge').onclick();assert.equal(app.run('projects.length'),1);app.run('requestPurge("project",purgeProjectId)');app.get('confirmPurge').onclick();assert.equal(app.run('projects.length'),0);assert.equal(setup('',storage).run('projects.length'),0);});
test('permanent source deletion removes trash while preserving the draft',()=>{const app=setup('');app.run("var binSource=addProjectSource('Notes','Research');trashSource(binSource.id);requestPurge('source',binSource.id,activeProjectId)");assert.equal(app.run('currentProject().deletedSources.length'),1);app.get('confirmPurge').onclick();assert.equal(app.run('currentProject().deletedSources.length'),0);assert.equal(app.get('article').value,'Original sentence.');});
test('permanent preset deletion stays deleted after reload and cannot purge an active style',()=>{const storage=new Map(),app=setup('',storage);app.run("requestPurge('style','objective')");assert.equal(app.run('pendingPurge'),null);app.run("deleteStyle('objective');requestPurge('style',styleEntry('objective').id)");app.get('confirmPurge').onclick();assert.equal(app.run("presetStyle('objective').purged"),true);assert.equal(setup('',storage).run("presetStyle('objective').purged"),true);assert.equal(app.get('article').value,'Original sentence.');});

test('purging a custom style clears its active selector without changing article text',()=>{const app=setup('');app.run("personalStyles.push({id:'purge-me',name:'Voice',rules:'Use concise prose.'});currentWriting().style='personal:purge-me';loadWriting(currentWriting());deleteStyle('purge-me');requestPurge('style','purge-me')");app.get('confirmPurge').onclick();assert.equal(app.run('currentWriting().style'),'');assert.equal(app.run("personalStyles.some(s=>s.id==='purge-me')"),false);assert.equal(app.get('article').value,'Original sentence.');});

test('chat edits become separate comments and each accept/reject keeps other paragraphs',async()=>{const original='First old sentence.\n\nKeep this paragraph.\n\nLast old sentence.',app=setup(JSON.stringify({kind:'article',title:'',body:'First new sentence.\n\nKeep this paragraph.\n\nLast revised sentence.'}));app.get('article').value=original;app.get('brief').value='Improve the first and last paragraphs';app.run('save()');await app.run("run('auto')");assert.equal(app.get('article').value,original);assert.equal(app.run("currentWriting().changeBatch.comments.filter(c=>c.field==='article').length"),2);app.run("decideChange(currentWriting().changeBatch.comments.find(c=>c.field==='article').id,true)");assert.equal(app.get('article').value,'First new sentence.\n\nKeep this paragraph.\n\nLast old sentence.');app.run("decideChange(currentWriting().changeBatch.comments.find(c=>c.field==='article'&&c.status==='pending').id,false)");assert.equal(app.get('article').value,'First new sentence.\n\nKeep this paragraph.\n\nLast old sentence.');app.get('undo').onclick();assert.equal(app.get('article').value,original);});
test('source-backed conflicts auto-correct with provenance and undo; stylistic edits still wait',async()=>{const app=setup(JSON.stringify({kind:'article',title:'',body:'The cost is 20 million. A clear conclusion.',corrections:[{quote:'30 million',replacement:'20 million',sourceNumber:1,sourceQuote:'The cost is 20 million.'}]}));app.get('article').value='The cost is 30 million. A vague conclusion.';app.run("addProjectSource('Report','The cost is 20 million.');save()");app.get('brief').value='Clarify the article';app.run('save()');await app.run("run('auto')");assert.equal(app.get('article').value,'The cost is 20 million. A vague conclusion.');assert.equal(app.run('currentWriting().factCorrections[0].sourceNumber'),1);assert.ok(app.run("currentWriting().changeBatch.comments.some(c=>c.status==='pending')"));app.get('undo').onclick();assert.equal(app.get('article').value,'The cost is 30 million. A vague conclusion.');});
test('a source-only correction does not leave an empty waiting-for-decision task',async()=>{const app=setup(JSON.stringify({kind:'article',title:'Same title',body:'The cost is 20 million.',corrections:[{quote:'30 million',replacement:'20 million',sourceNumber:1,sourceQuote:'The cost is 20 million.'}]}));app.get('article').value='The cost is 30 million.';app.get('title').value='Same title';app.run("addProjectSource('Report','The cost is 20 million.');save()");app.get('brief').value='Check the amount';app.run('save()');await app.run("run('auto')");assert.equal(app.get('article').value,'The cost is 20 million.');assert.equal(app.run('currentWriting().pending'),null);assert.equal(app.run('currentJob().decision'),'written');});
test('individual comments refuse stale manual replacements',async()=>{const app=setup(JSON.stringify({kind:'article',title:'',body:'New sentence.'}));app.get('brief').value='Rewrite';app.run('save()');await app.run("run('auto')");const id=app.run("currentWriting().changeBatch.comments.find(c=>c.field==='article').id");app.get('article').value='My completely different article.';app.run(`decideChange(${JSON.stringify(id)},true)`);assert.equal(app.get('article').value,'My completely different article.');assert.ok(app.run(`currentWriting().changeBatch.comments.find(c=>c.id===${JSON.stringify(id)}).error`));});

test('negative prompts persist per article and selected style and reach generation separately',async()=>{
 const storage=new Map(),app=setup('Output.',storage);
 app.run("openStyleDetails('objective')");app.get('globalStyleNegative').value='Avoid promotional claims.';app.get('saveGlobalStyle').onclick();
 app.run("currentWriting().style='objective';loadWriting(currentWriting())");app.get('negativePrompt').value='Avoid rhetorical questions.';app.run('save()');
 let payload;app.setFetch(async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Output.'}}]})}});await app.run("run('polish')");
 const request=JSON.parse(payload.messages[1].content);assert.equal(request.styleNegativePrompt,'Avoid promotional claims.');assert.equal(request.negativePrompt,'Avoid rhetorical questions.');
 const id=app.run('currentWriting().id');app.run("createWriting({article:'Another draft'})");assert.equal(app.get('negativePrompt').value,'');app.run(`switchWriting(${JSON.stringify(id)})`);assert.equal(app.get('negativePrompt').value,'Avoid rhetorical questions.');
 app.run("openStyleDetails('objective')");assert.equal(app.get('styleReadNegative').textContent,'Avoid promotional claims.');assert.equal(app.get('globalStyleNegative').value,'Avoid promotional claims.');
 app.get('globalStyleNegative').value='';app.get('saveGlobalStyle').onclick();assert.equal(app.run("presetStyle('objective').negativePrompt"),'');
 const restored=setup('',storage);assert.equal(restored.get('negativePrompt').value,'Avoid rhetorical questions.');
});

test('negative prompt dialog saves explicitly, cancels cleanly, and cannot target another article',()=>{
 const app=setup('');app.get('negativePrompt').value='Original rule';app.run('save()');
 app.get('openNegativePrompt').onclick();assert.equal(app.get('negativePromptDraft').value,'Original rule');app.get('negativePromptDraft').value='Unsaved rule';app.get('cancelNegativePrompt').onclick();assert.equal(app.get('negativePrompt').value,'Original rule');
 app.get('openNegativePrompt').onclick();app.get('negativePromptDraft').value='Saved rule';app.get('saveNegativePrompt').onclick();assert.equal(app.run('currentWriting().negativePrompt'),'Saved rule');
 app.get('openNegativePrompt').onclick();app.get('negativePromptDraft').value='Wrong article';app.run("createWriting({article:'Other article'})");app.get('saveNegativePrompt').onclick();assert.equal(app.run('currentWriting().negativePrompt'),'');
});
test('style read view only displays populated negative prompts',()=>{
 const app=setup('');app.run("openStyleDetails('objective')");assert.equal(app.get('styleReadNegativeDetails').hidden,true);
 app.get('globalStyleNegative').value='Avoid repetition';app.get('saveGlobalStyle').onclick();app.run("openStyleDetails('objective')");assert.equal(app.get('styleReadNegativeDetails').hidden,false);assert.equal(app.get('styleReadNegative').textContent,'Avoid repetition');
 app.get('globalStyleNegative').value='  ';app.get('saveGlobalStyle').onclick();app.run("openStyleDetails('objective')");assert.equal(app.get('styleReadNegativeDetails').hidden,true);
});

test('research imports extracted webpage text, keeps saved sources independent, and avoids duplicates',async()=>{const app=setup('');const id=app.run('activeProjectId');app.run(`researchContext={kind:'project',projectId:${JSON.stringify(id)}};researchStore().results=[{id:'1',url:'https://example.com/report',title:'Search title',summary:'Snippet',score:80}];`);app.setFetch(async()=>({ok:true,json:async()=>({title:'Extracted title',text:'Actual webpage article body, not the search snippet.',url:'https://example.com/report'})}));await app.run('importResearchMaterial(researchContext,researchStore().results[0])');assert.equal(app.run('currentProject().sources[0].name'),'Extracted title');assert.match(app.run('currentProject().sources[0].text'),/Actual webpage/);assert.equal(app.run('currentProject().sources[0].origin'),'research');await app.run('importResearchMaterial(researchContext,researchStore().results[0])');assert.equal(app.run('currentProject().sources.length'),1);app.run('researchStore().results=[]');assert.equal(app.run('currentProject().sources.length'),1);});
test('failed webpage extraction does not add a snippet as a source',async()=>{const app=setup('');app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId}");app.setFetch(async()=>({ok:false,json:async()=>({error:'no_content'})}));await app.run("importResearchMaterial(researchContext,{url:'https://example.com',title:'Snippet only',summary:'Not the article'})");assert.equal(app.run('currentProject().sources.length'),0);assert.match(app.run('researchStore().status'),/no_content/);});
test('research started in a new project stores extracted sources there',async()=>{
 const app=setup('');
 const previous=app.run('activeProjectId');
 app.get('newProjectButton').onclick();
 app.get('newProjectName').value='City transport';
 app.get('projectForm').onsubmit({preventDefault(){}});
 app.get('projectStartResearch').onclick();
 assert.equal(app.run('projectTab'),'research');
 assert.equal(app.get('researchQuery').value,'City transport');
 app.run("researchStore().results=[{url:'https://example.com/report',title:'Candidate'}]");
 app.setFetch(async()=>({ok:true,json:async()=>({url:'https://example.com/report',title:'Extracted article',text:'Article body'})}));
 await app.run('importResearchMaterial(researchContext,researchStore().results[0])');
 assert.equal(app.run('currentProject().sources[0].text'),'Article body');
 assert.equal(app.run('currentWriting().selectedSourceIds.length'),1);
 assert.equal(app.run('selectedResearchRound(researchStore()).results.length'),1);
 app.run(`openProject(${JSON.stringify(previous)})`);
 assert.equal(app.run('currentProject().sources.length'),0);
});

test('the upload route opens the source library of the new project',async()=>{
 const app=setup('');
 const previous=app.run('activeProjectId');
 app.get('newProjectButton').onclick();
 app.get('newProjectName').value='Interviews';
 app.get('projectForm').onsubmit({preventDefault(){}});
 app.get('projectStartLibrary').onclick();
 assert.equal(app.run('projectTab'),'library');
 assert.equal(app.get('projectLibrary').hidden,false);
 assert.equal(app.run('currentProject().name'),'Interviews');
 await app.get('importFile').onchange({target:{files:[{name:'interview.txt',size:21,text:async()=>'Interview notes'}]}});
 assert.equal(app.run('currentProject().sources[0].text'),'Interview notes');
 app.run(`openProject(${JSON.stringify(previous)})`);
 assert.equal(app.run('currentProject().sources.length'),0);
});

test('research snapshots keep prior rounds through Find more, failure and a new search',async()=>{const app=setup('');app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId};researchStore().results=[{id:'old',url:'https://example.com/old',title:'Old material'}]");app.get('searchURL').value='http://search.local';app.get('researchQuery').value='Add inspections';const requests=[];const packet=data=>{let sent=false;return {ok:true,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:new TextEncoder().encode(JSON.stringify(data)+'\n')})})}};};app.setFetch(async(url,options)=>{requests.push(JSON.parse(options.body));return packet({phase:'done',data:{results:[{id:'new',url:'https://example.com/new',title:'New material'}],batchId:'new'}})});await app.run("runResearch('more')");assert.equal(app.run('researchStore().rounds.flatMap(r=>r.results||[]).length'),2);assert.equal(requests[0].mode,'more');app.setFetch(async()=>packet({phase:'error',error:'Search unavailable'}));await app.run("runResearch('replace')");assert.equal(app.run('researchStore().rounds.flatMap(r=>r.results||[]).length'),2);app.setFetch(async()=>packet({phase:'done',data:{results:[{id:'replacement',url:'https://example.com/replacement',title:'Replacement'}],batchId:'replacement'}}));await app.run("runResearch('replace')");assert.equal(app.run('selectedResearchRound(researchStore()).results.length'),1);assert.equal(app.run('researchStore().rounds.length'),4);assert.equal(app.run('researchJobs.size'),0);});

test('built-in search is default even when a previous external URL is saved',()=>{const app=setup('');app.get('searchURL').value='http://old-search.local';app.get('useExternalSearch').checked=false;assert.equal(app.run('researchSearchURL()'),'');app.get('useExternalSearch').checked=true;assert.equal(app.run('researchSearchURL()'),'http://old-search.local');});
test('failed research import opens recovery without snippets and saves pasted body with provenance',async()=>{const app=setup('');app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId};researchStore().results=[{url:'https://example.com/report',title:'Source title',summary:'Only a search summary'}]");app.setFetch(async()=>({ok:false,json:async()=>({error:'http_error',httpStatus:403,message:'HTTP 403',manualAllowed:true})}));await app.run('importResearchMaterial(researchContext,researchStore().results[0])');assert.equal(app.get('materialImportDialog').open,true);assert.equal(app.get('materialImportName').value,'Source title');assert.equal(app.get('materialImportText').value,'');assert.equal(app.get('materialOriginal').href,'https://example.com/report');app.get('materialImportText').value='A full article copied from the original website.';app.get('materialImportForm').onsubmit({preventDefault(){}});assert.equal(app.run('currentProject().sources[0].text'),'A full article copied from the original website.');assert.equal(app.run('currentProject().sources[0].url'),'https://example.com/report');assert.equal(app.run('currentProject().sources[0].extractionMethod'),'manual');assert.equal(app.get('materialImportDialog').open,false);});
test('manual source completion retains its owning project after switching projects',()=>{const app=setup('');app.run("globalThis.original=activeProjectId;openMaterialImport({kind:'project',projectId:original},{url:'https://example.com/report',title:'Original source'},{message:'403'});createProject('Other project')");app.get('materialImportText').value='Copied original article';app.get('materialImportForm').onsubmit({preventDefault(){}});assert.equal(app.run('currentProject().sources.length'),0);assert.equal(app.run('projects.find(p=>p.id===original).sources[0].text'),'Copied original article');});
test('recovery does not expose non-web URLs or blocked private destinations',()=>{const app=setup('');app.run("openMaterialImport({kind:'project',projectId:activeProjectId},{url:'javascript:alert(1)',title:'Bad'},{message:'Invalid'})");assert.notEqual(app.get('materialImportDialog').open,true);app.run("openMaterialImport({kind:'project',projectId:activeProjectId},{url:'http://127.0.0.1',title:'Private'},{manualAllowed:false})");assert.notEqual(app.get('materialImportDialog').open,true);});
test('research cards show a labeled summary and a useful empty-snippet state',()=>{const app=setup('');app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId};researchStore().results=[{url:'https://example.com/report',title:'Report',summary:'   ',snippet:'Actual search snippet',score:80},{url:'https://example.com/empty',title:'No snippet',score:70}];renderResearch()");const flatten=node=>[node.textContent,...(node.children||[]).map(flatten)].join(' ');const cards=app.get('researchResultList').children[0].children.at(-1).children;assert.match(flatten(cards[0]),/摘要/);assert.match(flatten(cards[0]),/Actual search snippet/);assert.match(flatten(cards[1]),/未提供可用摘要/);});


test('research checks group accessible and failed materials without adding sources',async()=>{
 const app=setup('');
 app.run(`projectTab='research';researchContext={kind:'project',projectId:activeProjectId};
  researchStore().results=[
   {url:'https://example.com/blocked',title:'Blocked article'},
   {url:'https://example.com/readable',title:'Readable article'}
  ];`);
 app.setFetch(async(_url,options)=>{
  const {url}=JSON.parse(options.body);
  return url.endsWith('/blocked')
   ? {ok:false,json:async()=>({error:'http_error',message:'HTTP 403',manualAllowed:true})}
   : {ok:true,json:async()=>({url,title:'Readable article',text:'Verified article text.'})};
 });
 await app.run('checkResearchResults(researchContext,researchStore().results)');
 const [automatic,manual]=app.get('researchResultList').children;
 const automaticCard=automatic.children.at(-1).children[0];
 const manualCard=manual.children.at(-1).children[0];
 assert.equal(automaticCard.children[0].children[0].textContent,'Readable article');
 assert.equal(manualCard.children[0].children[0].textContent,'Blocked article');
 assert.equal(app.run('currentProject().sources.length'),0);
 assert.notEqual(app.get('materialImportDialog').open,true);
 const [original,paste]=manualCard.children.at(-1).children;
 assert.equal(original.href,'https://example.com/blocked');
 paste.onclick();
 assert.equal(app.get('materialImportText').value,'');
 assert.equal(app.get('materialImportDialog').open,true);
});

test('research activity checks the full round and filters by relevance',async()=>{
 const app=setup('');
 app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId}");
 app.get('researchQuery').value='New topic';
 const requests=[];
 app.setFetch(async(url,options)=>{
  requests.push(JSON.parse(options.body));
  if(url==='/api/website'){
   const target=requests.at(-1).url;
   if(target.endsWith('/blocked'))return {ok:false,json:async()=>({error:'http_error',message:'HTTP 403',manualAllowed:true})};
   return {ok:true,json:async()=>({text:'The article body.',url:target})};
  }
  const event={phase:'done',data:{
   routes:[{kind:'primary',engines:['bing'],queries:['New topic']},{kind:'backup',engines:['google'],queries:['New topic']}],
   batchId:'round',results:[{url:'https://example.com/recommended',title:'Recommended'}],
   candidates:[{url:'https://example.com/extra',title:'Extra candidate',snippet:'Original snippet'},{url:'https://example.com/blocked',title:'Blocked candidate'}],
   stats:{returned:4,unique:3,previousExcluded:0,candidates:3}
  }};
  let sent=false;
  return {ok:true,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:new TextEncoder().encode(JSON.stringify(event)+'\n')})})}};
 });
 await app.run("runResearch('replace')");
 await app.run('researchCheckQueue');
 assert.match(app.get('researchQueries').children[0].children.map(node=>node.textContent).join(' '),/搜索返回 4.*取样去重 3.*送入排名 3.*推荐 1/);
 assert.match(app.get('researchQueries').children[0].children.map(node=>node.textContent).join(' '),/首轮检索 · bing.*备用补查 · google/);
 assert.equal(app.get('researchTotal').textContent,'3 条结果');
 assert.equal(app.get('researchSteps').children[4].children[1].textContent,words.zh.researchCheckStep);
 assert.equal(app.get('researchSteps').children[4].children[3].textContent,'优先推荐 1/1');
 assert.equal(requests.filter(request=>request.url).length,1);
 assert.equal(app.get('researchHigh').textContent,'优先推荐 (1)');
 assert.equal(app.get('researchUnscored').textContent,'未评分 (2)');
 app.get('researchUnscored').onclick();
 await app.run('researchCheckQueue');
 const [automatic,manual]=app.get('researchResultList').children;
 assert.equal(automatic.children[0].textContent,'可直接导入 (1)');
 assert.match(automatic.children[1].textContent,/加入 Source.*素材库/);
 assert.equal(manual.children[0].textContent,'手动导入 (1)');
 assert.deepEqual(requests.filter(request=>request.url).map(request=>request.url),[
  'https://example.com/recommended','https://example.com/extra','https://example.com/blocked'
 ]);
 await app.run("runResearch('more')");
 const followup=requests.findLast(request=>request.mode==='more');
 assert.deepEqual(followup.previousEngines,['bing','google']);
 assert.ok(followup.excludeUrls.includes('https://example.com/extra'));
});

test('Run opens an empty editor immediately and keeps failure details through reload and retry',async()=>{
 const storage=new Map(),app=setup('',storage);
 app.run("createProject('Run status');globalThis.statusWriting=currentWriting().id");
 assert.equal(app.get('documentArea').hidden,true);
 app.get('brief').value='Draft a short report';
 app.run("var rejectRun;request=async()=>new Promise((_,reject)=>rejectRun=reject)");
 const work=app.run("run('draft')");
 assert.equal(app.get('documentArea').hidden,false);
 assert.equal(app.get('modelActivity').hidden,false);
 assert.match(app.get('modelActivityText').textContent,/等待模型/);
 assert.equal(app.get('cancelGeneration').hidden,false);
 assert.deepEqual(app.get('writingSteps').children.map(step=>step.dataset.state),['active','pending','pending']);
 app.run("rejectRun(Object.assign(new Error('HTTP 503 fixture provider unavailable'),{code:'HTTP 503'}))");
 await work;
 assert.equal(app.get('documentArea').hidden,false);
 assert.equal(app.get('modelActivity').dataset.state,'failed');
 assert.equal(app.get('editorTaskErrorCode').textContent,'HTTP 503');
 assert.match(app.get('editorTaskErrorDetail').textContent,/fixture provider unavailable/);
 assert.equal(app.get('cancelGeneration').hidden,true);
 const restored=setup('',storage);
 assert.equal(restored.get('documentArea').hidden,false);
 assert.equal(restored.get('modelActivity').dataset.state,'failed');
 assert.equal(restored.get('editorTaskErrorCode').textContent,'HTTP 503');
 assert.deepEqual(restored.get('writingSteps').children.map(step=>step.dataset.state),['failed','pending','pending']);
 restored.run("request=async()=>({choices:[{message:{content:'{\"title\":\"Report\",\"body\":\"Generated body\"}'}}]})");
 await restored.run("run('draft')");
 assert.equal(restored.get('modelActivity').dataset.state,'completed');
 assert.equal(restored.get('editorTaskError').hidden,true);
 assert.equal(restored.get('article').value,'Generated body');
});

test('editor task progress stays with its owning article and cancellation is displayed in the editor',async()=>{
 const app=setup('');
 app.run("createProject('Task owner');globalThis.ownerArticle=currentWriting().id");
 app.get('brief').value='Draft';
 app.run("request=async(path,extra,options)=>{options.onProgress({phase:'thinking'});return new Promise((_,reject)=>options.controller.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError'))));}");
 const work=app.run("run('draft')");
 assert.match(app.get('modelActivityText').textContent,/思考/);
 app.run('createWriting()');
 assert.equal(app.get('documentArea').hidden,true);
 assert.equal(app.get('modelActivity').hidden,true);
 assert.equal(app.get('modelActivityText').textContent,'');
 app.run('switchWriting(ownerArticle)');
 assert.equal(app.get('documentArea').hidden,false);
 assert.match(app.get('modelActivityText').textContent,/思考/);
 app.get('cancelGeneration').onclick();await work;
 assert.equal(app.get('modelActivity').dataset.state,'stopped');
 assert.deepEqual(app.get('writingSteps').children.map(step=>step.dataset.state),['done','stopped','pending']);
 assert.equal(app.get('editorTaskError').hidden,true);
 assert.equal(app.get('documentArea').hidden,false);
});

test('an interrupted persisted task opens the editor with a stopped state and failure codes redact credentials',async()=>{
 const storage=new Map(),app=setup('',storage);
 app.run("createProject('Interrupted');currentWriting().editorOpened=true;currentWriting().taskStatus={phase:'thinkingModel',started:Date.now(),updatedAt:Date.now()};save()");
 const restored=setup('',storage);
 assert.equal(restored.get('documentArea').hidden,false);
 assert.equal(restored.get('modelActivity').dataset.state,'stopped');
 assert.match(restored.get('modelActivityText').textContent,/中断/);
 restored.get('apiKey').value='fixture-private-key';
 restored.get('brief').value='Draft';
 restored.run("request=async()=>{throw new TypeError('network error fixture-private-key')}");
 await restored.run("run('draft')");
 assert.equal(restored.get('editorTaskErrorCode').textContent,'NETWORK_ERROR');
 assert.doesNotMatch(restored.get('editorTaskErrorMessage').textContent,/fixture-private-key/);
 assert.doesNotMatch(storage.get('newsroom-local'),/fixture-private-key/);
});

test('task timeout and provider errors do not overwrite a separately verified model connection',()=>{
 const app=setup('');
 app.run('modelConnection.connected=true;var connectionTask=beginModelTask()');
 app.run("connectionTask.issue({timedOut:true});connectionTask.issue({status:429});connectionTask.issue({status:503});connectionTask.end()");
 assert.equal(app.run('modelConnection.connected'),true);
 app.run("connectionTask.issue({status:401})");
 assert.equal(app.run('modelConnection.connected'),false);
 app.run("connectionTask.issue({code:'invalid_output'})");
 assert.equal(app.run('modelConnection.connected'),true);
 app.run("connectionTask.issue({code:'NETWORK_ERROR'})");
 assert.equal(app.run('modelConnection.connected'),false);
});

test('foreground task stays in its editor while background failure is labeled truthfully',async()=>{
 const app=setup('');app.get('brief').value='Write';
 app.setFetch(async()=>{throw new TypeError('network error')});
 await app.run("run('draft')");
 assert.equal(app.get('generationBar').hidden,true);
 assert.equal(app.get('modelActivity').dataset.state,'failed');
 app.run("navigate('styles')");
 assert.equal(app.get('generationBar').hidden,false);
 assert.match(app.get('generationBar').children[0].textContent,/需要处理/);
 assert.doesNotMatch(app.get('generationBar').children[0].textContent,/Queued 0|排队中 0/);
});

test('style generation exposes actual phases and cancellation retains prior style rules',async()=>{
 const app=setup('');
 app.run("styleReferenceAttachments=[{name:'sample.txt',text:'A writing sample.'}];request=async(path,extra,options)=>{options.onProgress({phase:'thinking'});return new Promise((_,reject)=>options.controller.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError'))));}");
 app.get('globalStyleRules').value='Previously saved rules';
 app.run('styleHasResult=true');
 const work=app.get('regenerateStyle').onclick();
 assert.equal(app.get('analyzeStyle').hidden,true);
 assert.equal(app.get('stylePromptDetails').hidden,true);
 assert.equal(app.get('styleTaskFeedback').dataset.phase,'thinking');
 assert.equal(app.get('stopStyleGeneration').hidden,false);
 app.get('stopStyleGeneration').onclick();await work;
 assert.equal(app.get('styleTaskFeedback').dataset.phase,'stopped');
 assert.equal(app.get('globalStyleRules').value,'Previously saved rules');
 assert.equal(app.get('stylePromptDetails').hidden,false);
 assert.equal(app.get('analyzeStyle').hidden,true);
 assert.equal(app.get('stopStyleGeneration').hidden,true);
});

test('leaving Research cancels automatic text checks without flagging a source failure or opening a dialog',async()=>{
 const app=setup('');
 app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId};researchStore().results=[{url:'https://example.com/automatic',title:'Automatic check'}]");
 app.setFetch(async(_url,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')))));
 const work=app.run('checkResearchResults(researchContext,researchStore().results)');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.run('researchBodyOperations.size'),1);
 app.run("navigate('styles')");await work;
 assert.equal(app.run('researchBodyOperations.size'),0);
 assert.equal(app.run('selectedResearchRound(researchStore()).results[0].bodyStatus'),undefined);
 assert.notEqual(app.get('materialImportDialog').open,true);
});

test('a delayed source upload is saved to its original project instead of being discarded on navigation',async()=>{
 const app=setup('');const original=app.run('activeProjectId');let finish;
 const input={value:'source.txt',files:[{name:'source.txt',size:10,text:()=>new Promise(resolve=>finish=resolve)}]};
 const reading=app.get('importFile').onchange({target:input});
 app.run("createProject('Another project')");finish('Uploaded source text');await reading;
 assert.equal(app.run('currentProject().sources.length'),0);
 assert.equal(app.run(`projects.find(item=>item.id===${JSON.stringify(original)}).sources[0].text`),'Uploaded source text');
});

test('empty source files fail without creating empty records',async()=>{
 const app=setup('');const before=app.run('currentProject().sources.length');
 await app.get('importFile').onchange({target:{value:'empty.txt',files:[{name:'empty.txt',size:3,text:async()=>'   '}]}});
 assert.equal(app.run('currentProject().sources.length'),before);
 assert.match(app.get('status').textContent,/没有可用文本/);
});

test('a provider error during style streaming is a failure rather than a user cancellation',async()=>{
 const app=setup('');app.run("styleReferenceAttachments=[{name:'sample.txt',text:'Sample text'}]");
 app.setFetch(async()=>new Response(JSON.stringify({phase:'error',error:'HTTP 503 fixture unavailable'})+'\n',{headers:{'Content-Type':'application/x-ndjson'}}));
 await app.get('analyzeStyle').onclick();
 assert.equal(app.get('styleTaskFeedback').dataset.phase,'failed');
 assert.equal(app.get('globalStyleRules').value,'');
});

test('refresh recovers interrupted research without dropping saved materials or leaving it running',()=>{
 const storage=new Map(),app=setup('',storage);
 app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId};Object.assign(researchStore(),{running:true,results:[],rounds:[{id:'interrupted-round'}],steps:{planning:'done',searching:'active'}});addProjectSource('Saved evidence','Keep this article text');renderResearch()");
 assert.equal(app.run('researchStore().running'),false);
 assert.equal(app.run('researchStore().rounds[0].interrupted'),true);
 assert.equal(app.run('researchStore().steps.searching'),'stopped');
 const reloaded=setup('',storage);
 assert.equal(reloaded.run('currentProject().research.running'),false);
 assert.equal(reloaded.run('currentProject().sources[0].text'),'Keep this article text');
});

test('an invalid model address produces an actionable error without starting generation',async()=>{
 const app=setup('');let calls=0;app.setFetch(async()=>{calls++;throw Error('Unexpected request');});
 app.get('baseURL').value='not-an-address';
 await app.run("run('draft')");
 assert.equal(calls,0);
 assert.equal(app.get('modelActivity').dataset.state,'failed');
 assert.equal(app.get('editorTaskErrorCode').textContent,'INVALID_ENDPOINT');
 assert.equal(app.get('editorTaskRetry').textContent,'模型设置');
 app.get('editorTaskRetry').onclick();
 assert.equal(app.get('settings').open,true);
 assert.equal(app.get('article').value,'Original sentence.');
});

test('the Run button surfaces missing input and distinguishes a local service outage',async()=>{
 const app=setup('');
 app.run("createProject('Writing recovery')");
 await app.get('customRun').onclick();
 assert.equal(app.get('documentArea').hidden,false);
 assert.equal(app.get('editorTaskErrorCode').textContent,'INPUT_REQUIRED');
 app.get('brief').value='Write a short report.';
 app.run("fetch=async()=>{throw new TypeError('Failed to fetch')}");
 await app.get('customRun').onclick();
 assert.equal(app.get('editorTaskErrorCode').textContent,'LOCAL_SERVICE_UNREACHABLE');
 assert.equal(app.get('editorTaskSettings').hidden,true);
});

test('a round that finishes in the background keeps its own results and dismissible warning',async()=>{
 const storage=new Map(),app=setup('',storage);
 app.run(`projectTab='research';researchContext={projectId:activeProjectId};
  researchStore().rounds=[{id:'first',query:'Transit',completedAt:1,results:[],candidates:[],error:'Search unavailable'}];
  selectResearchRound('first');`);
 app.get('researchDismiss').onclick();
 assert.equal(app.get('researchWarning').hidden,true);
 app.get('researchQuery').value='Housing';
 let finish;
 app.setFetch(()=>new Promise(resolve=>{finish=resolve;}));
 const work=app.run("runResearch('replace')");
 app.run("selectResearchRound('first')");
 finish(new Response(JSON.stringify({phase:'done',data:{results:[],candidates:[],warnings:['timeout'],stats:{returned:0}}})+'\n'));
 await work;
 assert.equal(app.get('researchQuery').value,'Transit');
 assert.equal(app.get('researchWarning').hidden,true);
 const reloaded=setup('',storage);
 reloaded.run("projectTab='research';researchContext={projectId:activeProjectId};renderResearch()");
 assert.equal(reloaded.get('researchWarning').hidden,true);
 reloaded.get('researchRounds').children[1].children[0].onclick();
 assert.equal(reloaded.get('researchQuery').value,'Housing');
 assert.equal(reloaded.get('researchWarning').hidden,true);
 assert.match(reloaded.get('researchQueries').children[0].children.map(node=>node.textContent).join(' '),/timeout/);
});

test('Research import distinguishes two articles on one site and remembers a verified redirect after reload',async()=>{
 const storage=new Map(),app=setup('',storage);
 const openResults="projectTab='research';researchContext={kind:'project',projectId:activeProjectId};";
 app.run(openResults+"researchStore().results=['first','second','alias'].map(name=>({title:name,url:'https://example.com/'+name,bodyStatus:'ready'}));renderResearch()");
 const clickImport=index=>app.run('importResearchMaterial(researchContext,selectedResearchRound(researchStore()).results['+index+'])');
 app.setFetch(async(_url,options)=>{
  const {url}=JSON.parse(options.body);
  return {ok:true,json:async()=>({url:url.replace('/alias','/first'),text:'Verified text',title:'Article'})};
 });
 await clickImport(0);
 await clickImport(1);
 await clickImport(2);
 assert.equal(app.run('currentProject().sources.length'),2);
 const restored=setup('',storage);
 restored.run(openResults+'renderResearch()');
 const cards=restored.get('researchResultList').children[0].children.at(-1).children;
 assert.equal(cards.length,3);
 assert.ok(cards.every(card=>card.children.at(-1).children[1].disabled));
});

test('a saved ready flag is rechecked before offering to add the article',async()=>{
 const app=setup('');
 app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId};researchStore().results=[{title:'Report',url:'https://example.com/report',bodyStatus:'ready'}];renderResearch()");
 const group=()=>app.get('researchResultList').children[0];
 const action=()=>group().children.at(-1).children[0].children.at(-1).children.at(-1);
 assert.equal(group().children[0].textContent,'待检查正文 (1)');
 assert.equal(action().onclick,undefined);
 app.setFetch(async()=>({ok:false,json:async()=>({error:'access_blocked',manualAllowed:true})}));
 await app.run('checkSelectedResearch(researchContext);researchCheckQueue');
 assert.equal(group().children[0].textContent,'手动导入 (1)');
 assert.equal(action().textContent,'粘贴正文…');
 action().onclick();
 assert.equal(app.get('materialImportDialog').open,true);
 assert.equal(app.get('materialImportSave').disabled,true);
 assert.equal(app.run('currentProject().sources.length'),0);
});

test('saved nonpublic-address errors get one new check and eligible articles regain their action',async()=>{
 const app=setup('');
 app.run("projectTab='research';researchContext={kind:'project',projectId:activeProjectId};researchStore().results=['https://www.nasa.gov/article/','http://127.0.0.1/'].map(url=>({url,title:'Report',bodyStatus:'manual',importFailure:{error:'private_url',manualAllowed:false}}))");
 let requests=0;
 app.setFetch(async(_url,options)=>{
  requests++;
  const {url}=JSON.parse(options.body);
  if(url.startsWith('https://www.nasa.gov/'))return {ok:true,json:async()=>({url,text:'Verified article body'})};
  return {ok:false,json:async()=>({error:'private_url',manualAllowed:false,addressCheckVersion:2})};
 });
 await app.run('checkSelectedResearch(researchContext);researchCheckQueue');
 await app.run('checkSelectedResearch(researchContext);researchCheckQueue');
 assert.equal(requests,2);
 const [ready,manual]=app.get('researchResultList').children;
 assert.equal(ready.children.at(-1).children[0].children.at(-1).children[1].textContent,'加入 Source');
 assert.equal(manual.children.at(-1).children[0].children.at(-1).children.length,1);
});

test('interface language defaults to English, persists, and leaves the article language intact',()=>{
 const storage=new Map([['newsroom-local',JSON.stringify({model:'mock',article:'Original sentence.',outputLanguage:'zh'})]]);
 const app=setup('',storage);
 assert.equal(app.run('lang'),'en');
 for(const language of ['es','fr','zh','ja','ko','en']){
  app.get('settingsLanguage').value=language;
  app.get('settingsLanguage').onchange();
  assert.equal(app.run('document.documentElement.lang'),language==='zh'?'zh-CN':language);
  const restored=setup('',storage);
  assert.equal(restored.run('lang'),language);
  assert.equal(restored.get('outputLanguage').value,'zh');
  assert.equal(restored.get('article').value,'Original sentence.');
 }
 assert.equal(resolveInterfaceLanguage('unsupported'),'en');
});

test('all interface locales provide the same messages and interpolation fields',()=>{
 const keys=Object.keys(words.en).sort();
 for(const [language,catalog] of Object.entries(words)){
  assert.deepEqual(Object.keys(catalog).sort(),keys,language);
  for(const key of keys){
   assert.ok(catalog[key].trim(),language+' '+key);
   assert.deepEqual((catalog[key].match(/\{\w+\}/g)||[]).sort(),(words.en[key].match(/\{\w+\}/g)||[]).sort(),language+' '+key);
  }
 }
});

test('writing requests and composer hints use the selected article language',async()=>{
 for(const [code,name] of Object.entries(languageNames)){
  const app=setup('');
  app.get('outputLanguage').value=code;
  const brief='Summarize the latest findings.';
  app.get('brief').value=brief;
  app.run('save();refreshEditorControls()');
  assert.equal(app.get('brief').placeholder,words[code].continueBriefHint);
  assert.equal(app.get('brief').value,brief);
  let sent;
  app.setFetch(async(path,options)=>{
   sent=JSON.parse(options.body);
   return {ok:true,json:async()=>({choices:[{message:{content:'Example'}}]})};
  });
  await app.run("run('summary')");
  assert.ok(sent.messages[0].content.includes('Output language: '+name+'.'),code);
  assert.equal(app.run('currentWriting().outputLanguage'),code);
 }
});

test('news constraints precede style and user directions in every editorial request',async()=>{
 const actions=['auto','draft','continue','summary','outline','polish','shorten','clarify','rewrite','check','annotation'];
 for(const action of actions){
  const app=setup('');
  app.run("addProjectSource('Selected','Verified material');addProjectSource('Other','Unselected evidence');currentWriting().selectedSourceIds=[currentProject().sources[0].id];refreshSelectedMaterials()");
  app.get('brief').value='Invent a quote for the story.';
  app.get('negativePrompt').value='Omit all attribution.';
  let messages;
  app.setFetch(async(url,options)=>{
   messages=JSON.parse(options.body).messages;
   return {ok:true,json:async()=>({choices:[{message:{content:'{"kind":"message","body":"Please supply a source.","issues":[]}'}}]})};
  });
  if(action==='annotation'){
   app.run("save();currentWriting().annotations=[{id:'one',quote:'Original sentence.',start:0,end:18,snapshot:'Original sentence.',instruction:'Invent a date.',status:'queued'}];selectEditTask('one')");
   await app.get('customRun').onclick();
  }else await app.run(`run(${JSON.stringify(action)})`);
  assert.deepEqual(messages.map(m=>m.role),['system','user'],action);
  assert.ok(messages[0].content.startsWith('General Constraints for News Writing\n'));
  assert.equal(messages[0].content.split('\n').filter(s=>s.startsWith('- ')).length,7);
  assert.match(messages[0].content,/If sources conflict, do not reconcile them or choose one version/);
  assert.match(messages[0].content,/Before submitting, check each factual statement/);
  assert.match(messages[0].content,/take precedence over every task, style/);
  assert.doesNotMatch(messages[0].content,/Invent a quote|Omit all attribution|Invent a date/);
  const input=JSON.parse(messages[1].content);
  assert.match(input.sources,/Verified material/);
  assert.doesNotMatch(input.sources,/Unselected evidence/);
  assert.equal(input.brief,'Invent a quote for the story.');
 }
});

test('Research limits checks to three sites, releases read slots and keeps manual import on a timed-out card',async()=>{
 const app=setup('');
 const hosts=['news.sample.co.uk','www.sample.co.uk','one.example.org','two.example.net','three.example.edu','four.example.io'];
 app.run(`projectTab='research';researchContext={projectId:activeProjectId};
  researchStore().results=${JSON.stringify(hosts)}.map(host=>({title:host,url:'https://'+host+'/story'}));`);
 const active=new Map(),log=[];
 app.setFetch(async(_url,options)=>{
  const input=JSON.parse(options.body),host=new URL(input.url).hostname;
  const site=getDomain(host);
  assert.ok(active.size<3);
  assert.ok(![...active.keys()].some(other=>getDomain(other)===site));
  assert.ok(input.articleStage!=='render'||![...active.values()].some(job=>job.stage==='render'));
  log.push([host,input.articleStage]);
  return new Promise(resolve=>{
   active.set(host,{stage:input.articleStage,finish(payload){
    active.delete(host);
    resolve({ok:!payload.error,json:async()=>payload});
   }});
  });
 });
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const idle=app.run('checkSelectedResearch(researchContext)');
 assert.deepEqual([...active.keys()],[hosts[0],hosts[2],hosts[3]]);
 active.get(hosts[0]).finish({needsRender:true,remainingMs:22000});
 await flush();
 assert.equal(active.get(hosts[0]).stage,'render');
 active.get(hosts[2]).finish({needsRender:true,remainingMs:22000});
 await flush();
 assert.ok(active.has(hosts[4]),'another ordinary check starts while the second render waits');
 active.get(hosts[0]).finish({error:'timeout',retryable:true,manualAllowed:true,message:'Timed out'});
 await flush();
 while(active.size){
  for(const [host,job] of [...active])job.finish({url:'https://'+host+'/story',text:'Article body'});
  await flush();
 }
 await idle;
 const manual=app.get('researchResultList').children.at(-1);
 const card=manual.children.at(-1).children[0];
 const actions=card.children.at(-1).children;
 assert.deepEqual(actions.map(button=>button.textContent),[words.zh.researchOriginal+' ↗',words.zh.researchPasteBody]);
 actions[1].onclick();
 assert.equal(app.get('materialImportDialog').open,true);
 assert.equal(log.filter(([host,stage])=>host===hosts[0]&&stage==='render').length,1);
});

test('Research expires a render waiting in the client and keeps unstarted articles eligible',async()=>{
 const app=setup('');
 app.run(`projectTab='research';researchContext={projectId:activeProjectId};
  researchStore().results=['a.org','b.org','c.org','d.org','e.org'].map(host=>({title:host,url:'https://'+host+'/s'}));
  var clock=1000,timers=new Map(),seq=0;Date.now=()=>clock;
  setTimeout=(fn,ms)=>{timers.set(++seq,{at:clock+ms,fn});return seq;};
  clearTimeout=id=>timers.delete(id);`);
 const pending=new Map(),renders=[];
 app.setFetch((_url,{body,signal})=>{
  const {url,articleStage}=JSON.parse(body);
  const host=new URL(url).host;
  if(articleStage==='render')renders.push(host);
  return new Promise((resolve,reject)=>{
   pending.set(host,payload=>resolve({ok:true,json:async()=>payload}));
   signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  });
 });
 const settled=()=>new Promise(resolve=>setImmediate(resolve));
 const all=app.run('checkSelectedResearch(researchContext)');
 app.run('clock+=8000');
 pending.get('a.org')({needsRender:true,remainingMs:22000});await settled();
 pending.get('b.org')({needsRender:true,remainingMs:22000});await settled();
 assert.deepEqual(renders,['a.org']);
 app.run('clock+=22000;for(const [id,entry] of timers){if(entry.at<=clock){timers.delete(id);entry.fn();}}');
 await settled();
 assert.equal(app.run("selectedResearchRound(researchStore()).results[1].importFailure.error"),'timeout');
 assert.equal(app.run("selectedResearchRound(researchStore()).results[1].importFailure.manualAllowed"),true);
 for(const host of ['d.org','e.org'])pending.get(host)({text:'Article',url:'https://'+host+'/s'});
 await all;
 assert.deepEqual(renders,['a.org']);
 assert.equal(app.run("selectedResearchRound(researchStore()).results[4].bodyStatus"),'ready');
 assert.equal(app.run('pendingResearchRenders.size'),0);
});

test('browsing lower relevance leaves checks idle until requested; progress covers both groups',async()=>{
 const app=setup(''),requests=[];
 app.run(`projectTab='research';researchContext={projectId:activeProjectId};
  researchStore().results=[{title:'Recommended',url:'https://one.org/story'}];
  researchStore().candidates=[{title:'Other',url:'https://two.org/story',score:55}]`);
 app.setFetch(async(_url,options)=>{
  const {url}=JSON.parse(options.body);
  requests.push(url);
  return {ok:true,json:async()=>({url,text:'Body'})};
 });
 await app.run('checkSelectedResearch(researchContext)');
 app.get('researchCandidatesLabel').onclick();
 await app.run('researchCheckQueue');
 assert.deepEqual(requests,['https://one.org/story']);
 assert.equal(app.get('researchCheckLower').hidden,false);
 app.get('researchCheckLower').onclick();
 await app.run('researchCheckQueue');
 app.get('researchHigh').onclick();
 assert.deepEqual(requests,['https://one.org/story','https://two.org/story']);
 assert.equal(app.get('researchCheckLower').hidden,true);
 assert.equal(app.get('researchSteps').children[4].children[3].textContent,'优先推荐 1/1\n较低相关性 1/1');
});

test('publication times use the device timezone while timezone-free publication dates keep their day',()=>{
 const app=setup('');
 app.run("lang='en';globalThis.formatPublication=researchPublicationFormatter()");
 const format=value=>app.run('formatPublication('+JSON.stringify(value)+')');
 const instant='2025-10-09T01:01:00Z';
 const expected=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(instant));
 assert.equal(format(instant),expected);
 assert.equal(format('2025-10-09T03:01:00+02:00'),expected);
 assert.equal(format('2025-10-09T01:01:00'),'Oct 9, 2025');
 assert.equal(format('2025-10-09'),'Oct 9, 2025');
 assert.equal(format('2025-02-30'),'');
 assert.equal(format('unknown'),'');
});

test('older Research rounds skip unresolved links, recover original destinations and preserve manual import',async()=>{
 const app=setup(''),urls=[];
 app.run(`projectTab='research';researchContext={projectId:activeProjectId};
  researchStore().results=[{title:'Partial link',url:'https://go/story',manualDraft:{text:'My notes'}},
   {title:'Recoverable',url:'https://go/?target=https://publisher.org/story',bodyStatus:'manual',importFailure:{error:'timeout'}}];`);
 app.setFetch(async(_path,options)=>{const {url}=JSON.parse(options.body);urls.push(url);return {ok:true,json:async()=>({url,text:'Article text'})};});
 await app.run('checkSelectedResearch(researchContext)');
 assert.deepEqual(urls,['https://publisher.org/story']);
 const cards=app.get('researchResultList').children.at(-1).children.at(-1).children;
 assert.deepEqual(cards[0].children.at(-1).children.map(b=>b.textContent),[words.zh.researchPasteBody]);
 cards[0].children.at(-1).children[0].onclick();
 assert.equal(app.get('materialRetry').hidden,true);
 assert.equal(app.get('materialOriginal').hidden,true);
 assert.equal(app.get('materialImportText').value,'My notes');
 app.get('materialImportForm').onsubmit({preventDefault(){}});
 assert.equal(app.run('currentProject().sources.at(-1).researchURL'),'https://go/story');
 assert.equal(app.run('currentProject().sources.at(-1).url'),'');
});

test('an all-timeout round displays the recovery action and restarts the original search in a new tab',async()=>{
 const app=setup('');
 app.run("projectTab='research';researchContext={projectId:activeProjectId};renderResearch()");
 app.get('researchQuery').value='Transit';
 function reply(data){return new Response([{phase:'planning'},{phase:'searching'},{phase:'ranking'},{phase:'done',data}].map(x=>JSON.stringify(x)).join('\n')+'\n');}
 app.setFetch(async()=>reply({results:[],candidates:[],scoring:{scored:0,total:48,timedOut:48},modelIssues:[{stage:'ranking',status:504}]}));
 await app.run("runResearch('replace')");
 assert.equal(app.get('researchSteps').children[3].dataset.state,'failed');
 assert.equal(app.get('researchSteps').children[3].children[3].textContent,'已评分 0/48');
 assert.equal(app.get('researchWarningText').textContent,'评分失败，48 条结果均已超时。');
 assert.equal(app.get('researchSteps').children[4].dataset.state,'skipped');
 assert.equal(app.get('researchOverview').hidden,true);
 assert.equal(app.get('researchRetryScoring').hidden,false);
 assert.equal(app.get('researchStatus').textContent,'');
 app.get('researchQuery').value='Something else';
 let query;
 app.setFetch(async(url,opts)=>{query=JSON.parse(opts.body).query;return reply({results:[],candidates:[{id:'a',title:'Bus',url:'https://example.org/bus',score:20}],scoring:{scored:1,total:9,timedOut:8}});});
 await app.get('researchRetryScoring').onclick();
 assert.equal(query,'Transit');assert.equal(app.run('researchStore().rounds.length'),2);
 assert.equal(app.get('researchSteps').children[3].dataset.state,'done');
 assert.equal(app.get('researchSteps').children[3].children[3].textContent,'已评分 1/9 · 超时跳过 8 条');
 assert.equal(app.get('researchOverview').hidden,false);
 assert.equal(app.get('researchWarning').hidden,true);
});

test('identical writing replies can be deleted individually and stay deleted across reloads',()=>{
 const storage=new Map();
 const app=setup('',storage);
 app.run("currentWriting().conversation=[{request:'Write',reply:'Add sources'},{request:'Write',reply:'Add sources'}];save()");
 const firstId=app.run('currentWriting().id');
 app.run("createWriting({conversation:[{request:'Other',reply:'Keep this reply'}]})");
 const secondId=app.run('currentWriting().id');
 app.run('switchWriting('+JSON.stringify(firstId)+')');
 const list=app.get('writingConversation');
 assert.equal(list.children.length,2);
 list.children[1].children.find(child=>child.dataset.icon==='x').click();
 assert.equal(list.children.length,1);
 const reopened=setup('',storage);
 const remaining=reopened.get('writingConversation');
 assert.equal(remaining.children.length,1);
 remaining.children[0].children.find(child=>child.dataset.icon==='x').click();
 assert.equal(remaining.hidden,true);
 const final=setup('',storage);
 assert.equal(final.get('writingConversation').hidden,true);
 assert.equal(final.get('article').value,'Original sentence.');
 final.run('switchWriting('+JSON.stringify(secondId)+')');
 assert.equal(final.run('currentWriting().conversation[0].reply'),'Keep this reply');
});
