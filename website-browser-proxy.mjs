import http from 'node:http';
import net from 'node:net';
import {resolvePublicAddresses, websiteURL} from './website.mjs';

// Chrome uses its own HTTP and TLS stack. The proxy resolves and pins every
// destination, including redirects, so a page cannot navigate into the LAN.
export async function startWebsiteBrowserProxy(signal) {
 const sockets = new Set();
 let transferred = 0;
 const maxBytes = 16_000_000;
 function account(chunk) {
  transferred += chunk.length;
  if (transferred > maxBytes) for (const socket of sockets) socket.destroy();
 }

 function track(socket) {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => socket.destroy());
  return socket;
 }

 const server = http.createServer(async (request, response) => {
  try {
   const target = websiteURL(request.url);
   if (transferred > maxBytes || target.protocol !== 'http:' || request.method !== 'GET') {
    response.writeHead(405).end();
    return;
   }
   const [address] = await resolvePublicAddresses(target);
   if (signal.aborted || response.destroyed) return;
   const headers = {...request.headers};
   delete headers['proxy-authorization'];
   delete headers['proxy-connection'];
   const upstream = http.get(target, {
    headers,
    signal,
    lookup: (_host, options, callback) => options.all
     ? callback(null, [address])
     : callback(null, address.address, address.family)
   }, incoming => {
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.on('error', () => response.destroy());
    incoming.on('data', account);
    incoming.pipe(response);
   });
   upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502).end();
    else response.destroy();
   });
   response.on('close', () => upstream.destroy());
  } catch {
   if (!response.destroyed) response.writeHead(403).end();
  }
 });

 server.on('connection', track);
 server.on('connect', async (request, client, head) => {
  try {
   const target = websiteURL('https://' + request.url);
   if (transferred > maxBytes || !/^(?:\[[^\]]+\]|[^:/?#@]+):443$/.test(request.url)) throw Error('Invalid tunnel');
   const [address] = await resolvePublicAddresses(target);
   if (signal.aborted || client.destroyed) return;
   const upstream = track(net.connect({host: address.address, port: 443, family: address.family}));
   upstream.on('close', () => client.destroy());
   upstream.on('data', account);
   client.on('close', () => upstream.destroy());
   upstream.once('connect', () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    client.pipe(upstream).pipe(client);
   });
  } catch {
   client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  }
 });

 await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
 });
 function close() {
  for (const socket of sockets) socket.destroy();
  server.close();
 }
 return {url: 'http://127.0.0.1:' + server.address().port, close};
}
