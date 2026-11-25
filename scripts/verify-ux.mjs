// Exercise the real storage API in a disposable home, including a browser restart.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdtemp,mkdir,rm,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {decodeLibrary} from '../public/library-records.js';

const tmp=await mkdtemp(path.join(tmpdir(),'newsdesk-storage-ux-'));
process.env.NEWSDESK_DATA_DIR=path.join(tmp,'Documents','Newsdesk');
process.env.NEWSDESK_CONFIG_DIR=path.join(tmp,'config');
const {server}=await import('../server.mjs');
const nextDir=path.join(tmp,'destination');await mkdir(nextDir);
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const api=async action=>{
 const r=await fetch(base+'/api/library/'+action,{method:'POST',headers:{'X-Newsdesk-Library':'1'}});
 return r.json();
};
const read=async()=>decodeLibrary(new Map((await api('load')).rows));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function ready(){await page.locator('#homeStartWriting').getByText('Start writing').waitFor();}
 async function saved(){await page.evaluate(async()=>{await (await import('/library-client.js')).library.flush();});}
 const legacy={projects:[{id:'legacy',name:'Original project',sources:[{id:'s',text:'Interview notes',name:'Source'}],research:{rounds:[]}}],personalStyles:[{id:'style',name:'Wire',rules:'Attribute statements'}],lang:'en'};
 const context=page.context();
 await page.goto(base+'/icons/file-text.svg');
 await page.evaluate(data=>{localStorage.setItem('newsroom-local',JSON.stringify(data));localStorage.setItem('newsroom-api-keys','{"fixture":"secret-fixture"}');},legacy);
 await page.goto(base);await ready();await saved();
 assert.equal((await read()).projects[0].sources[0].text,'Interview notes');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('newsroom-local')).projects.length),1);
 const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.type());await d.accept();});
 async function create(name){await page.locator('#homeStartWriting').click();await page.locator('#newProjectName').fill(name);await page.locator('#newProjectName').press('Enter');await page.locator('#projectStartWriting').click();}
 async function write(text){await page.locator('#openDraftUpload').click();await page.locator('#startingDraft').fill(text);await page.locator('#editStartingDraft').click();await saved();}
 await create('First project');await write('Interview A');await page.locator('#addWritingTab').click();await write('Interview B');
 await page.locator('[data-view=home]:visible').first().click();await create('Second project');await write('Interview C');
 const state=await read();assert.equal(state.projects.length,3);
 assert.deepEqual(state.projects.find(p=>p.name==='First project').writings.map(w=>w.article),['Interview A','Interview B']);
 assert.equal(dialogs.length,0);
 assert.equal(await page.locator('#libraryProjectExport').count(),0);
 await page.route('**/api/library/save',r=>r.fulfill({status:500,json:{error:'io'}}));
 await page.locator('#article').fill('Unsaved interview');
 await page.locator('#editorSaveRetry').waitFor();
 assert.equal(await page.locator('#libraryProblem').isVisible(),false);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#editorSaveCopy').click();
 const recovery=JSON.parse(await readFile(await (await downloadPromise).path(),'utf8'));
 assert.equal(recovery.state.projects.find(p=>p.name==='Second project').writings[0].article,'Unsaved interview');
 assert.ok(!JSON.stringify(recovery).includes('secret-fixture'));
 await page.unroute('**/api/library/save');
 await page.locator('#editorSaveRetry').click();
 await page.locator('#editorSaveProblem').waitFor({state:'hidden'});
 assert.equal((await read()).projects.find(p=>p.name==='Second project').writings[0].article,'Unsaved interview');
 await page.locator('#article').fill('Interview C');await saved();
 await page.locator('#writingExport').click();
 const articleDownload=page.waitForEvent('download');await page.locator('#exportTxt').click();
 assert.match(await readFile(await (await articleDownload).path(),'utf8'),/Interview C/);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Settings',exact:true}).first().click();
 assert.equal(await page.locator('#libraryBackup').isVisible(),false);
 await page.locator('#libraryHistory').click();await page.locator('#libraryBackup').click();
 await page.locator('#libraryFeedback').getByText('Backup created.').waitFor();
 const backup=(await api('list')).names.find(n=>n.includes('-manual-'));assert.ok(backup);
 await page.locator('#settings form button').first().click();await page.locator('#article').fill('Updated C');await saved();
 await page.getByRole('button',{name:'Settings',exact:true}).first().click();await page.locator('#libraryHistory').click();
 await page.locator('#libraryBackups').getByRole('button',{name:/Manual/}).click();await ready();await saved();
 assert.equal((await read()).projects.find(p=>p.name==='Second project').writings[0].article,'Interview C');
 assert.ok((await api('list')).names.some(n=>n.includes('-restore-')));
 // Only the native system folder picker is substituted; the move and writes use real files.
 await page.route('**/api/library/choose',r=>r.fulfill({json:{directory:nextDir}}));
 await page.getByRole('button',{name:'Settings',exact:true}).first().click();await page.locator('#libraryMove').click();await page.locator('#libraryFeedback').getByText(/Using the new folder/).waitFor();
 assert.equal((await api('load')).file,path.join(await realpath(nextDir),'Newsdesk.newsdesk'));
 assert.equal(await page.locator('#libraryFile').textContent(),await realpath(nextDir));
 await context.close();
 const fresh=await browser.newPage();await fresh.goto(base);await fresh.locator('#homeStartWriting').getByText('Start writing').waitFor();
 await fresh.locator('#homeView').getByText('Second project',{exact:true}).first().click();await fresh.locator('#article').fill('Moved draft');await fresh.evaluate(async()=>{await (await import('/library-client.js')).library.flush();});
 assert.equal((await read()).projects.find(p=>p.name==='Second project').writings[0].article,'Moved draft');
 const {DatabaseSync}=await import('node:sqlite');const old=new DatabaseSync(path.join(process.env.NEWSDESK_DATA_DIR,'Newsdesk.newsdesk'),{readOnly:true});
 try{const original=decodeLibrary(new Map(old.prepare('SELECT k,v FROM records').all().map(x=>[x.k,x.v])));assert.equal(original.projects.find(p=>p.name==='Second project').writings[0].article,'Interview C');}finally{old.close();}
 assert.deepEqual(errors,[]);console.log('PASS: migration, two new projects, three drafts, failed save, recovery copy, retry, article export, backup, restore, directory switch, clean browser and original-file preservation.');
} finally {await browser.close();await new Promise(done=>server.close(done));await rm(tmp,{recursive:true,force:true});}
