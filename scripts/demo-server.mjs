import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/demo');
const files = new Map([['/', ['index.html', 'text/html']], ['/positions.html', ['index.html', 'text/html']], ['/demo.js', ['demo.js', 'text/javascript']], ['/demo.css', ['demo.css', 'text/css']]]);
http.createServer(async (request, response) => {
  const item = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (!item) { response.writeHead(404).end(); return; }
  try { response.writeHead(200, { 'Content-Type': `${item[1]}; charset=utf-8`, 'Cache-Control': 'no-store' }); response.end(await readFile(resolve(root, item[0]))); }
  catch { response.writeHead(500).end('Build the synthetic demo first.'); }
}).listen(4173, '127.0.0.1', () => console.log('Synthetic demo: http://127.0.0.1:4173/positions.html#/positions'));
