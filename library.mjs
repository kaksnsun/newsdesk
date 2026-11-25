import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {decodeLibrary} from './public/library-records.js';

const SQLite = process.versions.bun ? (await import('bun:sqlite')).Database : (await import('node:sqlite')).DatabaseSync;
const appId = 0x4e44534b, filename = 'Newsdesk.newsdesk';
const issue = (code, status = 409) => Object.assign(new Error(code), {status});
const exists = fs.existsSync;
function publishNewFile(temp, destination) {
 try { fs.linkSync(temp,destination); }
 catch (error) {
  if (!['EPERM','ENOTSUP','EOPNOTSUPP','EXDEV'].includes(error.code)) throw error;
  // Some removable volumes do not support hard links. Exclusive copy still protects existing data.
  fs.copyFileSync(temp,destination,fs.constants.COPYFILE_EXCL);
 }
}
function open(file, readonly = false) {
 if (!exists(file) || !fs.statSync(file).isFile()) throw issue('missing');
 return new SQLite(file, process.versions.bun ? (readonly ? {readonly:true} : {readwrite:true}) : {readOnly:readonly});
}
function verify(db, deep = false) {
 if (db.prepare('PRAGMA application_id').get().application_id !== appId ||
     db.prepare('PRAGMA user_version').get().user_version !== 1 ||
     db.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete') throw issue('incompatible');
 if (deep && db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw issue('damaged');
}
const entries = db => db.prepare('SELECT k,v FROM records').all().map(row => [row.k,row.v]);
const header = db => db.prepare('SELECT revision,saved,migrated FROM info').get();
function signature(file) {
 const st = fs.statSync(file,{bigint:true});
 return [st.dev, st.ino, st.size, st.mtimeNs].join('-');
}
export class Library {
 constructor({configDir=process.env.NEWSDESK_CONFIG_DIR || path.join(os.homedir(),'Library','Application Support','Newsdesk Library'),
              defaultDir=process.env.NEWSDESK_DATA_DIR || path.join(os.homedir(),'Documents','Newsdesk')}={}) {
  this.pointer=path.join(configDir,'location.json'); this.defaultDir=defaultDir;
 }
 point(file) {
  fs.mkdirSync(path.dirname(this.pointer),{recursive:true,mode:0o700});
  const temp=this.pointer+'.'+randomUUID();
  try {fs.writeFileSync(temp,JSON.stringify({file}),{mode:0o600,flag:'wx',flush:true});fs.renameSync(temp,this.pointer);}
  finally {fs.rmSync(temp,{force:true});}
 }
 location() {
  if (exists(this.pointer)) {
   const {file}=JSON.parse(fs.readFileSync(this.pointer,'utf8'));
   if (typeof file!=='string' || !path.isAbsolute(file)) throw issue('missing');
   return file;
  }
  fs.mkdirSync(this.defaultDir,{recursive:true,mode:0o700});
  const file=path.join(this.defaultDir,filename);
  if (!exists(file)) {
   const tmp=file+'.'+randomUUID();fs.closeSync(fs.openSync(tmp,'wx',0o600));
   try {
    const db=open(tmp);
    try {db.exec('PRAGMA application_id='+appId+'; PRAGMA user_version=1; CREATE TABLE records(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE info(revision TEXT NOT NULL,saved TEXT,migrated TEXT);');db.prepare('INSERT INTO info VALUES(?,NULL,NULL)').run(randomUUID());} finally {db.close();}
    try {publishNewFile(tmp,file);} catch(e){if(e.code!=='EEXIST')throw e;}
   } finally {fs.rmSync(tmp,{force:true});}
  }
  const db=open(file,true);try {verify(db,true);} finally {db.close();}
  this.point(file);return file;
 }
 info(db,file) {return {...header(db),file,stamp:signature(file)};}
 load() {
  const file=this.location(),db=open(file,true);
  try {db.exec('BEGIN');verify(db,true);const rows=entries(db);decodeLibrary(new Map(rows));const result={...this.info(db,file),rows};db.exec('COMMIT');return result;}
  finally {db.close();}
 }
 backups(file) {return path.join(path.dirname(file),'Newsdesk Backups');}
 list(file) {
  const dir=this.backups(file);return exists(dir)?fs.readdirSync(dir).filter(x=>/^Newsdesk-[0-9TZ.-]+-[a-z]+-[\da-f-]+\.newsdesk$/.test(x)).sort().reverse():[];
 }
 snapshot(db,file,reason) {
  // Caller holds BEGIN IMMEDIATE, before any edits; the main file uses DELETE journaling.
  const dir=this.backups(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const name='Newsdesk-'+new Date().toISOString().replaceAll(':','-')+'-'+reason+'-'+randomUUID()+'.newsdesk';
  const dest=path.join(dir,name);this.copy(file,dest);return name;
 }
 copy(source,dest) {
  const temp=dest+'.'+randomUUID();
  try {
   fs.copyFileSync(source,temp,fs.constants.COPYFILE_EXCL);fs.chmodSync(temp,0o600);
   const db=open(temp,true);try {verify(db,true);decodeLibrary(new Map(entries(db)));} finally {db.close();}
   publishNewFile(temp,dest);
  } finally {fs.rmSync(temp,{force:true});}
 }
 recoverBackup(source,directory) {
  if(!path.isAbsolute(source||'')||!source.endsWith('.newsdesk')||!path.isAbsolute(directory||''))throw issue('directory');
  const dest=path.join(fs.realpathSync(directory),filename);
  if(exists(dest))throw issue('destinationExists');
  this.copy(source,dest);
  this.point(dest);return this.load();
 }
 reconnect(directory) {
  if (!path.isAbsolute(directory || '')) throw issue('directory');
  const file=path.join(fs.realpathSync(directory),filename);
  const db=open(file,true);try {verify(db,true);decodeLibrary(new Map(entries(db)));} finally {db.close();}
  this.point(file);return this.load();
 }
 run(action,input) {
  const file=this.location(), db=open(file);
  try {
   verify(db);db.exec('PRAGMA busy_timeout=3000; BEGIN IMMEDIATE');
   const meta=header(db);
   if(input.revision!==meta.revision || input.stamp!==signature(file) || this.location()!==file)throw issue('conflict');
   let result={};
   if(action==='save') {
    const {set,remove}=input;
    if(!Array.isArray(set)||!Array.isArray(remove))throw issue('invalid',400);
    if(meta.saved && !this.list(file).some(x=>x.startsWith('Newsdesk-'+new Date().toISOString().slice(0,10)) && x.includes('-daily-')))this.snapshot(db,file,'daily');
    const del=db.prepare('DELETE FROM records WHERE k=?'), put=db.prepare('INSERT OR REPLACE INTO records VALUES(?,?)');
    for(const key of remove)del.run(key);
    for(const [key,value] of set){if(typeof key!=='string'||typeof value!=='string')throw issue('invalid',400);JSON.parse(value);put.run(key,value);}
    if(input.migrated){const check=new Map(entries(db));decodeLibrary(check);for(const [k,v] of set)if(check.get(k)!==v)throw issue('damaged');}
    db.prepare('UPDATE info SET revision=?,saved=?,migrated=COALESCE(?,migrated)').run(randomUUID(),new Date().toISOString(),input.migrated || null);
   } else if(action==='backup') {
    result.name=this.snapshot(db,file,'manual');
   } else if(action==='restore') {
    if(!this.list(file).includes(input.name))throw issue('missing');
    const backup=open(path.join(this.backups(file),input.name),true);
    let rows;try{verify(backup,true);rows=entries(backup);decodeLibrary(new Map(rows));}finally{backup.close();}
    this.snapshot(db,file,'restore');db.exec('DELETE FROM records');
    const put=db.prepare('INSERT INTO records VALUES(?,?)');for(const row of rows)put.run(...row);
    db.prepare('UPDATE info SET revision=?,saved=?').run(randomUUID(),new Date().toISOString());
   } else if(action==='move') {
    if(!path.isAbsolute(input.directory||''))throw issue('directory');
    const dest=path.join(fs.realpathSync(input.directory),filename);
    if(exists(dest))throw issue('destinationExists');
    this.copy(file,dest); this.point(dest); db.exec('COMMIT');
    const moved=open(dest,true);try{return this.info(moved,dest);}finally{moved.close();}
   } else throw issue('invalid',400);
   db.exec('COMMIT');return {...this.info(db,file),...result};
  } catch(error){try{db.exec('ROLLBACK');}catch{}throw error;} finally {db.close();}
 }
}
