import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname} from 'node:path';
import {Library} from './library.mjs';
const exec=promisify(execFile);
const library=new Library();
async function choosePath(file=false) {
 if(process.platform!=='darwin')return {manual:true};
 try{
  const {stdout}=await exec('/usr/bin/osascript',['-e',file?'POSIX path of (choose file)':'POSIX path of (choose folder)']);
  return {directory:stdout.trimEnd()};
 }catch(error){if(error.stderr?.includes('(-128)'))return {};throw error;}
}
export async function libraryAPI(req,res){
 const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const origin='http://'+req.headers.host;
 if(req.method!=='POST'||!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)||
    req.headers['x-newsdesk-library']!=='1'||(req.headers.origin && req.headers.origin!==origin))return reply(403,{error:'forbidden'});
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>256*1024*1024)return reply(413,{error:'tooLarge'});chunks.push(chunk);}
  const input=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  const action=req.url.slice('/api/library/'.length);
  let result;
  if(action==='load')result=library.load();
  else if(action==='list')result={names:library.list(library.location())};
  else if(action==='choose'||action==='chooseBackup')result=await choosePath(action==='chooseBackup');
  else if(action==='recoverBackup')result=library.recoverBackup(input.source,input.directory);
  else if(action==='reconnect')result=library.reconnect(input.directory);
  else if(action==='reveal'){const dir=dirname(library.location());await exec(process.platform==='darwin'?'/usr/bin/open':'xdg-open',[dir]);result={};}
  else result=library.run(action,input);
  reply(200,result);
 }catch(e){reply(e.status||500,{error:e.status?e.message:({ENOENT:'missing',EEXIST:'destinationExists',EACCES:'permission',EPERM:'permission',ENOSPC:'space',SQLITE_NOTADB:'damaged',SQLITE_CORRUPT:'damaged',SQLITE_FULL:'space',SQLITE_READONLY:'permission'}[e.code]||'io')});}
}
