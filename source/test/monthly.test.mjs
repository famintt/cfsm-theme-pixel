import test from 'node:test';import assert from 'node:assert/strict';
import {validNumber,escapeHtml,bytes,formatBytes,percent,traffic,isOnline,probe,probeKeys,timestamp,uptime} from '../src/utils/monthly.js';
const GB=1024**3;
test('zero is data; false/null/missing are not zero',()=>{assert.equal(validNumber(0),true);for(const v of [null,false,undefined,'',NaN])assert.equal(validNumber(v),false);assert.equal(probe(0,'%'),'0.0 %');assert.equal(probe(null),'超时');assert.equal(probe(false),'未采样');assert.deepEqual(probeKeys({ping_ct:0,loss_cu:null,ping_cm:false}),['ct','cu']);});
test('binary bytes, explicit RAM/disk MB, no misleading missing zero',()=>{assert.equal(formatBytes(2048*1024**2),'2.0 GB');assert.equal(formatBytes(28.2*GB),'28.2 GB');assert.equal(formatBytes(null),'—');assert.deepEqual(bytes(0),{value:'0',unit:'B'});assert.equal(percent(1,4),25);assert.equal(percent(null,4),null);assert.equal(percent(1,0),null);});
test('actual upstream traffic modes total/dl/ul/max and numeric GB quota',()=>{const s={net_rx_monthly:40*GB,net_tx_monthly:20*GB,traffic_limit:'100'};for(const [type,used] of [['total',60],['dl',40],['ul',20],['max',40]]){const t=traffic({...s,traffic_calc_type:type});assert.equal(t.cap,100*GB);assert.equal(t.used,used*GB);assert.equal(t.pct,used);}assert.equal(traffic({...s,traffic_limit:'0'}).pct,null);assert.equal(traffic({...s,net_rx_monthly:null}).used,null);assert.equal(traffic({...s,traffic_limit:'3TB'}).cap,3072*GB);});
test('traffic not rounded up to a whole segment; cap may exceed 100',()=>{const a=traffic({net_rx_monthly:28.2*GB,net_tx_monthly:0,traffic_limit:3072});assert.ok(a.pct>0&&a.pct<1);const b=traffic({net_rx_monthly:120*GB,net_tx_monthly:0,traffic_limit:100});assert.equal(b.pct,120);});
test('online follows last report age, not stale boolean, both timestamp units',()=>{const now=1800000000000;assert.equal(isOnline({last_updated:now-299000},now),true);assert.equal(isOnline({last_updated:now-301000,is_online:true},now),false);assert.equal(isOnline({last_updated:(now-10000)/1000},now),true);assert.equal(isOnline({},now),false);assert.equal(timestamp(String(now)),now);assert.equal(uptime({boot_time:String(now-25*3600000)},now),'1天1小时');});
test('untrusted names become text, never executable markup',()=>{assert.equal(escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');assert.equal(escapeHtml("'&"),'&#39;&amp;');});

import {utcMonth,utcMonthlyTraffic,aggregateMonthlyTraffic} from '../src/utils/monthly.js';
const monthNow=Date.parse('2026-11-20T12:00:00Z');
const monthlyServer=(extra={})=>({reset_day:1,last_updated:monthNow,net_rx_monthly:10*GB,net_tx_monthly:3*GB,net_rx:900*GB,net_tx:700*GB,...extra});
test('UTC month ignores browser timezone and handles year/leap boundaries',()=>{
 assert.equal(utcMonth(Date.parse('2026-12-01T00:30:00+08:00')).key,'2026-11');
 assert.equal(utcMonth(Date.parse('2026-01-01T00:00:00Z')).start,Date.parse('2026-01-01T00:00:00Z'));
 assert.equal(utcMonth(Date.parse('2024-02-29T23:59:59Z')).end,Date.parse('2024-03-01T00:00:00Z'));
});
test('UTC monthly counters never use boot/lifetime traffic or billing calculation mode',()=>{
 const m=utcMonthlyTraffic(monthlyServer({traffic_calc_type:'ul'}),monthNow);
 assert.equal(m.rx,10*GB);assert.equal(m.tx,3*GB);assert.equal(m.total,13*GB);assert.equal(m.eligible,true);
});
test('billing reset 0, non-first day and unknown reset are not relabeled as UTC month',()=>{
 for(const day of [0,5,20,31,undefined,null,false]){
  const m=utcMonthlyTraffic(monthlyServer({reset_day:day}),monthNow);assert.equal(m.eligible,false);assert.equal(m.total,null);assert.equal(m.rx,null);assert.ok(m.reason);
 }
});
test('previous-month and future timestamps are excluded, offline current-month data is retained',()=>{
 assert.equal(utcMonthlyTraffic(monthlyServer({last_updated:Date.parse('2026-10-31T23:59:59Z')}),monthNow).eligible,false);
 assert.equal(utcMonthlyTraffic(monthlyServer({last_updated:monthNow+120000}),monthNow).eligible,false);
 assert.equal(utcMonthlyTraffic(monthlyServer({last_updated:monthNow-3*86400000,is_online:false}),monthNow).total,13*GB);
 assert.equal(utcMonthlyTraffic(monthlyServer({last_updated:Date.parse('2026-11-01T00:00:00Z')}),monthNow).eligible,true);
});
test('zero monthly traffic is valid, missing or negative directions are not fabricated',()=>{
 assert.equal(utcMonthlyTraffic(monthlyServer({net_rx_monthly:0,net_tx_monthly:0}),monthNow).total,0);
 for(const v of [undefined,null,false,-1]){const m=utcMonthlyTraffic(monthlyServer({net_tx_monthly:v}),monthNow);assert.equal(m.eligible,false);assert.equal(m.total,null);}
});
test('overall monthly sums include offline nodes and flag incomplete coverage',()=>{
 const total=aggregateMonthlyTraffic([monthlyServer(),monthlyServer({is_online:false,traffic_calc_type:'dl'}),monthlyServer({reset_day:20})],monthNow);
 assert.equal(total.total,26*GB);assert.equal(total.rx,20*GB);assert.equal(total.tx,6*GB);assert.equal(total.knownNodes,2);assert.equal(total.totalNodes,3);assert.equal(total.complete,false);
});
test('UTC month rollover refuses an old last report until a current-month report arrives',()=>{
 const now=Date.parse('2026-12-01T00:00:01Z');assert.equal(utcMonthlyTraffic(monthlyServer(),now).total,null);
 const m=utcMonthlyTraffic(monthlyServer({last_updated:now,net_rx_monthly:0,net_tx_monthly:0}),now);assert.equal(m.eligible,true);assert.equal(m.total,0);
});
