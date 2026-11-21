import {spawnSync} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// Compile first; do not touch published assets if Vite reports an error.
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const repo=path.resolve(source,'..'),dist=path.join(source,'dist')
const result=spawnSync(process.execPath,[path.join(source,'node_modules/vite/bin/vite.js'),'build'],{cwd:source,stdio:'inherit',env:process.env})
if(result.error)throw result.error
if(result.status!==0)process.exit(result.status||1)
const entry=await fs.readFile(path.join(dist,'index.html'),'utf8')
const next=await fs.readdir(path.join(dist,'assets'),{withFileTypes:true})
if(!entry.includes('assets/')||!next.length||next.some(item=>!item.isFile()))throw new Error('Unexpected build structure; published files were not changed.')
const assets=path.join(repo,'assets')
await fs.mkdir(assets,{recursive:true})
const previous=await fs.readdir(assets,{withFileTypes:true})
await fs.cp(path.join(dist,'assets'),assets,{recursive:true})
await fs.writeFile(path.join(repo,'index.html'),entry)
const keep=new Set(next.map(item=>item.name))
for(const item of previous){
 if(item.isFile()&&/\.(?:js|css)$/.test(item.name)&&!keep.has(item.name))await fs.unlink(path.join(assets,item.name))
}
console.log('Updated repository index.html and assets/ from the successful source build.')
