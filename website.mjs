import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {Readability} from '@mozilla/readability';
import {parseHTML} from 'linkedom';

export class WebsiteError extends Error { constructor(code,details={}){super(code);this.code=code;Object.assign(this,details);} }
export function publicAddress(address){
 if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&(c===0||c===2))))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));}
 if(isIP(address)===6){const first=parseInt(address.split(':')[0],16);return first>=0x2000&&first<=0x3fff&&!address.toLowerCase().startsWith('2001:db8:');}return false;
}
export function websiteURL(value){let url;try{url=new URL(value)}catch{throw new WebsiteError('invalid_url')};if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port)))throw new WebsiteError('invalid_url');url.hash='';return url;}
export async function resolvePublicAddresses(url){
 const hostname=url.hostname.replace(/^\[|\]$/g,'');
 const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await lookup(hostname,{all:true});
 if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw new WebsiteError('private_url');
 return addresses;
}
export async function pageRequest(url,signal,{resource=false}={}){
 const addresses=await resolvePublicAddresses(url);
 return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).get(url,{signal,headers:{'User-Agent':'NewsroomLocal/1.0','Accept':'text/html,text/plain;q=0.8','Accept-Encoding':'identity'},lookup:(host,options,callback)=>options.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family)},response=>{
   if([301,302,303,307,308].includes(response.statusCode)){response.resume();return resolve({redirect:response.headers.location});}
   if(response.statusCode!==200){response.resume();return reject(new WebsiteError('http_error',{status:response.statusCode,retryAfter:response.headers['retry-after']}));}
   const contentType=response.headers['content-type']||'';
   if(!resource&&!/text\/(html|plain)|application\/xhtml\+xml/i.test(contentType)){response.resume();return reject(new WebsiteError('unsupported_type'));}
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>3_000_000){response.destroy(new WebsiteError('too_large'));return}chunks.push(chunk)});
   response.on('error',reject);response.on('end',()=>{try{const bytes=decodePageBytes(Buffer.concat(chunks),response.headers['content-encoding']);resolve({bytes,contentType});}catch(error){reject(error);}});
  });request.on('error',reject);
 });
}
export function decodePageBytes(bytes,encoding){
 try{const codecs={gzip:gunzipSync,deflate:inflateSync,br:brotliDecompressSync};if(encoding&&encoding!=='identity'){const decode=codecs[String(encoding).toLowerCase()];if(!decode)throw new WebsiteError('unsupported_encoding');return decode(bytes,{maxOutputLength:3_000_000});}return bytes;}
 catch(error){throw error instanceof WebsiteError?error:new WebsiteError(error.code==='ERR_BUFFER_TOO_LARGE'?'too_large':'decode_failed');}
}
export function pageEvidence(html,url){
 const {document}=parseHTML(html);const title=document.querySelector('title')?.textContent?.trim()||new URL(url).hostname;
 document.querySelectorAll('script,style,noscript,iframe,nav,footer,header,form').forEach(node=>node.remove());
 return {pageText:(document.body?.textContent||'').replace(/\s+/g,' ').trim().slice(0,60000),pageTitle:title,pageURL:url};
}
export function blockedPage(html){
 const {document}=parseHTML(html);const title=document.querySelector('title')?.textContent||'';
 const heading=document.querySelector('h1')?.textContent.trim();
 if(/^request access$/i.test(heading)&&document.querySelector('form[action="/unblock"] .g-recaptcha'))return true;
 const text=(document.body?.textContent||'').replace(/\s+/g,' ').trim();
 return text.length<3000&&(/^(just a moment|access denied|verify you are human|security check)/i.test(title)||/please enable js and disable any ad blocker|verify (that )?you are human|checking your browser|enable javascript and cookies to continue/i.test(text));
}
export function structuredArticle(html,url){
 const {document}=parseHTML(html);let best;
 const visit=(value,depth=0)=>{if(!value||typeof value!=='object'||depth>12)return;if(Array.isArray(value)){value.forEach(v=>visit(v,depth+1));return;}if(typeof value.articleBody==='string'&&/Article|Report|Posting/i.test(String(value['@type']||''))){const body=parseHTML('<html><body>'+value.articleBody+'</body></html>').document;body.querySelectorAll('script,style').forEach(n=>n.remove());const text=(body.body.textContent||'').trim();if(text.length>=80&&(!best||text.length>best.text.length))best={title:String(value.headline||document.querySelector('title')?.textContent||new URL(url).hostname),text,url,siteName:new URL(url).hostname,publishedTime:String(value.datePublished||''),extractionMethod:'structured-data'};}for(const child of Object.values(value))if(typeof child==='object')visit(child,depth+1);};
 for(const node of document.querySelectorAll('script[type="application/ld+json"]'))try{visit(JSON.parse(node.textContent));}catch{}
 return best;
}
export function extractWebsite(html,url){
 if(blockedPage(html))throw new WebsiteError('access_blocked');
 const structured=structuredArticle(html,url);if(structured)return structured;
 const {document}=parseHTML(html);const originalTitle=document.querySelector('title')?.textContent?.trim();
 const article=new Readability(document,{charThreshold:100,maxElemsToParse:40000}).parse();
 if(!article?.content)throw new WebsiteError('no_content');
 const {document:body}=parseHTML(`<html><body>${article.content}</body></html>`);
 body.querySelectorAll('script,style,noscript,iframe').forEach(node=>node.remove());
 body.querySelectorAll('p,div,section,h1,h2,h3,h4,li,br,blockquote').forEach(node=>{node.appendChild(body.createTextNode('\n\n'))});
 const text=body.body.textContent.replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 if(text.length<80)throw new WebsiteError('no_content');
 return {title:article.title||originalTitle||new URL(url).hostname,text,url,siteName:article.siteName||new URL(url).hostname,byline:article.byline||'',publishedTime:article.publishedTime||''};
}
export async function readWebsite(value,{request=pageRequest,signal:externalSignal}={}){
 let url=websiteURL(value);const timeout=AbortSignal.timeout(20000),signal=externalSignal?AbortSignal.any([externalSignal,timeout]):timeout;
 try{for(let redirects=0;redirects<=5;redirects++){
  const result=await request(url,signal);
  if(result.redirect){url=websiteURL(new URL(result.redirect,url).href);continue}
  const declared=result.contentType.match(/charset=["']?([^\s;"']+)/i)?.[1]||result.bytes.subarray(0,3000).toString().match(/charset=["']?([^\s;"'>]+)/i)?.[1]||'utf-8';
  let text;try{text=new TextDecoder(declared).decode(result.bytes)}catch{text=result.bytes.toString('utf8')}
  if(/text\/plain/i.test(result.contentType)){if(text.trim().length<80)throw new WebsiteError('no_content');return {title:url.hostname,text:text.trim(),url:url.href,siteName:url.hostname}}
  try{return extractWebsite(text,url.href);}catch(cause){const error=cause instanceof WebsiteError?cause:new WebsiteError('no_content');if(error.code==='no_content')Object.assign(error,pageEvidence(text,url.href),{pageHTML:text});throw error;}
 }throw new WebsiteError('too_many_redirects');}catch(error){if(externalSignal?.aborted)throw externalSignal.reason;if(signal.aborted)throw new WebsiteError('timeout');throw error instanceof WebsiteError?error:new WebsiteError('fetch_failed',{networkCode:['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.code)?error.code:undefined});}
}
