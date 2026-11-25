import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractWebsite,publicAddress,websiteURL,readWebsite} from '../website.mjs';
test('extracts article text without scripts or rendering HTML',()=>{const text='Interview notes describe changes in the city and quote residents with attribution. '.repeat(12);const data=extractWebsite(`<html><head><title>City report</title></head><body><nav>Menu</nav><article><h1>City report</h1><p>${text}</p><p>Second paragraph.</p><script>alert('not content')</script></article></body></html>`,'https://example.com/report');assert.equal(data.title,'City report');assert.match(data.text,/Interview notes/);assert.match(data.text,/\n\n/);assert.doesNotMatch(data.text,/alert\(|<script/);assert.equal(data.url,'https://example.com/report')});
test('rejects credentials, unsupported protocols and private network addresses',async()=>{assert.throws(()=>websiteURL('file:///etc/passwd'));assert.throws(()=>websiteURL('https://user:pass@example.com'));assert.throws(()=>websiteURL('http://example.com:3210'));for(const address of ['127.0.0.1','10.1.1.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(address),false);assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);await assert.rejects(readWebsite('http://127.0.0.1'),{code:'private_url'})});
test('structured article data can recover a valid article body',()=>{const text='The city published detailed transport statistics and described its proposed changes. '.repeat(5);const html='<html><head><title>Transport</title><script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'NewsArticle',headline:'Transport report',articleBody:text}]})+'</script></head><body><div>Loading</div></body></html>';const result=extractWebsite(html,'https://example.com/report');assert.equal(result.extractionMethod,'structured-data');assert.equal(result.text,text.trim());});
test('HTTP-200 verification screens never become article sources',()=>{assert.throws(()=>extractWebsite('<html><head><title>Just a moment...</title></head><body>Verify you are human. '+('Checking your browser. '.repeat(8))+'</body></html>','https://example.com'),{code:'access_blocked'});});
test('compressed response bodies decode safely before article extraction',async()=>{const {decodePageBytes}=await import('../website.mjs');const {gzipSync,brotliCompressSync}=await import('node:zlib');const body=Buffer.from('Article contents '.repeat(30));assert.deepEqual(decodePageBytes(gzipSync(body),'gzip'),body);assert.deepEqual(decodePageBytes(brotliCompressSync(body),'br'),body);assert.throws(()=>decodePageBytes(Buffer.from('broken'),'gzip'),{code:'decode_failed'});assert.throws(()=>decodePageBytes(gzipSync(Buffer.alloc(3_000_001)),'gzip'),{code:'too_large'});});

test('explicit cancellation remains an abort rather than being mislabeled as a website timeout',async()=>{
 const controller=new AbortController();
 const work=readWebsite('https://example.com/',{signal:controller.signal,request:async(_url,signal)=>await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
 controller.abort();
 await assert.rejects(work,{name:'AbortError'});
});

test('a redirect to a long Request Access form cannot be imported as article text',async()=>{
 const gate='<html><head><title>Federal Register :: Request Access</title></head><body><h1>Request Access</h1><form action="/unblock"><div class="g-recaptcha"></div></form>'+('Site navigation. '.repeat(240))+'</body></html>';
 const request=async url=>url.hostname==='unblock.example.com'
  ? {contentType:'text/html',bytes:Buffer.from(gate)}
  : {redirect:'https://unblock.example.com/'};
 await assert.rejects(readWebsite('https://example.com/documents/second',{request}),{code:'access_blocked'});
});

test('public NASA hosting addresses are distinct from reserved and private IPv4 ranges',()=>{
 assert.equal(publicAddress('192.0.66.108'),true);
 for(const address of ['192.0.0.1','192.0.2.42','192.168.1.1'])assert.equal(publicAddress(address),false);
});
