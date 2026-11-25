import http from 'node:http';
import {libraryAPI} from './library-api.mjs';
import {managedSearch,resolveSearchInput} from './search-service.mjs';
import {extractSource} from './source-import.mjs';
import { generate } from './generation.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readWebsiteAssisted,streamWebsiteAssisted } from './website-ai.mjs';
import {probeModelConnection,diagnoseResearchModel,streamResearch,testSearchConnection} from './research.mjs';

export function endpoint(base, path) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) base URL without embedded credentials.');
  const basePath = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
  url.pathname = `${basePath}/${path}`;
  url.search = ''; url.hash = '';
  return url;
}
const root = fileURLToPath(new URL('./public/', import.meta.url));
export const server = http.createServer(async (req, res) => {
  const json = (status, data) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
  try {
    if(req.url.startsWith('/api/library/'))return await libraryAPI(req,res);
    if(req.url==='/api/search-status'&&req.method==='GET')return json(200,managedSearch.status());
    if (req.url.startsWith('/api/')) {
      if (req.method !== 'POST') return json(405, {error:'POST required'});
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, {error:'Origin rejected'});
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > (req.url === '/api/import-source' ? 30_000_000 : 5_000_000)) return json(413, {error:'Request too large'}); }
      const input = JSON.parse(body);
      if(req.url === '/api/research'){try{return await streamResearch(await resolveSearchInput(input),res,endpoint);}catch(error){return json(503,{error:error.message});}}
      if(req.url === '/api/model-status'){
        const controller=new AbortController();
        const disconnect=()=>{if(!res.writableEnded)controller.abort();};
        res.on('close',disconnect);
        try{const result=await probeModelConnection(input,{endpoint,signal:controller.signal});if(!res.destroyed)return json(200,result);return;}
        finally{res.off('close',disconnect);}
      }
      if(req.url === '/api/research-diagnose'){
        const controller=new AbortController();
        const disconnect=()=>{if(!res.writableEnded)controller.abort();};
        res.on('close',disconnect);
        try{
          const result=await diagnoseResearchModel(input,{endpoint,signal:controller.signal});
          if(!res.destroyed)return json(200,result);
          return;
        }finally{res.off('close',disconnect);}
      }
      if(req.url === '/api/search-restart'){try{await managedSearch.restart();return json(200,managedSearch.status());}catch(error){return json(503,{error:error.message});}}
      if(req.url === '/api/search-test'){try{return json(200,await testSearchConnection(await resolveSearchInput(input)));}catch(error){return json(422,{error:error.message});}}
      if(req.url === '/api/import-source'){try{return json(200,await extractSource(input));}catch(error){return json(422,{error:error.message});}}
      if (req.url === '/api/website') {
        if(input.stream)return await streamWebsiteAssisted(input,res,{endpoint});
        try { const result=await readWebsiteAssisted(input,{endpoint});return result.failure?json(422,result.failure):json(200,result); }
        catch(error) { return json(422, {error:error.code || 'fetch_failed'}); }
      }
      if(req.url === '/api/generate' && input.stream) return await generate(input,res,endpoint);
      const {baseURL, apiKey, model, messages} = input;
      const models = req.url === '/api/models';
      if (!models && req.url !== '/api/generate') return json(404, {error:'Not found'});
      const upstream = await fetch(endpoint(baseURL, models ? 'models' : 'chat/completions'), {
        method:models ? 'GET' : 'POST',
        headers:{'Content-Type':'application/json', ...(apiKey ? {Authorization:`Bearer ${apiKey}`} : {})},
        ...(models ? {} : {body:JSON.stringify({model,messages,stream:false,temperature:0.3})}),
        signal:AbortSignal.timeout(180_000)
      });
      const data = await upstream.json().catch(() => ({error:{message:`HTTP ${upstream.status}`}}));
      return json(upstream.ok ? 200 : 502, upstream.ok ? data : {error:data.error?.message || `HTTP ${upstream.status}`});
    }
    const files = {'/library-start.js':'library-start.js','/library-client.js':'library-client.js','/library-records.js':'library-records.js','/vendor/tldts.js':'../node_modules/tldts/dist/index.esm.min.js','/research-model.js':'research-model.js','/research.css':'research.css','/':'index.html','/app.js':'app.js','/markdown.js':'markdown.js','/vendor/marked.js':'../node_modules/marked/lib/marked.esm.js','/style.css':'style.css','/workspace.css':'workspace.css','/writing.css':'writing.css','/alpine.css':'alpine.css','/liquid.css':'liquid.css','/themes.css':'themes.css','/polish.css':'polish.css','/editor-comments.css':'editor-comments.css','/glass-select.js':'glass-select.js','/assets/wallpaper-coast.jpg':'assets/wallpaper-coast.jpg','/assets/wallpaper-dunes.jpg':'assets/wallpaper-dunes.jpg','/assets/wallpaper-peaks.jpg':'assets/wallpaper-peaks.jpg','/assets/wallpaper-lake.jpg':'assets/wallpaper-lake.jpg','/assets/wallpaper-sunset.jpg':'assets/wallpaper-sunset.jpg','/assets/alpine-wallpaper.jpg':'assets/alpine-wallpaper.jpg','/writing-model.js':'writing-model.js'};
    const pathname=req.url?.split('?')[0];
    const icon=pathname?.match(/^\/icons\/(home|folder|palette|files|search|settings|plus|file-text|notebook|eye|arrow-up-right|upload|link|shield-check|arrow-right|clock|layout-dashboard|trash|restore|pencil|download|arrow-back-up|arrow-forward-up|x|check|chevron-down|copy|refresh|player-stop|send|chevron-left|adjustments-horizontal)\.svg$/);
    const locale = pathname?.match(/^\/locales\/(index|en|es|fr|zh|ja|ko)\.js$/);
    const file = locale ? 'locales/'+locale[1]+'.js' : icon ? 'icons/'+icon[1]+'.svg' : files[pathname];
    if (!file) {res.writeHead(404);return res.end('Not found');}
    res.writeHead(200, {'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.jpg')?'image/jpeg':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(await readFile(root + file));
  } catch (error) { json(500, {error:error.name === 'TimeoutError' ? 'Model timed out after 180 seconds' : error.message}); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 managedSearch.ensure().catch(error=>console.error('Search:',error.message));
 let stopping=false;const shutdown=async()=>{if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),6000);timer.unref();server.close();await managedSearch.stop();process.exit(0);};
 process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
 process.once('exit',()=>managedSearch.child?.kill('SIGTERM'));
 server.on('error',error=>{console.error(error.message);shutdown();});
 server.listen(Number(process.env.PORT || 43219), '127.0.0.1', () => console.log(`Newsroom Local: http://127.0.0.1:${process.env.PORT || 43219}`));

}
