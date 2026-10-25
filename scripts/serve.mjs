import http from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';
const root=path.resolve('.');
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
  if(!/^\/(?:index\.html|config\.json|admin\.(?:html|js|css)|dashboard\/[a-z-]+\.(?:js|css)|assets\/(?:(?:teams|tyres|circuits)\/)?[a-zA-Z0-9_.-]+)$/.test(requested)){res.writeHead(404);res.end('Not found');return}
  const file=path.resolve(root,'.'+requested);if(!file.startsWith(root+path.sep))throw Error();
  const data=await readFile(file);const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.ico':'image/x-icon','.ttf':'font/ttf'};
  res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.setHeader('Cache-Control','no-store');res.end(data);
 }catch{res.writeHead(404);res.end('Not found')}
}).listen(4173,'127.0.0.1',()=>console.log('F7R Race Control: http://127.0.0.1:4173'));

