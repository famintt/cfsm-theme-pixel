import test from 'node:test'
import assert from 'node:assert/strict'
import {formatBytes,formatSpeed,latencyState,normalizeTimestamp,monthTraffic,trafficUsage,trafficPercent,regionCode,serverUptimeSeconds,formatDateTime} from '../src/utils/format.js'
const now=Date.parse('2026-11-20T12:00:00Z'),GB=1024**3
const node={reset_day:1,last_updated:now,net_rx_monthly:80*GB,net_tx_monthly:20*GB,traffic_limit:100}
test('sub-byte positive values never select a negative unit',()=>assert.equal(formatBytes(0.5),'0.5 B'))
test('unknown bytes and speeds do not become zero',()=>{for(const v of [undefined,null,false,-1])assert.equal(formatBytes(v),'—');assert.equal(formatSpeed(null),'—');assert.equal(formatSpeed(0),'0 B/s')})
test('zero latency is a real sample; missing and timeout differ',()=>{assert.equal(latencyState(0),'ok');assert.equal(latencyState(null),'timeout');assert.equal(latencyState(false),'off');assert.equal(latencyState(undefined),'off');assert.equal(latencyState(''),'off')})
test('UTC period and quota use distinct, correct directions',()=>{assert.equal(monthTraffic(node,now),100*GB);for(const [type,used] of [['total',100],['dl',80],['ul',20],['max',80]]){const s={...node,traffic_calc_type:type};assert.equal(trafficUsage(s,now),used*GB);assert.equal(trafficPercent(s,now),used)}})
test('over-quota numeric percentage is not clamped to the drawing length',()=>assert.equal(trafficPercent({...node,traffic_limit:50},now),200))
test('non-calendar-month counters are unavailable, not fabricated zero',()=>{assert.equal(monthTraffic({...node,reset_day:15},now),null);assert.equal(trafficUsage({...node,reset_day:15},now),null)})
test('timestamp supports ISO and seconds, unknown date not current time',()=>{assert.equal(normalizeTimestamp(new Date(now).toISOString()),now);assert.equal(normalizeTimestamp(now/1000),now);assert.equal(formatDateTime(null),'—');assert.equal(serverUptimeSeconds({boot_time:String(now-3600000)},now),3600)})
test('region asset paths are validated and preserve supplied region codes',()=>{assert.equal(regionCode('../x'),'');assert.equal(regionCode('TW'),'TW');assert.equal(regionCode('us'),'US')})

test('unknown and zero-denominator resource ratios are not real zero usage', async()=>{
 const {percent,formatPercent,capacityPair}=await import('../src/utils/format.js')
 assert.equal(percent(null,1024),null);assert.equal(percent(0,0),null);assert.equal(percent(0,1024),0)
 assert.equal(formatPercent(null),'—');assert.equal(formatPercent(0),'0%');assert.equal(capacityPair(null,1024),'— / 1 GB')
})
