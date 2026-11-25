import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Library} from '../library.mjs';
import {encodeLibrary,decodeLibrary} from '../public/library-records.js';

function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'newsdesk-library-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const options={configDir:path.join(dir,'config'),defaultDir:path.join(dir,'data')};
 const lib=new Library(options), init=lib.load();
 const state={projects:[{id:'p',name:'Interview',writings:[{id:'w',article:'First draft'}],sources:[{id:'s',text:'Interview notes'}],research:{rounds:[{query:'News'}]}}],personalStyles:[{id:'style',rules:'Clear'}]};
 const saved=lib.run('save',{...init,set:[...encodeLibrary(state)],remove:[],migrated:'legacy-hash'});
 return {dir,options,lib,saved,state};
}
test('one versioned library round-trips all collections, with stable rows for independent edits',t=>{
 const {lib,saved,state,options}=setup(t);
 const before=new Map(lib.load().rows);assert.deepEqual(decodeLibrary(before),state);
 state.projects[0].writings[0].article='Second draft';
 const delta=[...encodeLibrary(state)].filter(([key,val])=>before.get(key)!==val);
 assert.deepEqual(delta.map(([key])=>key),['root/projects/p/writings/w']);
 lib.run('save',{...saved,set:delta,remove:[]});
 assert.deepEqual(decodeLibrary(new Map(new Library(options).load().rows)),state);
 assert.throws(()=>lib.run('save',{...saved,set:[],remove:[]}),/conflict/);
 assert.equal(fs.readFileSync(saved.file).subarray(0,15).toString(),'SQLite format 3');
});
test('verified move keeps original, refuses collisions and follows new location on restart',t=>{
 const {lib,saved,state,dir,options}=setup(t),dest=path.join(dir,'new');fs.mkdirSync(dest);
 fs.writeFileSync(path.join(dest,'Newsdesk.newsdesk'),'occupied');
 assert.throws(()=>lib.run('move',{...saved,directory:dest}),/destinationExists/);
 assert.equal(lib.load().file,saved.file);fs.unlinkSync(path.join(dest,'Newsdesk.newsdesk'));
 const moved=lib.run('move',{...saved,directory:dest});
 assert.equal(new Library(options).load().file,moved.file);
 state.projects[0].name='Moved';lib.run('save',{...moved,set:[...encodeLibrary(state)],remove:[]});
 assert.equal(decodeLibrary(new Map(lib.reconnect(path.dirname(saved.file)).rows)).projects[0].name,'Interview');
});
test('restore keeps a safety backup, detects corrupted backups and missing or externally modified library',t=>{
 const {lib,saved,state}=setup(t);
 const {name}=lib.run('backup',saved);state.projects=[];const rows=encodeLibrary(state);
 const changed=lib.run('save',{...saved,set:[...rows],remove:lib.load().rows.map(([k])=>k).filter(k=>!rows.has(k))});
 const restored=lib.run('restore',{...changed,name});
 assert.equal(decodeLibrary(new Map(lib.load().rows)).projects.length,1);
 assert.ok(lib.list(saved.file).some(n=>n.includes('-restore-')));assert.ok(lib.list(saved.file).some(n=>n.includes('-daily-')));
 fs.writeFileSync(path.join(lib.backups(saved.file),name),'damaged');
 assert.throws(()=>lib.run('restore',{...restored,name}));assert.equal(lib.load().revision,restored.revision);
 fs.utimesSync(saved.file,1,1);assert.throws(()=>lib.run('save',{...restored,set:[],remove:[]}),/conflict/);
 fs.unlinkSync(saved.file);assert.throws(()=>lib.load(),/missing/);assert.equal(fs.existsSync(saved.file),false);
});
test('a partial write rolls back and recovery reconnects a verified backup in a fresh directory',t=>{
 const {lib,dir,state}=setup(t);
 const before=lib.load();
 const backup=lib.run('backup',before).name;
 assert.throws(()=>lib.run('save',{...before,remove:['root'],set:[['partial','{}'],['broken','incomplete JSON']]}));
 assert.deepEqual(decodeLibrary(new Map(lib.load().rows)),state);
 const backupFile=path.join(lib.backups(before.file),backup);
 fs.writeFileSync(before.file,'damaged original');
 assert.throws(()=>lib.load());
 const destination=path.join(dir,'recovered');fs.mkdirSync(destination);
 const restored=lib.recoverBackup(backupFile,destination);
 assert.deepEqual(decodeLibrary(new Map(restored.rows)),state);
 assert.equal(fs.readFileSync(before.file,'utf8'),'damaged original');
 assert.throws(()=>lib.recoverBackup(backupFile,destination),/destinationExists/);
});
