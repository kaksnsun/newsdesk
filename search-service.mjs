import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';import {access,mkdir,stat,truncate} from 'node:fs/promises';import {createWriteStream} from 'node:fs';import net from 'node:net';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const catalog=JSON.parse(readFileSync(new URL('./search-engines.json',import.meta.url),'utf8'));
export class ManagedSearch {
 constructor({directory=process.env.NEWSDESK_SEARCH_DIR || path.join(root,'.runtime','search'),spawnProcess=spawn,fetcher=fetch}={}){this.directory=directory;this.spawnProcess=spawnProcess;this.fetcher=fetcher;this.state='stopped';this.child=null;this.url='';this.starting=null;this.stopping=false;this.restarts=0;this.restartTimer=null;this.message='';}
 status(){return {mode:'builtin',state:this.state,url:this.url,sourceFocus:'Sources in the current query language',message:this.message};}
 async ensure(){if(this.state==='ready'&&this.child)return this.url;if(this.starting)return this.starting;this.stopping=false;this.starting=this.startWorker().finally(()=>{this.starting=null;});return this.starting;}
 async startWorker(){const python=process.env.NEWSDESK_SEARCH_PYTHON||path.join(this.directory,'venv','bin','python'),settings=path.join(this.directory,'settings.yml');try{await access(python);await access(settings);}catch{this.state='not_installed';this.message='Run npm run setup:search to install built-in search.';throw Error(this.message);}
 this.state='starting';this.message='Starting built-in SearXNG…';const port=await new Promise((resolve,reject)=>{const probe=net.createServer();probe.on('error',reject);probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port));});});if(this.stopping)throw Error('Search is stopping');this.url=`http://127.0.0.1:${port}`;await mkdir(this.directory,{recursive:true});const logPath=path.join(this.directory,'service.log');try{if((await stat(logPath)).size>2_000_000)await truncate(logPath,0);}catch{}const log=createWriteStream(logPath,{flags:'a',mode:0o600});log.on('error',()=>{});
 const child=this.spawnProcess(python,['-u',path.join(root,'scripts','run-search.py'),'--port',String(port),'--parent',String(process.pid),'--settings',settings],{cwd:this.directory,env:{...process.env,SEARXNG_SETTINGS_PATH:settings},stdio:['ignore','pipe','pipe']});this.child=child;child.stdout?.pipe(log,{end:false});child.stderr?.pipe(log,{end:false});let exited=false;child.on('error',error=>{this.message='Could not start built-in search: '+error.message;});child.on('exit',()=>{exited=true;log.end();if(this.child!==child)return;this.child=null;if(this.stopping){this.state='stopped';return;}this.state='failed';this.message='Built-in search exited. Check its local service log.';if(this.restarts<3){const delay=1000*2**this.restarts++;this.restartTimer=setTimeout(()=>{this.restartTimer=null;if(!this.stopping)this.ensure().catch(()=>{});},delay);this.restartTimer.unref?.();}});
 const deadline=Date.now()+60000;while(Date.now()<deadline&&!exited&&!this.stopping){try{const r=await this.fetcher(this.url+'/config',{signal:AbortSignal.timeout(2000),redirect:'error'});if(r.ok){const config=await r.json();if(Array.isArray(config.engines)){
   const loaded=new Set(config.engines.map(engine=>engine.name));
   this.engineGroups={
    default:config.engines.filter(engine=>engine.enabled&&engine.categories?.some(category=>['general','news'].includes(category))).map(engine=>engine.name),
    topic:catalog.topic.filter(name=>loaded.has(name)),
    standby:catalog.standby.filter(name=>loaded.has(name))
   };
   this.state='ready';this.message='Built-in search ready';return this.url;}}}catch{}await new Promise(r=>setTimeout(r,300));}
 child.kill('SIGTERM');this.state=this.stopping?'stopped':'failed';this.message=this.stopping?'Search stopped':'Built-in search did not become ready within 60 seconds. See .runtime/search/service.log.';throw Error(this.message);}
 async restart(){await this.stop();this.restarts=0;return this.ensure();}
 async stop(){this.stopping=true;clearTimeout(this.restartTimer);this.restartTimer=null;const child=this.child;if(child){await new Promise(resolve=>{let finished=false;const done=()=>{if(finished)return;finished=true;clearTimeout(timer);resolve();};const timer=setTimeout(()=>{child.kill('SIGKILL');done();},4000);child.once('exit',done);child.kill('SIGTERM');});}this.child=null;this.state='stopped';this.url='';}
}
export const managedSearch=new ManagedSearch();
export async function resolveSearchInput(input){const external=String(input.searchURL||'').trim();if(external)return {...input,engineGroups:undefined,searchCategories:undefined,sourceFocus:'Sources in the current query language'};return {...input,searchURL:await managedSearch.ensure(),engineGroups:managedSearch.engineGroups,searchCategories:'general,news',sourceFocus:'Sources in the current query language'};}
