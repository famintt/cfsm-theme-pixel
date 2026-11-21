import test from 'node:test'
import assert from 'node:assert/strict'
import {getJson,postJson} from '../src/utils/http.js'
function environment(t,options={}){
 const saved=new Map()
 const mock=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
 mock('window',{location:{origin:'https://monitor.example'}})
 mock('document',{querySelector:()=>({getAttribute:()=>options.base||''})})
 mock('localStorage',{getItem:key=>options.local?.[key]||null})
 mock('sessionStorage',{getItem:key=>options.session?.[key]||null})
 const calls=[];mock('fetch',async(url,init)=>{calls.push({url,init});return options.handler?options.handler(url,init):{ok:true,status:200,json:async()=>[]}})
 t.after(()=>{for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}})
 return calls
}
test('config is anonymous while history reuses same-origin JWT and session verification',async t=>{
 const calls=environment(t,{local:{jwt_token:'local.synthetic'},session:{turnstile_verified:'session.synthetic'}})
 await getJson('https://monitor.example','/api/config')
 await getJson('https://monitor.example','/api/history/all?id=node&hours=1')
 assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.headers.Authorization,undefined)
 assert.equal(calls[1].init.credentials,'same-origin');assert.equal(calls[1].init.headers.Authorization,'Bearer local.synthetic')
 assert.equal(calls[1].init.headers['X-Turnstile-Verified'],'session.synthetic');assert.equal(calls[1].init.redirect,'error')
})
test('HTTP data helper rejects writes and untrusted credential destinations before fetch',async t=>{
 const calls=environment(t)
 await assert.rejects(postJson(),/不写入后台/)
 await assert.rejects(getJson('https://other.example','/api/server?id=x'),/其他源/)
 assert.equal(calls.length,0)
})
test('HTML/error envelopes and malformed JSON are visible failures, not empty histories',async t=>{
 let kind='json';environment(t,{handler:()=>({ok:true,status:200,json:async()=>{if(kind==='json')throw new SyntaxError('bad');return{error:'internal-detail'}}})})
 await assert.rejects(getJson('https://monitor.example','/api/history/all?id=x&hours=1'),/无效 JSON/)
 kind='error';await assert.rejects(getJson('https://monitor.example','/api/history/all?id=x&hours=1'),/有效监控数据/)
})
test('blocked storage does not prevent public read requests',async t=>{
 const calls=environment(t);Object.defineProperty(globalThis,'localStorage',{get(){throw Error('blocked')},configurable:true})
 Object.defineProperty(globalThis,'sessionStorage',{get(){throw Error('blocked')},configurable:true})
 await getJson('https://monitor.example','/api/history/all?id=x&hours=1');assert.equal(calls.length,1)
})
