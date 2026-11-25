import {encodeLibrary,decodeLibrary} from './library-records.js';
export async function callLibrary(action,input={}) {
 const response=await fetch('/api/library/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Newsdesk-Library':'1'},body:JSON.stringify(input)});
 const result=await response.json();
 if(!response.ok)throw Error(result.error);
 return result;
}
export const library={
 state:{}, meta:{}, committed:new Map(), next:null, running:null, timer:0, phase:'saved', error:'',
 adopt(meta){this.meta=meta;this.committed=new Map(meta.rows);this.state=decodeLibrary(this.committed);delete meta.rows;},
 notify(phase,error=''){this.phase=phase;this.error=error;window.dispatchEvent(new Event('library-status'));},
 queue(snapshot){if(this.restoring)return;this.next=snapshot;if(!this.error)this.notify('librarySaving');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),160);},
 schedule(work){
  const task=(this.running||Promise.resolve()).catch(()=>{}).then(work);
  this.running=task;
  const clear=()=>{if(this.running===task)this.running=null;};
  task.then(clear,clear);
  return task;
 },
 flush(){
  clearTimeout(this.timer);
  return this.schedule(()=>this.drain());
 },
 async drain(){
  while(this.next){
   const snapshot=this.next;this.next=null;
   try{
    const rows=encodeLibrary(snapshot()),set=[...rows].filter(([k,v])=>v!==this.committed.get(k)),remove=[...this.committed.keys()].filter(k=>!rows.has(k));
    if(set.length||remove.length){
     this.meta=await callLibrary('save',{revision:this.meta.revision,stamp:this.meta.stamp,set,remove});
     this.committed=rows;
    }
   }catch(error){this.next ||= snapshot;this.notify('unsaved',error.message);throw error;}
  }
  this.notify('saved');
 },
 manage(action,input={}){
  return this.schedule(async()=>{
   await this.drain();
   this.meta={...this.meta,...await callLibrary(action,{revision:this.meta.revision,stamp:this.meta.stamp,...input})};
   if(action==='restore'){this.restoring=true;this.next=null;clearTimeout(this.timer);}
   window.dispatchEvent(new Event('library-status'));
  });
 }
};
