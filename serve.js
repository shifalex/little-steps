// Optional local preview: node serve.js, then http://127.0.0.1:4173
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Set(['index.html', 'models.js', 'engine.js', 'app.js', 'styles.css']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!files.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, name), (error, data) => {
    if (error) { res.writeHead(500); res.end('Could not read file'); return; }
    res.writeHead(200, { 'Content-Type': `${types[path.extname(name)]}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(data);
  });
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Little Steps: http://127.0.0.1:${process.env.PORT || 4173}`));
