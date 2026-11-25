import assert from 'node:assert/strict';
import http from 'node:http';
import {test} from 'node:test';
import {startWebsiteBrowserProxy} from '../website-browser-proxy.mjs';

test('the native Chrome proxy denies private destinations for HTTP and HTTPS tunnels', async () => {
 const controller = new AbortController();
 const proxy = await startWebsiteBrowserProxy(controller.signal);
 try {
  const proxyURL = new URL(proxy.url);
  const status = await new Promise((resolve,reject) => {
   const request = http.get({hostname:proxyURL.hostname,port:proxyURL.port,path:'http://127.0.0.1/'}, response => {
    response.resume();
    resolve(response.statusCode);
   });
   request.on('error',reject);
  });
  assert.equal(status,403);
  const tunnelStatus = await new Promise((resolve,reject) => {
   const request = http.request({hostname:proxyURL.hostname,port:proxyURL.port,method:'CONNECT',path:'127.0.0.1:443'});
   request.on('connect',(response,socket)=>{
    socket.destroy();
    resolve(response.statusCode);
   });
   request.on('error',reject);
   request.end();
  });
  assert.equal(tunnelStatus,403);
 } finally {
  controller.abort();
  proxy.close();
 }
});
