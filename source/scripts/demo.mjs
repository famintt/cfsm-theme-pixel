import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createDemoState} from './demo-data.mjs'
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(source)
const {name}=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'))
const theme=name.includes('pixel')?'Pixel':'Aurora',port=Number(process.env.PORT||4179)
const types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.html':'text/html; charset=utf-8','.png':'image/png'}
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT')
function fixture(){const sample=createDemoState();sample.config={...sample.config,site_title:theme+' · 演示数据',version:'本地模拟',is_public:true,turnstile_enabled:false,preferred_theme:theme==='Pixel'?'dark':'light',default_language:'zh',frontend_ws_timeout_minutes:0};sample.servers=sample.servers.map((s,i)=>({...s,traffic_limit:[3072,2048,1024,500,1024,2048][i],price:i===0?'12':'',currency:'$',billing_cycle:'month'}));sample.servers[1].ping_ct=0;sample.servers[2].ping_cu=null;sample.servers[2].loss_cu=null;return sample}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  const url=new URL(req.url,'http://127.0.0.1'),sample=fixture();let data
  if(url.pathname==='/api/config')data=sample.config
  else if(url.pathname==='/api/servers')data=sample
  else if(url.pathname==='/api/server'){data=sample.servers.find(s=>String(s.id)===url.searchParams.get('id'));if(!data){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Not found'}));return}data={...data,sysConfig:sample.sysConfig}}
  else if(url.pathname==='/api/history/all'){const s=sample.servers.find(s=>s.id===url.searchParams.get('id'));data=s?Array.from({length:18},(_,i)=>({...s,timestamp:Date.now()-(17-i)*180000,cpu:i===5?null:Math.max(0,Number(s.cpu)+i%4),net_in_speed:Number(s.net_in_speed)*(1+i%3/8),net_out_speed:Number(s.net_out_speed)*(1+i%5/10)})):[]}
  if(data!==undefined){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return}
  if(url.pathname.startsWith('/api/')){res.writeHead(404);res.end();return}
  let base=repo,relative=url.pathname==='/'?'index.html':url.pathname.replace(/^\//,'')
  if(/^\/(flags|os-icons)\//.test(url.pathname))base=path.join(source,'demo-assets')
  else if(url.pathname!=='/'&&!url.pathname.startsWith('/assets/')){res.writeHead(404);res.end('Local demo only');return}
  const file=path.resolve(base,relative)
  if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return}
  let content=await fs.readFile(file)
  if(relative==='index.html')content=Buffer.from(content.toString().replace('</body>','<div role="note" style="position:fixed;bottom:0;right:0;z-index:1000;background:#173047;color:#fff;font:11px sans-serif;padding:5px 9px">仅本地演示 · 全部为模拟数据</div></body>'))
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content)
 }catch{res.writeHead(404);res.end('Demo file not found; run npm run build:theme first.')}
})
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'本机端口已占用，请设置 PORT':'演示服务启动失败');process.exitCode=1})
server.listen(port,'127.0.0.1',()=>console.log(theme+' local demo: http://127.0.0.1:'+port+' (synthetic data; no backend writes)'))
