import {unzipSync,strFromU8} from 'fflate';
import mammoth from 'mammoth';
import {DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile as exec} from 'node:child_process';
import {promisify} from 'node:util';
import {parseHTML} from 'linkedom';
const execFile=promisify(exec);
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
export async function extractSource(input){
 const ext=String(input.name||'').split('.').pop().toLowerCase();
 const bytes=Buffer.from(input.data||'','base64');
 if(!bytes.length||bytes.length>20_000_000)throw Error('Choose a nonempty file under 20 MB.');
 let text='';
 if(['txt','md','csv','json'].includes(ext))text=bytes.toString('utf8');
 else if(ext==='docx')text=(await mammoth.extractRawText({buffer:bytes})).value;
 else if(ext==='pptx'){
  let total=0;const zip=unzipSync(bytes,{filter:file=>{total+=file.originalSize;if(total>40_000_000)throw Error('Expanded document is too large.');return /^ppt\/slides\/slide\d+\.xml$/.test(file.name);}});const slides=Object.keys(zip).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>Number(a.match(/slide(\d+)\.xml/)[1])-Number(b.match(/slide(\d+)\.xml/)[1]));
  for(const slide of slides){const {document}=parseHTML(strFromU8(zip[slide]));text+=[...document.querySelectorAll('a\\:t')].map(node=>node.textContent).join('\n')+'\n\n';}
 }else if(ext==='doc'||ext==='ppt'){
  const dir=await mkdtemp(join(tmpdir(),'newsroom-import-'));
  try{const path=join(dir,'document.'+ext);await writeFile(path,bytes);if(ext==='doc'){const result=await execFile('/usr/bin/textutil',['-convert','txt','-stdout',path],{timeout:60000,maxBuffer:8_000_000});text=result.stdout;}
  else{await execFile('soffice',['--headless','--convert-to','pptx','--outdir',dir,path],{timeout:90000,maxBuffer:1_000_000});return await extractSource({...input,name:'document.pptx',data:(await readFile(join(dir,'document.pptx'))).toString('base64')});}}
  finally{await rm(dir,{recursive:true,force:true});}
 }else if(ext==='pdf'){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false});const pdf=await loading.promise;
  try{
   if(pdf.numPages>60)throw Error('Import at most 60 PDF pages at a time.');
   for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    text+=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('')+'\n\n';
   }
   if(!text.trim())throw Error('This PDF has no selectable text. Paste its text or choose a text-based PDF.');
  }finally{await loading.destroy();}
 }else{
  throw Error('Unsupported file. Use TXT, Markdown, CSV, JSON, Word, a text-based PDF, or PowerPoint.');
 }
 if(!text.trim())throw Error('No text was found. Try a clearer document or paste its text.');
 return {text:text.trim(),fileType:ext,method:'text'};
}
