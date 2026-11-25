import {access} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {pageRequest,websiteURL,extractWebsite,pageEvidence,blockedPage,WebsiteError} from './website.mjs';
import {startWebsiteBrowserProxy} from './website-browser-proxy.mjs';
let browserQueue=Promise.resolve();
async function executable(){
 for(const file of [process.env.NEWSROOM_BROWSER_PATH,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean))try{await access(file);return file;}catch{}
 throw new WebsiteError('browser_unavailable');
}
// Replay fetched HTML when available, or navigate directly through a proxy
// that restricts every connection to a pinned public address.
export function renderWebsite(options,dependencies){
 return withBrowserSlot(options.signal,render=>render(options,dependencies));
}

export function withBrowserSlot(signal,work){
 signal?.throwIfAborted();
 let cleanup,cancel;
 const aborted=signal&&new Promise((_,reject)=>{
  cancel=()=>reject(signal.reason);
  signal.addEventListener('abort',cancel,{once:true});
 });
 const job=browserQueue.then(()=>{
  signal?.throwIfAborted();
  return work((options,dependencies)=>{
   const rendering=renderInBrowser(options,dependencies);
   cleanup=rendering.catch(()=>{});
   return rendering;
  });
 });
 // A timed-out caller may have returned while Chrome is still closing.
 browserQueue=job.catch(()=>{}).then(()=>cleanup);
 return aborted?Promise.race([job,aborted]).finally(()=>signal.removeEventListener('abort',cancel)):job;
}

async function renderInBrowser({url,html,native=false,renderBudgetMs,signal:externalSignal},{resourceRequest=pageRequest}={}){
 let browser,timer,proxy;
 const controller=new AbortController();
 const stop=()=>{controller.abort(externalSignal?.reason);void browser?.close().catch(()=>{});};
 externalSignal?.throwIfAborted();externalSignal?.addEventListener('abort',stop,{once:true});
 try{
  url=websiteURL(url).href;
  if(native)proxy=await startWebsiteBrowserProxy(controller.signal);
  controller.signal.throwIfAborted();
  browser=await chromium.launch({
   executablePath:await executable(),headless:true,timeout:10000,
   args:['--disable-background-networking','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
   ...(proxy?{proxy:{server:proxy.url,bypass:'<-loopback>'}}:{})
  });
  externalSignal?.throwIfAborted();
  if(!renderBudgetMs)timer=setTimeout(()=>{controller.abort();browser.close().catch(()=>{});},25000);
  const context=await browser.newContext({viewport:{width:1100,height:1400},serviceWorkers:'block',acceptDownloads:false});
  await context.routeWebSocket('**/*',socket=>socket.close());
  let count=0,total=0,initial=true;
  await context.route('**/*',async route=>{
   try{
    const request=route.request();
    if(request.method()!=='GET'||++count>60||total>12_000_000)return await route.abort();
    let target=websiteURL(request.url());
    if(native)return await route.continue();
    if(initial&&request.isNavigationRequest()&&target.href===url){initial=false;return await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});}
    if(request.resourceType()==='document'&&request.isNavigationRequest())return await route.abort();
    let result;
    for(let redirects=0;redirects<=3;redirects++){
     result=await resourceRequest(target,AbortSignal.any([controller.signal,AbortSignal.timeout(6000)]),{resource:true});
     if(!result.redirect)break;target=websiteURL(new URL(result.redirect,target).href);result=null;
    }
    if(!result?.bytes)return await route.abort();total+=result.bytes.length;
    await route.fulfill({status:200,contentType:result.contentType,body:result.bytes});
   }catch{await route.abort().catch(()=>{});}
  });
  const page=await context.newPage();page.on('dialog',dialog=>dialog.dismiss());context.on('page',other=>{if(other!==page)other.close().catch(()=>{});});
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:renderBudgetMs||12000});
  if(native){
   if(!response?.ok())throw new WebsiteError('http_error',{status:response?.status()});
   const contentType=response.headers()['content-type']||'';
   if(!/text\/(html|plain)|application\/xhtml\+xml/i.test(contentType))throw new WebsiteError('unsupported_type');
   url=websiteURL(page.url()).href;
  }
  // Allow a bounded hydration window without waiting for tracking requests.
  const before=await page.locator('body').innerText();
  if(before.trim().length<120)await page.waitForFunction(()=>document.body?.innerText?.trim().length>=120,null,{timeout:6000}).catch(()=>{});
  else await page.waitForFunction(previous=>document.body?.innerText!==previous,before,{timeout:2500}).catch(()=>{});
  const rendered=await page.content();
  if(Buffer.byteLength(rendered)>3_000_000)throw new WebsiteError('too_large');
  if(blockedPage(rendered))throw new WebsiteError('access_blocked');
  try{return {...extractWebsite(rendered,url),extractionMethod:native?'browser-direct':'browser'};}catch(error){if(error.code!=='no_content')throw error;}
  return pageEvidence(rendered,url);
 }catch(error){if(externalSignal?.aborted)throw externalSignal.reason;throw error instanceof WebsiteError?error:new WebsiteError('browser_failed');}
 finally{externalSignal?.removeEventListener('abort',stop);clearTimeout(timer);controller.abort();proxy?.close();await browser?.close().catch(()=>{});}
}
