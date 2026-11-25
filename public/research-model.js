// Candidate results and saved sources have independent lifetimes.
function httpURL(value){
 try{
  const url=new URL(value);
  if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)return url;
 }catch{}
}
function hasFullHost(url){
 const host=url.hostname.replace(/\.$/,'');
 return host.includes('.')||host.startsWith('[');
}
// A bare redirect host sometimes carries the absolute publisher URL. Never
// guess the publisher from a title, hostname fragment or opaque redirect ID.
function originalURL(url,depth=0){
 const host=url.hostname.replace(/^www\./,'').toLowerCase();
 const searchRedirect=(host==='duckduckgo.com'&&/^\/l\/?$/.test(url.pathname))
  ||(host==='google.com'&&url.pathname==='/url')
  ||(host==='bing.com'&&url.pathname.toLowerCase()==='/news/apiclick.aspx');
 if(hasFullHost(url)&&!searchRedirect)return url;
 if(depth>=3)return;
 const targets=['url','target','redirect','redirect_url','dest','destination','u','q','uddg'].map(key=>url.searchParams.get(key));
 const path=url.pathname.slice(1);
 if(/^https?:\/\//i.test(path))targets.push(path+url.search);
 else if(/^https?%3a/i.test(path))try{targets.push(decodeURIComponent(path));}catch{}
 for(const target of targets){
  if(!target||!/^https?:\/\//i.test(target))continue;
  const parsed=httpURL(target);
  const publisher=parsed&&originalURL(parsed,depth+1);
  if(publisher)return publisher;
 }
}
export function researchOriginalURL(value){
 const url=httpURL(value);
 return (url&&originalURL(url)?.href)||'';
}
export function canonicalResearchURL(value){
 const parsed=httpURL(value);
 if(!parsed)return '';
 // Keep unresolved links as identities for history and manual imports only.
 const url=originalURL(parsed)||parsed;
 url.hash='';
 for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
 url.searchParams.sort();
 if(url.pathname!=='/')url.pathname=url.pathname.replace(/\/+$/,'');
 return url.href;
}
export function mergeResearchResults(previous,incoming,mode='more'){const map=new Map();for(const item of [...(mode==='more'?previous:[]),...incoming]){const url=canonicalResearchURL(item.url);if(!url)continue;const old=map.get(url);map.set(url,{...old,...item,url,id:old?.id||item.id||url});}return [...map.values()].sort((a,b)=>(b.score||0)-(a.score||0));}
export function parseResearchJSON(text){const clean=String(text||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');try{return JSON.parse(clean)}catch{throw Error('The model returned invalid research JSON. Retry the search.');}}
