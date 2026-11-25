import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import path from 'node:path';import {randomBytes} from 'node:crypto';import os from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=path.join(root,'.runtime','search');
const lock=JSON.parse(await readFile(path.join(root,'search-runtime.lock.json'),'utf8'));
async function exists(p){try{await access(p);return true}catch{return false}}
const uv=process.env.SEARCH_UV||path.join(os.homedir(),'.local','bin','uv');
if(!await exists(uv))throw Error('uv is required. Install uv from https://docs.astral.sh/uv/getting-started/installation/ or set SEARCH_UV to its executable.');
await mkdir(runtime,{recursive:true});
const env={...process.env,UV_PYTHON_INSTALL_DIR:path.join(runtime,'python')};
function run(cmd,args,options={}){return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{cwd:root,env,stdio:'inherit',...options});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Search setup command failed (${code})`)));});}
const source=path.join(runtime,'searxng-'+lock.commit),python=path.join(runtime,'venv','bin','python');
if(!await exists(source)){console.log('Downloading pinned SearXNG source…');const response=await fetch(`https://codeload.github.com/searxng/searxng/tar.gz/${lock.commit}`);if(!response.ok)throw Error('Could not download SearXNG: HTTP '+response.status);const archive=path.join(runtime,'source.tar.gz');await writeFile(archive,new Uint8Array(await response.arrayBuffer()));await run('tar',['-xzf',archive,'-C',runtime]);}
if(!await exists(python))await run(uv,['venv','--clear','--python',lock.python,path.join(runtime,'venv')]);
await run(uv,['pip','install','--python',python,'setuptools','wheel','pyyaml','msgspec','typing-extensions','pybind11']);
const settings=path.join(runtime,'settings.yml');if(!await exists(settings))await writeFile(settings,`use_default_settings: true\ngeneral:\n  debug: false\n  instance_name: Newsdesk Search\nsearch:\n  default_lang: en-US\n  formats: [json]\n  safe_search: 1\nserver:\n  secret_key: ${randomBytes(32).toString('hex')}\n  bind_address: 127.0.0.1\n  limiter: false\n  image_proxy: false\n  public_instance: false\noutgoing:\n  request_timeout: 12.0\n  max_request_timeout: 18.0\n`,{mode:0o600});
await run(python,[path.join(root,'scripts','search_settings.py'),settings]);
await run(uv,['pip','install','--python',python,'--no-build-isolation','-e',source,`waitress==${lock.waitress}`],{env:{...env,SEARXNG_SETTINGS_PATH:settings}});
await writeFile(path.join(runtime,'installed.json'),JSON.stringify({...lock,installedAt:new Date().toISOString()},null,2));
console.log('Built-in search installed. Start the app with npm start.');
