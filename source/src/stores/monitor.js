import { reactive } from 'vue'
import { createMonitorClient } from '../utils/client.js'
import { DEFAULT_HISTORY_HOURS, ONLINE_THRESHOLD_MS, STORAGE_KEYS, getApiBases } from '../utils/config.js'
import { getJson, ApiError } from '../utils/http.js'
import { locale, setLocale, autoLocale, t } from '../utils/i18n.js'
import { normalizeTimestamp, isServerOnline, serverRamPercent, serverDiskPercent, trafficPercent, monthTraffic } from '../utils/format.js'

export const DEFAULT_SYS_CONFIG = Object.freeze({ show_price:true, show_expire:true, show_tf:true, show_three_net_details:true, display_mode:'bar', latency_window:{points:20,hours:2} })
export const monitor = reactive({mode:'dashboard',initialized:false,serversLoaded:false,ready:false,loading:true,error:'',config:null,version:'',servers:[],stats:{total:0,online:0,offline:0,globalSpeedIn:0,globalSpeedOut:0,globalNetRx:0,globalNetTx:0},sysConfig:{...DEFAULT_SYS_CONFIG},regionStats:{},connected:false,wsStatus:'idle',wsTimeout:false,wsTimeoutDismissed:false,lastUpdate:0,now:Date.now(),turnstileRequired:false,turnstileSiteKey:'',turnstileError:'',verifying:false,unauthorized:false,settingsMessage:'',themeMode:'auto',theme:'light',accent:'aurora',density:'comfortable',sparkline:true,view:'grid'})
let client, activeDetail=null, detailHandlers=null, lastError=null, clockTimer, messageTimer, configApplied=false, freshInitialDetail=false, modeEpoch=0
const historyVisibilityHandlers=new Set()
function read(key){try{return localStorage.getItem(key)||''}catch{return ''}}
function save(key,value){try{localStorage.setItem(key,value)}catch{/* optional preference */}}
function prefs(){try{return JSON.parse(read('cfsm-theme-ui'))||{}}catch{return {}}}
function applyAppearance(){
 const light=window.matchMedia?.('(prefers-color-scheme: light)').matches
 monitor.theme=monitor.themeMode==='auto'?(light?'light':'dark'):monitor.themeMode
 Object.assign(document.documentElement.dataset,{theme:monitor.theme,accent:monitor.accent,density:monitor.density,sparkline:monitor.sparkline?'on':'off'})
}
function applyConfig(config){
 monitor.config=config;monitor.version=config.version||''
 if(config.site_title)document.title=config.site_title
 if(!configApplied){
  const local=prefs(),opts=config.theme_options||{}
  for(const [key,allowed] of [['accent',['aurora','emerald','sakura','amber']],['density',['comfortable','compact']],['view',['grid','list']]]){const value=local[key]??opts[key];if(allowed.includes(value))monitor[key]=value}
  const spark=local.sparkline??opts.sparkline;if(typeof spark==='boolean')monitor.sparkline=spark
  const theme=read(STORAGE_KEYS.theme)||config.preferred_theme||'auto';monitor.themeMode=['auto','dark','light'].includes(theme)?theme:'auto'
  if(!read(STORAGE_KEYS.locale)){if(['zh','en'].includes(config.default_language))setLocale(config.default_language,{persist:false});else autoLocale()}
  applyAppearance();configApplied=true
 }
}
function normalize(raw){
 const s={...raw,source:getApiBases()[0]}
 for(const key of ['last_updated','report_timestamp'])if(s[key]!==undefined)s[key]=normalizeTimestamp(s[key])
 const load=String(s.load_avg||'').trim().split(/\s+/).map(Number)
 for(const [index,key] of ['load_1','load_5','load_15'].entries())if(s[key]===undefined)s[key]=Number.isFinite(load[index])?load[index]:null
 s.process_count=s.process_count??s.processes;s.tcp_conn_count=s.tcp_conn_count??s.tcp_conn;s.udp_conn_count=s.udp_conn_count??s.udp_conn
 return s
}
function flags(config={}){const out={...DEFAULT_SYS_CONFIG,...config};for(const key of ['show_tf','show_price','show_expire','show_three_net_details'])if([false,0,'0','false'].includes(out[key]))out[key]=false;return out}
function recompute(){const list=monitor.servers,online=list.filter(s=>isServerOnline(s,monitor.now)),number=v=>Number.isFinite(Number(v))?Number(v):0;monitor.stats={total:list.length,online:online.length,offline:list.length-online.length,globalSpeedIn:online.reduce((n,s)=>n+number(s.net_in_speed),0),globalSpeedOut:online.reduce((n,s)=>n+number(s.net_out_speed),0),globalNetRx:list.reduce((n,s)=>n+number(s.net_rx),0),globalNetTx:list.reduce((n,s)=>n+number(s.net_tx),0)}}
function ensureClient(){
 if(client)return client
 client=createMonitorClient({
  onState(next){
   if(next.config)applyConfig(next.config)
   monitor.sysConfig=flags({...next.config,...next.sysConfig})
   monitor.servers=(next.servers||[]).map(normalize);monitor.now=Date.now();recompute()
   if(next.selectedServer&&detailHandlers&&String(next.selectedServer.id)===activeDetail){const s=normalize(next.selectedServer);detailHandlers.onUpdate?.(s.id,s,s.last_updated)}
  },
  onError(error){lastError=error;monitor.error=error.message;monitor.loading=false;monitor.unauthorized=Boolean(error.needsAuth||error.needsTurnstile);monitor.turnstileRequired=false},
  onStatus(status){
   monitor.connected=status.kind==='live';monitor.wsStatus=({live:'online',connecting:'connecting',polling:'polling',paused:'paused',error:'offline'})[status.kind]||'idle'
   if(status.kind==='paused'&&/时限/.test(status.message)){monitor.wsTimeout=!monitor.wsTimeoutDismissed;monitor.wsStatus='timeout'}
   if(['live','polling'].includes(status.kind)){lastError=null;monitor.ready=true;monitor.loading=false;monitor.error='';monitor.unauthorized=false;monitor.lastUpdate=Date.now()}
  }
 })
 const media=window.matchMedia?.('(prefers-color-scheme: light)');media?.addEventListener?.('change',()=>{if(monitor.themeMode==='auto')applyAppearance()})
 clockTimer=setInterval(()=>{monitor.now=Date.now();recompute()},30000)
 window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(clockTimer);client.stop()}})
 window.addEventListener('pageshow',event=>{if(event.persisted)client.refresh().then(notifyHistoryVisibility)})
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueMicrotask(notifyHistoryVisibility)})
 return client
}
export function setMonitorMode(mode){modeEpoch+=1;monitor.mode=mode;detailHandlers=null;freshInitialDetail=false}
// The client owns visibility catch-up and polling; views must not open parallel loops.
function notifyHistoryVisibility(){if(document.visibilityState==='hidden'||monitor.wsTimeout||monitor.wsTimeoutDismissed)return;for(const handler of historyVisibilityHandlers)Promise.resolve().then(handler).catch(()=>{})}
export function registerVisibilityHandler(handler,{historyOnly=false}={}){if(!historyOnly)return()=>{};historyVisibilityHandlers.add(handler);return()=>historyVisibilityHandlers.delete(handler)}
function localAppearance(){save('cfsm-theme-ui',JSON.stringify({accent:monitor.accent,density:monitor.density,sparkline:monitor.sparkline,view:monitor.view}));applyAppearance();monitor.settingsMessage=t('settingsLocal');clearTimeout(messageTimer);messageTimer=setTimeout(()=>{monitor.settingsMessage=''},2600)}
export function setThemeMode(mode){monitor.themeMode=['auto','light','dark'].includes(mode)?mode:'auto';save(STORAGE_KEYS.theme,monitor.themeMode);applyAppearance()}
export function toggleTheme(){setThemeMode(monitor.theme==='dark'?'light':'dark')}
export function setAccent(value){if(['aurora','emerald','sakura','amber'].includes(value)){monitor.accent=value;localAppearance()}}
export function setDensity(value){if(['comfortable','compact'].includes(value)){monitor.density=value;localAppearance()}}
export function setSparkline(value){monitor.sparkline=Boolean(value);localAppearance()}
export function setView(value){if(['grid','list'].includes(value)){monitor.view=value;localAppearance()}}
export function changeLocale(value){setLocale(value)}
export async function initMonitor(){
 const epoch=modeEpoch;monitor.loading=!monitor.ready;lastError=null
 const c=ensureClient();let id=null
 if(monitor.mode==='detail'){try{id=decodeURIComponent(location.hash.replace(/^#\/server\//,''))}catch{id=''}}
 activeDetail=id;await c.setDetail(id);if(epoch!==modeEpoch)return false;await c.start();if(epoch!==modeEpoch)return false
 freshInitialDetail = id !== null && !lastError
 monitor.loading=false;monitor.initialized=true;monitor.serversLoaded=monitor.mode!=='detail'&&!lastError
 monitor.ready=!lastError&&Boolean(monitor.config);if(monitor.ready){monitor.error='';monitor.unauthorized=false}
 return monitor.ready
}
export async function ensureConfig(){await initMonitor();return monitor.config}
export async function refreshDashboard(){lastError=null;const c=ensureClient();activeDetail=null;await c.setDetail(null);await c.refresh();monitor.loading=false;return !lastError}
export async function retryMonitor(){monitor.unauthorized=false;lastError=null;await ensureClient().refresh();monitor.ready=!lastError;monitor.loading=false;return !lastError}
export async function fetchServer(id){
 const epoch=modeEpoch;const requested=String(id)
 const useInitial = freshInitialDetail && activeDetail === requested
 freshInitialDetail=false;lastError=null;activeDetail=String(id);const c=ensureClient();await c.setDetail(activeDetail);const snapshot=await (useInitial?c.start():c.refresh())
 if(epoch!==modeEpoch||activeDetail!==requested)throw new ApiError('详情请求已取消',{code:'CANCELLED'})
 if(lastError)throw new ApiError(lastError.message,{status:lastError.status})
 if(!snapshot.selectedServer){if(monitor.wsTimeout||monitor.wsTimeoutDismissed)throw new ApiError('实时连接已暂停，请显式继续后读取节点。',{code:'PAUSED'});throw new ApiError('节点详情不可用，请重试。',{status:404})}
 return{server:normalize(snapshot.selectedServer),base:getApiBases()[0]}
}
export function startAllSockets(){return monitor.wsTimeout||monitor.wsTimeoutDismissed?Promise.resolve():ensureClient().refresh()}
export function startServerSocket(base,id,handlers={}){activeDetail=String(id);detailHandlers=handlers;return{close(){if(detailHandlers===handlers)detailHandlers=null}}}
export function stopAllSockets(){detailHandlers=null}
export function pauseAllSockets(){/* Visibility and deadlines are owned by the shared client. */}
export async function resumeAllSockets(){monitor.wsTimeout=false;monitor.wsTimeoutDismissed=false;lastError=null;await ensureClient().resume();if(!lastError)window.dispatchEvent(new CustomEvent('cfsm:resumed'))}
export function dismissWsTimeout(){monitor.wsTimeout=false;monitor.wsTimeoutDismissed=true;monitor.wsStatus='paused'}
export async function verifyTurnstile(){monitor.unauthorized=true;monitor.error='请前往默认后台 /admin#/admin 完成验证后刷新。';return false}
export async function fetchHistory(base,id,hours=DEFAULT_HISTORY_HOURS){
 if(!/^[A-Za-z0-9._:-]{1,64}$/.test(id)||['__proto__','constructor','prototype','all'].includes(id.toLowerCase()))throw new ApiError('Invalid server ID')
 const range=Number(hours);if(!Number.isFinite(range)||range<=0||range>168)throw new ApiError('Invalid history range')
 const data=await getJson(base,`/api/history/all?id=${encodeURIComponent(id)}&hours=${range}`,{timeout:30000})
 if(!Array.isArray(data))throw new ApiError('历史响应格式无效')
 return data.map(row=>({...row,timestamp:normalizeTimestamp(row.timestamp??row.ts)})).filter(row=>row.timestamp>0).sort((a,b)=>a.timestamp-b.timestamp)
}
export function getServerCardMetrics(server){return{ramPercent:serverRamPercent(server),diskPercent:serverDiskPercent(server),trafficPercent:trafficPercent(server,monitor.now),monthTraffic:monthTraffic(server,monitor.now),online:isServerOnline(server,monitor.now)}}
export {ONLINE_THRESHOLD_MS,locale}
