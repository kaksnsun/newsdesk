import {library,callLibrary} from './library-client.js';
import {encodeLibrary} from './library-records.js';
import {words,resolveInterfaceLanguage} from './locales/index.js';
const $=id=>document.getElementById(id);
let language=resolveInterfaceLanguage(navigator.language.split('-')[0]);
const t=key=>words[language][key]||words.en[key]||key;
async function choose(file=false){
 const r=await callLibrary(file?'chooseBackup':'choose');
 return r.manual?prompt(t(file?'libraryBackupFile':'libraryDirectory')):r.directory;
}
async function start(){
 let meta=await callLibrary('load');
 let raw;try{raw=localStorage.getItem('newsroom-local');}catch{}
 if(raw){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),v=>v.toString(16).padStart(2,'0')).join('');
  if(meta.migrated!==hash && localStorage.getItem('newsdesk-library-reviewed')!==hash){
   const old=JSON.parse(raw);
   if(!old||typeof old!=='object'||Array.isArray(old))throw Error('incompatible');
   language=resolveInterfaceLanguage(old.lang);
   const meaningful=old.projects?.length||old.personalStyles?.length||old.article||old.materials;
   if(!meta.rows.length || (meaningful && confirm(t('libraryMigrationConflict')))){
    // Only fields written by the v0.6 application may enter a shareable library.
    const keys=['lang','personalStyles','projects','activeProjectId','markdownMode','outputLanguage','reference','materials','style','styleRules','negativePrompt','brief','title','article','baseURL','model'];
    const state=Object.fromEntries(keys.filter(k=>k in old).map(k=>[k,old[k]]));
    const prefs=['theme','wallpaper','glass-transparency','styles-view','project-view','project-sort','search-url','search-external','timings'];
    state.preferences=Object.fromEntries(prefs.map(k=>'newsroom-'+k).map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null));
    state.purgedPresetKeys=JSON.parse(localStorage.getItem('newsroom-purged-presets')||'[]');
    const rows=encodeLibrary(state);
    if(meta.rows.length)await callLibrary('backup',{revision:meta.revision,stamp:meta.stamp});
    await callLibrary('save',{revision:meta.revision,stamp:meta.stamp,set:[...rows],remove:meta.rows.map(([k])=>k).filter(k=>!rows.has(k)),migrated:hash});
    meta=await callLibrary('load');
    const restored=new Map(meta.rows);
    if(restored.size!==rows.size||[...rows].some(([k,v])=>v!==restored.get(k)))throw Error('damaged');
   }
   localStorage.setItem('newsdesk-library-reviewed',hash);
  }
 }
 library.adopt(meta);
 await import('./app.js');
}
start().catch(error=>{
 const dialog=$('libraryRecovery');dialog.querySelector('h2').textContent=t('libraryOpenFailed');
 const msg=dialog.querySelector('p');msg.textContent=t('libErr_'+error.message)===('libErr_'+error.message)?t('libErr_io'):t('libErr_'+error.message);
 const [retry,locate,recover]=dialog.querySelectorAll('button');
 retry.textContent=t('libraryRetry');retry.onclick=()=>location.reload();
 locate.textContent=t('libraryReconnect');locate.onclick=async()=>{try{const directory=await choose();if(directory){await callLibrary('reconnect',{directory});location.reload();}}catch{msg.textContent=t('libErr_incompatible');}};
 recover.textContent=t('libraryRecoverBackup');
 recover.onclick=async()=>{try{
  const source=await choose(true);if(!source)return;
  msg.textContent=t('librarySelectEmpty');if(!confirm(t('librarySelectEmpty')))return;
  const directory=await choose();if(!directory)return;
  await callLibrary('recoverBackup',{source,directory});location.reload();
 }catch(e){msg.textContent=words[language]['libErr_'+e.message]||t('libErr_io');}};
 dialog.oncancel=e=>e.preventDefault();dialog.showModal();
});
