import {apiUrl,getApiBases,getJwtToken,getTurnstileToken,getTurnstileVerified} from './config.js'
export class ApiError extends Error{constructor(message,{status=0,code='',payload=null}={}){super(message);this.name='ApiError';this.status=status;this.code=code;this.payload=payload}}
export async function request(base,path,{method='GET',timeout=15000,signal}={}){
 if(method!=='GET')throw new ApiError('主题仅支持只读请求')
 if(!getApiBases().includes(base))throw new ApiError('禁止向其他源发送凭证')
 const headers={Accept:'application/json'},anonymous=path.split('?')[0]==='/api/config'
 if(!anonymous){const jwt=getJwtToken(),verified=getTurnstileVerified(),token=getTurnstileToken();if(jwt)headers.Authorization='Bearer '+jwt;if(verified)headers['X-Turnstile-Verified']=verified;else if(token)headers['X-Turnstile-Token']=token}
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeout);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 try{
  const response=await fetch(apiUrl(base,path),{method:'GET',headers,credentials:anonymous?'omit':'same-origin',cache:'no-store',redirect:'error',signal:controller.signal})
  if(!response.ok)throw new ApiError(response.status===401?'需要登录，请前往 /admin#/admin 验证后刷新。':response.status===403?'访问被拒绝，请前往 /admin#/admin 完成验证。':'监控接口请求失败。',{status:response.status})
  let payload;try{payload=await response.json()}catch{throw new ApiError('接口返回了无效 JSON')}
  if(payload&&typeof payload==='object'&&!Array.isArray(payload)&&(payload.error||payload.success===false))throw new ApiError('接口未返回有效监控数据')
  return payload
 }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(error?.name==='AbortError'?'请求已取消或超时':'监控网络请求失败',{code:error?.name==='AbortError'?'TIMEOUT':'NETWORK'})}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
export const getJson=(base,path,options={})=>request(base,path,options)
export async function getAllBases(path,options={}){return Promise.all(getApiBases().map(async base=>{try{return{base,data:await getJson(base,path,options),error:null}}catch(error){return{base,data:null,error}}}))}
export function postJson(){return Promise.reject(new ApiError('外观偏好仅保存在本浏览器；主题不写入后台'))}
