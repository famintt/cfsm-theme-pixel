/**
 * Read-only CF-Server-Monitor adapter; construction is inert.
 * Await start(), refresh(), setDetail(id|null), resume(), or stop(). Failures are
 * reported through onError, never replaced with demo data. onState receives
 * { config, sysConfig, servers, selectedServer }; MB / bytes units are unchanged.
 * Only a single same-origin backend is supported. The UI owns navigation;
 * start() also understands #/server/:id. Multiple/cross-origin bases fail closed.
 * Config is anonymous: the upstream authenticated config handler performs a
 * remote version lookup. Data requests reuse same-origin cookies / jwt_token /
 * turnstile_verified, never URL tokens. Login and Turnstile use /admin#/admin.
 */
const POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const SOCKET_OPEN_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// These fields are excluded from live samples or are owned by REST configuration/history.
const REST_OWNED_FIELDS = [
  'name', 'tags', 'server_group', 'price', 'billing_cycle', 'auto_renewal', 'currency',
  'expire_date', 'traffic_limit', 'traffic_calc_type', 'interface', 'reset_day',
  'collect_interval', 'report_interval', 'wss_report_interval', 'connection_mode',
  'is_hidden', 'sort_order', 'ping_mode', 'node_1', 'node_2', 'node_3', 'node_4',
  'rx_correction', 'tx_correction', 'traffic_alert_percent', 'traffic_alert_state', 'history_partition_id',
  'custom_ct', 'custom_cu', 'custom_cm', 'custom_bd', 'offline_notify_disabled',
  'region', 'arch', 'os', 'kernel_version', 'cpu_info', 'cpu_cores', 'boot_time',
  'net_rx_monthly', 'net_tx_monthly', 'ip_v4', 'ip_v6', 'ping', 'loss',
  'latestReportUpdates', 'sysConfig'
];
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9._:-]{1,64}$/.test(id)
  && !UNSAFE_KEYS.has(id) && id.toLowerCase() !== 'all';

class MonitorError extends Error {
  constructor(message, status = 0, needsAuth = false, needsTurnstile = false) {
    super(message);
    this.status = status;
    this.needsAuth = needsAuth;
    this.needsTurnstile = needsTurnstile;
  }
}

function copy(value, depth = 0) {
  if (depth > 40) throw new MonitorError('监控响应的数据嵌套过深。');
  if (Array.isArray(value)) return value.map(item => copy(item, depth + 1));
  if (!isObject(value)) return value;
  const result = {};
  for (const key of Object.keys(value)) {
    if (!UNSAFE_KEYS.has(key)) result[key] = copy(value[key], depth + 1);
  }
  return result;
}

// Real zero is distinct from missing; tolerate seconds and ISO timestamps.
function timestamp(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) return number > 0 && number < 1e10 ? number * 1000 : number;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function firstTimestamp(...values) {
  for (const value of values) {
    const result = timestamp(value);
    if (result !== null) return result;
  }
  return null;
}
// REST timestamp is the configuration creation time; last_updated dates its metrics.
const sampleTime = server => firstTimestamp(server?.sample_timestamp, server?.last_updated, server?.timestamp);
const reportTime = server => firstTimestamp(server?.report_timestamp, server?.last_updated);
function httpError(status) {
  if (status === 401) return new MonitorError('需要登录后查看，请前往 /admin#/admin 完成验证后重试。', status, true);
  if (status === 403) return new MonitorError('访问被拒绝；如已启用人机验证，请前往 /admin#/admin 完成验证后重试。', status, false, true);
  if (status === 404) return new MonitorError('监控资源不存在或当前账号无权查看。', status);
  if (status === 409) return new MonitorError('后端数据库需要升级，请联系站点管理员。', status);
  return new MonitorError('监控接口请求失败，请稍后重试。', status);
}

export function createMonitorClient({ onState, onError, onStatus } = {}) {
  let config = null;
  let sysConfig = {};
  let servers = new Map();
  let lastSampleTimes = new Map();
  let liveSampleIds = new Set();
  let selectedId = null;
  let detailChosen = false;
  let configLoaded = false;
  let base = null;
  let started = false;
  let pausedByTimeout = false;
  let autoBlocked = false;
  let epoch = 0;
  let flight = null;
  let socket = null;
  let retryDelay = 2_000;
  let pollTimer = null;
  let reconnectTimer = null;
  let lifetimeTimer = null;
  let openTimer = null;
  let heartbeatTimer = null;
  let heartbeatAckTimer = null;
  let lifetimeDeadline = null;
  let visibilityDocument = null;
  const requests = new Map();

  function hidden() {
    const doc = globalThis.document;
    return !!doc && (doc.hidden === true || doc.visibilityState === 'hidden');
  }
  function snapshot() {
    return {
      config: copy(config), sysConfig: copy(sysConfig),
      servers: [...servers.values()].map(server => copy(server)),
      selectedServer: selectedId === null ? null : copy(servers.get(selectedId) || null)
    };
  }
  function notify(callback, value) {
    if (typeof callback === 'function') {
      try { callback(value); } catch { /* view callbacks cannot break transport */ }
    }
  }
  function emitState() { notify(onState, snapshot()); }
  function status(kind, message) { notify(onStatus, { kind, message }); }
  function error(reason) {
    const known = reason instanceof MonitorError ? reason : new MonitorError('监控连接异常，请稍后重试。');
    const safe = {
      message: known.message, status: known.status,
      needsAuth: known.needsAuth, needsTurnstile: known.needsTurnstile
    };
    const token = epoch;
    notify(onError, safe);
    if (token === epoch) status('error', safe.message);
    return known;
  }
  function resolveBase() {
    const location = globalThis.location || globalThis.window?.location;
    if (!location || !/^https?:$/.test(location.protocol)) {
      throw new MonitorError('请通过 HTTP 或 HTTPS 打开主题；不能从本地文件连接监控接口。');
    }
    const origin = new URL(location.origin);
    const meta = globalThis.document?.querySelector?.('meta[name="apiBase"]');
    const raw = meta?.content ?? meta?.getAttribute?.('content') ?? '';
    const values = String(raw).split(',').map(value => value.trim()).filter(Boolean);
    if (values.length > 1) throw new MonitorError('此主题连接器仅支持单个同源后端，不支持多个 apiBase。');
    let url;
    try { url = new URL(values[0] || origin.origin, origin.origin); }
    catch { throw new MonitorError('apiBase 配置无效，请配置单个同源根地址。'); }
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin.origin) {
      throw new MonitorError('此主题连接器仅支持同源 apiBase，已阻止跨源请求及凭证转发。');
    }
    if (url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
      throw new MonitorError('apiBase 必须是单个同源根地址，不能包含路径、凭证、查询或片段。');
    }
    return url.origin;
  }
  function initialDetail() {
    const hash = (globalThis.location || globalThis.window?.location)?.hash || '';
    if (!hash.startsWith('#/server/')) return null;
    let id;
    try { id = decodeURIComponent(hash.slice('#/server/'.length)); }
    catch { throw new MonitorError('服务器详情地址无效。'); }
    if (!validId(id)) throw new MonitorError('服务器 ID 无效，已阻止详情请求。');
    return id;
  }
  function readStorage(key) {
    const storages = key === 'turnstile_verified' ? ['sessionStorage', 'localStorage'] : ['localStorage'];
    for (const name of storages) {
      try {
        const value = globalThis[name]?.getItem(key);
        if (typeof value === 'string' && value.length <= 16_384 && !/[\r\n]/.test(value) && value) return value;
      } catch { /* optional browser storage */ }
    }
    return '';
  }
  function closeSocket() {
    clearTimeout(openTimer); openTimer = null;
    clearTimeout(heartbeatTimer); heartbeatTimer = null;
    clearTimeout(heartbeatAckTimer); heartbeatAckTimer = null;
    const previous = socket;
    socket = null;
    if (!previous) return;
    previous.onopen = previous.onmessage = previous.onerror = previous.onclose = null;
    try { previous.close(1000, 'monitor view suspended'); } catch { /* already closed */ }
  }
  function invalidate() {
    epoch += 1;
    clearTimeout(pollTimer); pollTimer = null;
    clearTimeout(reconnectTimer); reconnectTimer = null;
    clearTimeout(lifetimeTimer); lifetimeTimer = null;
    closeSocket();
    for (const [controller, timer] of requests) {
      clearTimeout(timer);
      controller.abort();
    }
    requests.clear();
    flight = null;
  }
  function alive(token) { return started && token === epoch && !pausedByTimeout && !hidden(); }
  function expired() { return lifetimeDeadline !== null && Date.now() >= lifetimeDeadline; }
  function pauseForTimeout() {
    pausedByTimeout = true;
    invalidate();
    status('paused', '已达到站点设置的实时连接时限；请点击继续连接以恢复。');
  }
  function guard() {
    if (!started) return false;
    if (pausedByTimeout || expired()) {
      if (!pausedByTimeout) pauseForTimeout();
      else status('paused', '实时连接已暂停，请点击继续连接以恢复。');
      return false;
    }
    if (hidden()) {
      status('paused', '页面已隐藏，实时连接和轮询已暂停。');
      return false;
    }
    return true;
  }
  function scheduleLifetime() {
    clearTimeout(lifetimeTimer); lifetimeTimer = null;
    const minutes = Number(config?.frontend_ws_timeout_minutes);
    const duration = Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes * 60_000 : 0;
    if (!duration) return;
    if (lifetimeDeadline === null) lifetimeDeadline = Date.now() + duration;
    if (expired()) { pauseForTimeout(); return; }
    lifetimeTimer = setTimeout(pauseForTimeout, lifetimeDeadline - Date.now());
  }
  async function getJSON(path, token, anonymous = false) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    requests.set(controller, timer);
    const headers = { Accept: 'application/json' };
    if (!anonymous) {
      const jwt = readStorage('jwt_token');
      const verified = readStorage('turnstile_verified');
      if (jwt) headers.Authorization = `Bearer ${jwt}`;
      if (verified) headers['X-Turnstile-Verified'] = verified;
    }
    try {
      const response = await globalThis.fetch(new URL(path, base).href, {
        method: 'GET', credentials: anonymous ? 'omit' : 'same-origin',
        cache: 'no-store', redirect: 'error', headers, signal: controller.signal
      });
      if (!alive(token)) return null;
      const responseStatus = Number.isInteger(response.status) ? response.status : 0;
      if (!response.ok) throw httpError(responseStatus);
      let result;
      try { result = await response.json(); }
      catch (reason) {
        if (timedOut || !(reason instanceof SyntaxError)) throw reason;
        throw new MonitorError('监控接口未返回有效 JSON；请检查后端地址或登录状态。', responseStatus);
      }
      if (!alive(token)) return null;
      if (!isObject(result) || hasOwn(result, 'error') || result.success === false) {
        throw new MonitorError('监控接口返回了错误或不符合约定的数据。', responseStatus);
      }
      return copy(result);
    } catch (reason) {
      if (!alive(token)) return null;
      if (reason instanceof MonitorError) throw reason;
      throw new MonitorError(timedOut ? '监控请求超时，请稍后重试。' : '无法读取监控接口，请检查网络和后端配置。');
    } finally {
      clearTimeout(timer);
      requests.delete(controller);
    }
  }
  function ingestREST(payload, id) {
    const values = id === null ? payload.servers : [payload];
    if (!Array.isArray(values) || values.some(value => !isObject(value) || !validId(value.id))) {
      throw new MonitorError('服务器接口返回了无效的列表或服务器 ID。', 200);
    }
    if (id !== null && payload.id !== id) throw new MonitorError('详情接口返回的服务器与请求不匹配。', 200);
    const next = new Map();
    const times = new Map();
    const liveIds = new Set();
    for (const value of values) {
      if (next.has(value.id)) throw new MonitorError('服务器接口返回了重复 ID。', 200);
      const incoming = copy(value);
      const previous = servers.get(value.id);
      const previousTs = sampleTime(previous);
      const incomingTs = sampleTime(incoming);
      // Equal-time REST metrics can be history aggregates, not instantaneous readings.
      const keepLive = previous && lastSampleTimes.has(value.id) && previousTs !== null
        && (incomingTs === null || previousTs > incomingTs
          || (previousTs === incomingTs && liveSampleIds.has(value.id)));
      const merged = keepLive ? { ...incoming, ...previous, id: value.id } : incoming;
      if (keepLive) {
        for (const key of REST_OWNED_FIELDS) {
          if (hasOwn(incoming, key)) merged[key] = incoming[key];
          else delete merged[key];
        }
        if (liveSampleIds.has(value.id)) liveIds.add(value.id);
      }
      const sampleTs = keepLive ? previousTs : incomingTs;
      if (sampleTs !== null) {
        merged.sample_timestamp = sampleTs;
        times.set(value.id, sampleTs);
      }
      const previousReport = reportTime(previous);
      const incomingReport = reportTime(merged);
      if (previousReport !== null && (incomingReport === null || previousReport > incomingReport)) {
        merged.last_updated = previousReport;
        merged.report_timestamp = previousReport;
      }
      next.set(value.id, merged);
    }
    if (payload.sysConfig !== undefined && !isObject(payload.sysConfig)) {
      throw new MonitorError('监控接口返回了无效的站点显示配置。', 200);
    }
    sysConfig = { ...sysConfig, ...copy(payload.sysConfig || {}) };
    servers = next;
    lastSampleTimes = times;
    liveSampleIds = liveIds;
    // No latestReportUpdates replay and no synthetic ping/loss window points.
  }
  function ingestMessage(message) {
    if (!isObject(message)) throw new MonitorError('实时通道返回了无效消息。');
    if (message.type !== 'batchUpdate') return;
    if (!Array.isArray(message.updates)) throw new MonitorError('实时批次缺少有效的 updates 数组。');
    const events = [];
    let order = 0;
    for (const update of message.updates) {
      if (!isObject(update) || !validId(update.serverId) || !servers.has(update.serverId)) continue;
      if (selectedId !== null && update.serverId !== selectedId) continue;
      if (!Array.isArray(update.samples)) throw new MonitorError('实时批次缺少有效的 samples 数组。');
      for (const sample of update.samples) {
        if (!isObject(sample)) continue;
        const data = sample.data || sample.payload || sample.metrics;
        if (!isObject(data)) continue;
        const ts = firstTimestamp(sample.ts, sample.timestamp, data.sample_timestamp, data.timestamp,
          data.last_updated, update.ts, message.ts);
        if (ts === null) throw new MonitorError('实时样本缺少有效的采样时间。');
        const reportTs = firstTimestamp(update.reportTs, update.report_timestamp, message.ts,
          data.report_timestamp, data.last_updated, ts);
        events.push({ id: update.serverId, data: copy(data), ts, reportTs, order: order++ });
      }
    }
    events.sort((a, b) => a.ts - b.ts || a.order - b.order);
    let changed = false;
    for (const event of events) {
      const previousTs = lastSampleTimes.get(event.id);
      const previous = servers.get(event.id);
      const previousReport = reportTime(previous);
      const reportTs = previousReport === null ? event.reportTs : Math.max(previousReport, event.reportTs);
      if (previousTs !== undefined && event.ts < previousTs) {
        if (previousReport === null || reportTs > previousReport) {
          servers.set(event.id, { ...previous, last_updated: reportTs, report_timestamp: reportTs });
          changed = true;
        }
        continue;
      }
      servers.set(event.id, {
        ...previous, ...event.data, id: event.id,
        timestamp: event.ts, sample_timestamp: event.ts,
        last_updated: reportTs, report_timestamp: reportTs
      });
      lastSampleTimes.set(event.id, event.ts);
      liveSampleIds.add(event.id);
      changed = true;
    }
    // Process every incremental sample, then render once per message.
    if (changed) emitState();
  }
  function schedulePoll() {
    clearTimeout(pollTimer); pollTimer = null;
    if (!started || pausedByTimeout || hidden() || autoBlocked) return;
    pollTimer = setTimeout(() => { pollTimer = null; void loadCurrent(false); }, POLL_MS);
  }
  function scheduleReconnect() {
    if (reconnectTimer !== null || !started || pausedByTimeout || hidden() || autoBlocked) return;
    const delay = retryDelay;
    retryDelay = Math.min(30_000, retryDelay * 2);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void loadCurrent(false); }, delay);
  }
  // The broadcaster lowercases scopes but preserves each all-scope filter ID.
  function usesIdFilter() { return selectedId === null || selectedId !== selectedId.toLowerCase(); }
  function subscription(target) {
    target.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids: [...servers.keys()] }));
  }
  function connectSocket(token) {
    if (!alive(token)) return;
    if (selectedId === null && servers.size > 500) {
      status('polling', '服务器超过实时订阅的 500 台限制，当前每 60 秒刷新。');
      closeSocket();
      return;
    }
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
      if (socket.readyState === 1 && usesIdFilter()) {
        try { subscription(socket); }
        catch { closeSocket(); scheduleReconnect(); status('polling', '实时订阅失败，已改为定时刷新。'); }
      }
      return;
    }
    if (typeof globalThis.WebSocket !== 'function') {
      status('polling', '浏览器不支持实时通道，当前每 60 秒刷新。');
      return;
    }
    clearTimeout(reconnectTimer); reconnectTimer = null;
    const url = new URL('/api/ws', base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('subscribe', usesIdFilter() ? 'all' : selectedId);
    let current;
    try { current = new globalThis.WebSocket(url.href); }
    catch {
      error(new MonitorError('无法建立实时通道，已保留 REST 定时刷新。'));
      if (!alive(token)) return;
      status('polling', '实时通道不可用，当前每 60 秒刷新。');
      scheduleReconnect();
      return;
    }
    socket = current;
    const isCurrent = () => socket === current && alive(token);
    function disconnected(message) {
      if (!isCurrent()) return;
      closeSocket();
      status('polling', message);
      scheduleReconnect();
      schedulePoll();
    }
    openTimer = setTimeout(() => disconnected('实时通道连接超时，已改为定时刷新。'), SOCKET_OPEN_TIMEOUT_MS);
    current.onopen = () => {
      if (!isCurrent()) return;
      clearTimeout(openTimer); openTimer = null;
      try { if (usesIdFilter()) subscription(current); }
      catch { disconnected('实时订阅失败，已改为定时刷新。'); return; }
      retryDelay = 2_000;
      status('live', '实时连接已建立。');
      if (!isCurrent()) return;
      function heartbeat() {
        if (!isCurrent()) return;
        heartbeatAckTimer = setTimeout(() => disconnected('实时心跳超时，已改为定时刷新。'), HEARTBEAT_TIMEOUT_MS);
        try { current.send(JSON.stringify({ type: 'ping' })); }
        catch { disconnected('实时通道已中断，已改为定时刷新。'); return; }
        heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_MS);
      }
      heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_MS);
    };
    current.onmessage = event => {
      if (!isCurrent()) return;
      try {
        if (typeof event.data !== 'string') throw new MonitorError('实时通道未返回有效 JSON 文本。');
        let message;
        try { message = JSON.parse(event.data); }
        catch { throw new MonitorError('实时通道返回了无效 JSON，已忽略该消息。'); }
        if (isObject(message)) { clearTimeout(heartbeatAckTimer); heartbeatAckTimer = null; }
        if (message?.type === 'ping') {
          current.send(JSON.stringify({ type: 'pong', ts: message.ts ?? Date.now() }));
          return;
        }
        ingestMessage(message);
        if (isCurrent()) status('live', '实时连接已建立。');
      } catch (reason) { error(reason); }
    };
    current.onerror = () => {
      if (!isCurrent()) return;
      error(new MonitorError('实时通道连接失败，已保留 REST 定时刷新。'));
      disconnected('实时通道不可用，当前每 60 秒刷新。');
    };
    current.onclose = () => disconnected('实时通道已断开，正在使用定时刷新并尝试重连。');
  }
  function loadCurrent(explicit) {
    if (!guard()) return Promise.resolve(snapshot());
    if (flight && flight.epoch === epoch) return flight.promise;
    if (autoBlocked && !explicit) return Promise.resolve(snapshot());
    if (explicit) autoBlocked = false;
    // invalidate() clears the timer, not the deadline; re-arm it before catch-up I/O.
    if (lifetimeDeadline !== null) scheduleLifetime();
    const token = epoch;
    const id = selectedId;
    const promise = Promise.resolve().then(async () => {
      try {
        if (!alive(token)) return snapshot();
        if (!socket || socket.readyState !== 1) status('connecting', '正在读取监控数据…');
        if (!alive(token)) return snapshot();
        if (!configLoaded) {
          const payload = await getJSON('/api/config', token, true);
          if (!alive(token)) return snapshot();
          config = payload;
          configLoaded = true;
          emitState();
        }
        if (!alive(token)) return snapshot();
        const path = id === null ? '/api/servers' : `/api/server?id=${encodeURIComponent(id)}`;
        const payload = await getJSON(path, token);
        if (!alive(token)) return snapshot();
        ingestREST(payload, id);
        emitState();
        if (!alive(token)) return snapshot();
        scheduleLifetime();
        if (!alive(token)) return snapshot();
        connectSocket(token);
        schedulePoll();
      } catch (reason) {
        if (!alive(token)) return snapshot();
        const known = error(reason);
        if (!alive(token)) return snapshot();
        autoBlocked = known.needsAuth || known.needsTurnstile
          || (known.status >= 200 && known.status < 500 && ![408, 425, 429].includes(known.status));
        if (autoBlocked) closeSocket();
        clearTimeout(reconnectTimer); reconnectTimer = null;
        schedulePoll();
      } finally {
        if (flight?.epoch === token) flight = null;
      }
      return snapshot();
    });
    flight = { epoch: token, promise };
    return promise;
  }
  function visibilityChanged() {
    if (!started) return;
    if (hidden()) {
      if (expired()) pausedByTimeout = true;
      invalidate();
      status('paused', pausedByTimeout ? '实时连接已达到时限，请点击继续连接以恢复。' : '页面已隐藏，实时连接和轮询已暂停。');
      return;
    }
    if (guard()) void loadCurrent(false);
  }
  function start() {
    if (started) return flight?.promise || Promise.resolve(snapshot());
    try {
      base = resolveBase();
      if (!detailChosen) selectedId = initialDetail();
    } catch (reason) {
      error(reason);
      return Promise.resolve(snapshot());
    }
    started = true;
    pausedByTimeout = false;
    autoBlocked = false;
    configLoaded = false;
    lifetimeDeadline = null;
    retryDelay = 2_000;
    visibilityDocument = globalThis.document || null;
    visibilityDocument?.addEventListener?.('visibilitychange', visibilityChanged);
    return loadCurrent(true);
  }
  function refresh() { return started ? loadCurrent(true) : start(); }
  function setDetail(id) {
    if (id !== null && !validId(id)) {
      error(new MonitorError('服务器 ID 无效，已阻止详情请求。'));
      return Promise.resolve(snapshot());
    }
    detailChosen = true;
    if (id === selectedId) return flight?.promise || Promise.resolve(snapshot());
    selectedId = id;
    invalidate();
    autoBlocked = false;
    const cached = id === null ? null : servers.get(id);
    servers = new Map(cached ? [[id, cached]] : []);
    lastSampleTimes = new Map(cached && sampleTime(cached) !== null ? [[id, sampleTime(cached)]] : []);
    liveSampleIds = new Set(cached && liveSampleIds.has(id) ? [id] : []);
    emitState();
    return started ? loadCurrent(true) : Promise.resolve(snapshot());
  }
  function resume() {
    if (!started) return start();
    if (!pausedByTimeout && !expired()) return refresh();
    pausedByTimeout = false;
    lifetimeDeadline = null;
    autoBlocked = false;
    return loadCurrent(true);
  }
  function stop() {
    started = false;
    invalidate();
    visibilityDocument?.removeEventListener?.('visibilitychange', visibilityChanged);
    visibilityDocument = null;
    status('paused', '监控连接已停止。');
    return Promise.resolve(snapshot());
  }
  return { start, refresh, stop, setDetail, resume };
}
