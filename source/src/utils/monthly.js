export const validNumber=v=>v!==null&&typeof v!=='boolean'&&v!==undefined&&(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
export const num=(v,fallback=0)=>validNumber(v)?Number(v):fallback;
export const clamp=(v,min=0,max=100)=>Math.min(max,Math.max(min,num(v)));
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function timestamp(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);if(Number.isFinite(n)&&n>0)return n<1e12?n*1000:n;const parsed=Date.parse(v);return Number.isFinite(parsed)?parsed:null;}
export function isOnline(s,now=Date.now()){const t=timestamp(s.last_updated??s.timestamp);return t!==null?now-t<300000&&now-t>-60000:s.is_online===true;}
export function bytes(value,digits=1){if(!validNumber(value)||Number(value)<0)return{value:'—',unit:''};let n=Number(value),i=0;const units=['B','KB','MB','GB','TB','PB'];while(n>=1024&&i<units.length-1){n/=1024;i++;}return{value:n.toFixed(i?digits:0),unit:units[i]};}
export function formatBytes(value,digits=1){const b=bytes(value,digits);return b.value+(b.unit?' '+b.unit:'');}
export function percent(used,total){return validNumber(used)&&num(total)>0?num(used)/num(total)*100:null;}
export function traffic(s){const limit=String(s.traffic_limit??'').trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|PB)?$/i);const power={B:0,KB:1,MB:2,GB:3,TB:4,PB:5};const cap=limit?Number(limit[1])*1024**power[(limit[2]||'GB').toUpperCase()]:null;const rx=validNumber(s.net_rx_monthly)?num(s.net_rx_monthly):null,tx=validNumber(s.net_tx_monthly)?num(s.net_tx_monthly):null;const rawKind=String(s.traffic_calc_type||'total');const kind=({ul:'out',dl:'in'})[rawKind]||rawKind;const used=kind==='out'?tx:kind==='in'?rx:kind==='max'?(rx!==null&&tx!==null?Math.max(rx,tx):null):(rx!==null&&tx!==null?rx+tx:null);return{used,cap:cap>0?cap:null,pct:used!==null&&cap>0?used/cap*100:null,label:kind==='out'?'仅出站':kind==='in'?'仅入站':kind==='max'?'取较大值':'双向合计'};}
export function expiry(s,now=Date.now()){if(!s.expire_date)return null;const date=timestamp(s.expire_date);return date===null?null:Math.ceil((date-now)/86400000);}
export function uptime(s,now=Date.now()){const boot=timestamp(s.boot_time);if(boot===null||boot>now)return'运行时间未知';const h=Math.floor((now-boot)/3600000);return h>=24?`${Math.floor(h/24)}天${h%24}小时`:`${h}小时`;}
export function probe(v,unit='ms'){return v===null?'超时':!validNumber(v)?'未采样':Number(v).toFixed(unit==='%'?1:2)+' '+unit;}
export function probeName(key,config={}){return config[{ct:'custom_ct_name',cu:'custom_cu_name',cm:'custom_cm_name',bd:'custom_bd_name'}[key]]||({ct:'电信',cu:'联通',cm:'移动',bd:'BGP'}[key]||config[key+'_name']||key.replace('node_','Node '));}
export function probeKeys(s){return ['ct','cu','cm','bd','node_1','node_2','node_3','node_4'].filter(k=>s['ping_'+k]===null||validNumber(s['ping_'+k])||s['loss_'+k]===null||validNumber(s['loss_'+k]));}

// UTC calendar month is deliberately distinct from an agent's configurable billing cycle.
export function utcMonth(now=Date.now()){
 const date=new Date(now),year=date.getUTCFullYear(),month=date.getUTCMonth();
 const start=Date.UTC(year,month,1),end=Date.UTC(year,month+1,1);
 return {key:new Date(start).toISOString().slice(0,7),start,end,startLabel:new Date(start).toISOString().slice(0,16).replace('T',' '),endLabel:new Date(end).toISOString().slice(0,16).replace('T',' ')};
}
export function utcMonthlyTraffic(server,now=Date.now()){
 const period=utcMonth(now),day=validNumber(server.reset_day)?Number(server.reset_day):null,reported=timestamp(server.last_updated??server.timestamp);
 let reason='';
 if(day===null)reason='未提供流量重置日，无法确认 UTC 月度口径';
 else if(day!==1)reason=day===0?'探针未设置周期重置，不能作为 UTC 本月流量':`探针重置日为 ${day} 号，不是 UTC 自然月`;
 else if(reported===null||reported<period.start)reason='本月尚无有效流量上报，旧月份数据不计入';
 else if(reported>=period.end||reported>now+60000)reason='上报时间异常，不能确认本月流量';
 const allowed=!reason;
 const rx=allowed&&validNumber(server.net_rx_monthly)&&num(server.net_rx_monthly)>=0?Number(server.net_rx_monthly):null;
 const tx=allowed&&validNumber(server.net_tx_monthly)&&num(server.net_tx_monthly)>=0?Number(server.net_tx_monthly):null;
 if(allowed&&(rx===null||tx===null))reason='月度上传或下载计数缺失';
 return {period,rx,tx,total:rx!==null&&tx!==null?rx+tx:null,eligible:!reason,reason};
}
export function aggregateMonthlyTraffic(servers,now=Date.now()){
 const samples=servers.map(s=>utcMonthlyTraffic(s,now)),known=samples.filter(s=>s.eligible);
 const rx=known.reduce((sum,s)=>sum+s.rx,0),tx=known.reduce((sum,s)=>sum+s.tx,0);
 return {period:utcMonth(now),rx,tx,total:rx+tx,totalNodes:samples.length,knownNodes:known.length,missingNodes:samples.length-known.length,complete:known.length===samples.length};
}
