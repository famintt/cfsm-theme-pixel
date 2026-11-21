import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// No root package.json or source rewrite needed. The browser keeps client.js as
// an ordinary ES module; Node imports the exact same bytes through a data URL.
const source = await readFile(new URL('../src/utils/client.js', import.meta.url), 'utf8');
const { createMonitorClient } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const T = 1_800_000_000_000;
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });
const node = (id = 'node-1', extra = {}) => ({
  id, name: `Server ${id}`, region: 'HK', os: 'Ubuntu', tags: 'edge,prod',
  cpu: 22, ram_total: 8192, ram_used: 1024, disk_total: 20480, disk_used: 8192,
  net_in_speed: 4096, net_rx: 1_234_567_890, timestamp: T, last_updated: T,
  ping: [{ ts: T - 300_000, ct: 22, cu: null, cm: 0, bd: 28 }],
  loss: [{ ts: T - 300_000, ct: 0, cu: null, cm: 0, bd: 0 }], ...extra
});

class Clock {
  now = T + 10_000;
  next = 1;
  timers = new Map();
  set = (fn, delay = 0) => {
    const id = this.next++;
    this.timers.set(id, { at: this.now + Math.max(0, Number(delay)), fn });
    return id;
  };
  clear = id => { this.timers.delete(id); };
  async tick(ms) {
    const until = this.now + ms;
    let guard = 0;
    for (;;) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > until) break;
      assert.ok(guard++ < 2000, 'timer loop must terminate');
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].fn();
      await flush();
    }
    this.now = until;
    await flush();
  }
}
class Page extends EventTarget {
  hidden = false;
  visibilityState = 'visible';
  meta = '';
  listeners = new Set();
  querySelector() { return this.meta ? { content: this.meta } : null; }
  addEventListener(type, fn) { super.addEventListener(type, fn); if (type === 'visibilitychange') this.listeners.add(fn); }
  removeEventListener(type, fn) { super.removeEventListener(type, fn); this.listeners.delete(fn); }
  setHidden(value) {
    this.hidden = value;
    this.visibilityState = value ? 'hidden' : 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function setup(t, options = {}) {
  const clock = new Clock();
  const page = new Page();
  page.meta = options.meta || '';
  page.hidden = options.hidden || false;
  page.visibilityState = page.hidden ? 'hidden' : 'visible';
  const sockets = [];
  const calls = [];
  const states = [];
  const errors = [];
  const statuses = [];
  const storageReads = [];
  let handler = options.handler;
  const saved = new Map();
  function mock(key, value) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  class Socket {
    readyState = 0;
    sent = [];
    closed = 0;
    constructor(url) { this.url = url; sockets.push(this); }
    send(text) {
      assert.equal(this.readyState, 1);
      const message = JSON.parse(text);
      this.sent.push(message);
      if (message.type === 'ping' && !options.noPong) {
        queueMicrotask(() => { if (this.readyState === 1) this.message({ type: 'pong' }); });
      }
    }
    open() { this.readyState = 1; this.onopen?.({}); }
    message(value) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
    close() { this.readyState = 3; this.closed += 1; this.onclose?.({ code: 1000 }); }
    disconnect() { this.readyState = 3; this.onclose?.({ code: 1006, reason: 'SECRET-WS-REASON' }); }
    fail() { this.onerror?.(new Error('SECRET-WS-ERROR')); }
  }
  mock('location', { origin: 'https://monitor.example', protocol: 'https:', host: 'monitor.example', hash: options.hash || '#/' });
  mock('document', page);
  mock('sessionStorage', { getItem(key) { return options.sessionStorage?.[key] || null; } });
  mock('localStorage', { getItem(key) {
    storageReads.push(key);
    if (options.storageThrows) throw new Error('SECRET-STORAGE');
    return options.storage?.[key] || null;
  } });
  mock('fetch', async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://monitor.example', 'never request another origin');
    assert.equal(init.method, 'GET', 'never mutate the backend');
    assert.equal(init.redirect, 'error', 'never follow a credential-bearing redirect');
    const call = { url: parsed, init };
    calls.push(call);
    if (handler) return handler(call, calls.length);
    if (parsed.pathname === '/api/config') return response({
      site_title: 'Configured monitor', preferred_theme: 'light', theme_options: { compact: true },
      frontend_ws_timeout_minutes: options.minutes || 0, is_public: true
    });
    if (parsed.pathname === '/api/server') return response({ ...node(parsed.searchParams.get('id')), sysConfig: { long_history_points: 120 } });
    assert.equal(parsed.pathname, '/api/servers');
    return response({ servers: options.servers || [node()], sysConfig: { show_three_net_details: true },
      latestReportUpdates: [{ serverId: 'node-1', samples: [{ ts: T + 5000, data: { cpu: 99 } }] }] });
  });
  mock('WebSocket', options.noWS ? undefined : Socket);
  mock('setTimeout', clock.set);
  mock('clearTimeout', clock.clear);
  const originalNow = Date.now;
  Date.now = () => clock.now;
  const client = createMonitorClient({
    onState: value => { states.push(value); options.onState?.(value); },
    onError: value => { errors.push(value); options.onError?.(value); },
    onStatus: value => { statuses.push(value); options.onStatus?.(value); }
  });
  t.after(async () => {
    try {
      await client.stop();
      assert.equal(clock.timers.size, 0, 'stop clears every timer');
      assert.equal(page.listeners.size, 0, 'stop removes visibility listener');
    } finally {
      Date.now = originalNow;
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  return { client, clock, page, sockets, calls, states, errors, statuses, storageReads,
    handle: value => { handler = value; }, state: () => states.at(-1), status: () => statuses.at(-1) };
}

function batch(samples, extra = {}) {
  return { type: 'batchUpdate', ts: T + 9000, updates: [{ serverId: 'node-1', samples }], ...extra };
}
test('inert constructor, exact exports, deduplication, raw units and safe GET credentials', async t => {
  const e = setup(t, { storage: { jwt_token: 'existing.jwt', turnstile_verified: 'verified-credential' } });
  assert.deepEqual(Object.keys(e.client).sort(), ['refresh', 'resume', 'setDetail', 'start', 'stop']);
  assert.equal(e.calls.length, 0);
  assert.equal(e.page.listeners.size, 0);
  const p = e.client.start();
  assert.equal(e.client.start(), p);
  assert.equal(e.client.refresh(), p);
  await p;
  assert.equal(e.calls.length, 2);
  assert.equal(e.page.listeners.size, 1);
  assert.equal(e.calls[0].url.pathname, '/api/config');
  assert.equal(e.calls[0].init.credentials, 'omit', 'anonymous bootstrap avoids upstream remote version lookup');
  assert.equal(e.calls[0].init.headers.Authorization, undefined);
  assert.equal(e.calls[0].init.headers['X-Turnstile-Verified'], undefined);
  assert.equal(e.calls[1].init.credentials, 'same-origin');
  assert.equal(e.calls[1].init.headers.Authorization, 'Bearer existing.jwt');
  assert.equal(e.calls[1].init.headers['X-Turnstile-Verified'], 'verified-credential');
  assert.equal(e.calls[1].init.headers['X-Turnstile-Token'], undefined);
  const s = e.state();
  assert.equal(s.config.site_title, 'Configured monitor');
  assert.equal(s.config.preferred_theme, 'light');
  assert.deepEqual(s.config.theme_options, { compact: true });
  assert.equal(s.sysConfig.show_three_net_details, true);
  assert.equal(s.selectedServer, null);
  assert.equal(s.servers[0].ram_total, 8192);
  assert.equal(s.servers[0].disk_total, 20480);
  assert.equal(s.servers[0].net_rx, 1_234_567_890);
  assert.equal(s.servers[0].cpu, 22, 'REST latestReportUpdates is not replayed');
  assert.equal(new URL(e.sockets[0].url).search, '?subscribe=all');
  e.sockets[0].open();
  assert.deepEqual(e.sockets[0].sent[0], { type: 'subscribe', scope: 'all', ids: ['node-1'] });
  assert.equal(e.status().kind, 'live');
  await e.client.start();
  assert.equal(e.calls.length, 2, 'completed start is also idempotent');
  const r = e.client.refresh();
  assert.equal(e.client.refresh(), r);
  await r;
  assert.equal(e.calls.length, 3);
  assert.equal(e.sockets.length, 1);
  assert.ok(e.calls.every(call => !/admin|history|version|theme_options/.test(call.url.pathname)));
});

test('all aliases and every sample merge in timestamp order; zero/null and static fields survive', async t => {
  const e = setup(t);
  await e.client.start();
  const ws = e.sockets[0]; ws.open();
  const initial = structuredClone(e.state().servers[0]);
  const count = e.states.length;
  ws.message(batch([], { updates: [
    { serverId: 'node-1', samples: [
      { ts: T + 3000, metrics: { cpu: 0, net_in_speed: 0, ping_ct: 0, disk: null, id: 'intruder' } },
      { ts: T + 1000, data: { ram_used: 0, disk_used: 0, processes: 0 } }
    ] },
    { serverId: 'node-1', reportTs: T + 8000, samples: [
      { ts: T + 2000, data: null, payload: { ram_used: null, tcp_conn: 0, loss_ct: 0 } },
      { ts: T + 3000, payload: { net_out_speed: 12345 } }
    ] }
  ] }));
  const s = e.state().servers[0];
  assert.equal(s.cpu, 0);
  assert.equal(s.ram_used, null);
  assert.equal(s.disk_used, 0);
  assert.equal(s.processes, 0, 'earliest sample is merged even when not the final sample');
  assert.equal(s.tcp_conn, 0);
  assert.equal(s.net_in_speed, 0);
  assert.equal(s.net_out_speed, 12345);
  assert.equal(s.disk, null);
  assert.equal(s.id, 'node-1');
  assert.equal(s.name, initial.name);
  assert.equal(s.os, initial.os);
  assert.equal(s.ram_total, initial.ram_total);
  assert.equal(s.net_rx, initial.net_rx);
  assert.deepEqual(s.ping, initial.ping);
  assert.deepEqual(s.loss, initial.loss);
  assert.equal(s.timestamp, T + 3000);
  assert.equal(s.sample_timestamp, T + 3000);
  assert.equal(s.last_updated, T + 9000, 'report time never regresses between updates');
  assert.equal(s.report_timestamp, T + 9000);
  assert.equal(e.states.length, count + 1, 'one render per fully processed batch');
  ws.message(batch([{ ts: T + 1000, data: { cpu: 99, name: 'Stale' } }]));
  assert.equal(e.state().servers[0].cpu, 0);
  assert.equal(e.state().servers[0].name, initial.name);
});

test('detail deep link never fetches/subscribes the full list; route switches are narrow', async t => {
  const e = setup(t, { hash: '#/server/node%3A1' });
  await e.client.start();
  assert.deepEqual(e.calls.map(call => call.url.pathname), ['/api/config', '/api/server']);
  assert.equal(e.calls[1].url.searchParams.get('id'), 'node:1');
  assert.equal(new URL(e.sockets[0].url).searchParams.get('subscribe'), 'node:1');
  e.sockets[0].open();
  assert.equal(e.sockets[0].sent.length, 0, 'single-id subscription needs no all-scope message');
  assert.equal(e.state().selectedServer.id, 'node:1');
  await e.client.setDetail('other-2');
  assert.equal(e.sockets[0].closed, 1);
  assert.equal(e.calls.at(-1).url.pathname, '/api/server');
  assert.equal(e.calls.at(-1).url.searchParams.get('id'), 'other-2');
  assert.equal(new URL(e.sockets[1].url).searchParams.get('subscribe'), 'other-2');
  assert.equal(e.state().selectedServer.id, 'other-2');
  assert.equal(e.state().servers.length, 1);
  await e.client.setDetail(null);
  assert.equal(e.calls.at(-1).url.pathname, '/api/servers');
  e.sockets.at(-1).open();
  assert.deepEqual(e.sockets.at(-1).sent[0].ids, ['node-1']);
  assert.equal(e.state().selectedServer, null);
});
test('visibility closes all network activity and visible restoration reads REST before reconnecting', async t => {
  const e = setup(t);
  await e.client.start(); e.sockets[0].open();
  const old = e.sockets[0];
  e.page.setHidden(true);
  assert.equal(old.closed, 1);
  assert.equal(e.status().kind, 'paused');
  assert.equal(e.clock.timers.size, 0);
  await e.clock.tick(180_000);
  assert.equal(e.calls.length, 2);
  assert.equal(e.sockets.length, 1);
  e.page.setHidden(false); await flush();
  assert.equal(e.calls.length, 3);
  assert.equal(e.calls.at(-1).url.pathname, '/api/servers');
  assert.equal(e.sockets.length, 2);
  e.sockets[1].open();
  assert.equal(e.status().kind, 'live');
  await e.client.stop();
  const length = e.calls.length;
  await e.clock.tick(180_000);
  e.page.setHidden(true); e.page.setHidden(false); await flush();
  assert.equal(e.calls.length, length);
  assert.equal(e.page.listeners.size, 0);
  assert.equal(e.clock.timers.size, 0);
});

test('configured lifetime is sticky; refresh/start/navigation/visibility cannot resume it', async t => {
  const e = setup(t, { minutes: 1 });
  await e.client.start(); e.sockets[0].open();
  await e.clock.tick(60_000);
  assert.equal(e.status().kind, 'paused');
  assert.equal(e.sockets[0].closed, 1);
  const count = e.calls.length;
  await e.client.start(); await e.client.refresh(); await e.client.setDetail('node-2');
  e.page.setHidden(true); e.page.setHidden(false);
  await e.clock.tick(240_000);
  assert.equal(e.calls.length, count);
  assert.equal(e.sockets.length, 1);
  await e.client.resume();
  assert.equal(e.calls.length, count + 1);
  assert.equal(e.calls.at(-1).url.pathname, '/api/server');
  assert.equal(e.state().selectedServer.id, 'node-2');
  e.sockets[1].open();
  assert.equal(e.status().kind, 'live');
  await e.clock.tick(60_000);
  assert.equal(e.status().kind, 'paused', 'explicit resume starts a fresh lifetime');
});

test('hiding before deadline or reconnecting cannot reset monitoring lifetime', async t => {
  const e = setup(t, { minutes: 1 });
  await e.client.start(); e.sockets[0].open();
  await e.clock.tick(20_000);
  e.sockets[0].disconnect();
  await e.clock.tick(2000);
  assert.equal(e.sockets.length, 2);
  e.sockets[1].open();
  e.page.setHidden(true);
  await e.clock.tick(40_000);
  const count = e.calls.length;
  e.page.setHidden(false); await flush();
  assert.equal(e.calls.length, count, 'elapsed deadline is checked before visible REST catch-up');
  assert.equal(e.status().kind, 'paused');
  assert.equal(e.sockets.length, 2);
  await e.client.resume();
  assert.equal(e.calls.length, count + 1);
});

test('starting hidden is inert until first visibility change', async t => {
  const e = setup(t, { hidden: true });
  await e.client.start();
  await e.clock.tick(120_000);
  assert.equal(e.calls.length, 0);
  assert.equal(e.sockets.length, 0);
  e.page.setHidden(false); await flush();
  assert.equal(e.calls.length, 2);
  assert.equal(e.sockets.length, 1);
});

test('missing WebSocket falls back to one GET per 60 seconds, never fake live data', async t => {
  const e = setup(t, { noWS: true });
  await e.client.start();
  assert.equal(e.status().kind, 'polling');
  assert.equal(e.sockets.length, 0);
  await e.clock.tick(59_999);
  assert.equal(e.calls.length, 2);
  await e.clock.tick(1);
  assert.equal(e.calls.length, 3);
  assert.equal(e.calls.at(-1).url.pathname, '/api/servers');
  assert.equal(e.state().servers[0].cpu, 22);
});

test('opaque WebSocket failure is sanitized, REST catches up before reconnection', async t => {
  const e = setup(t);
  await e.client.start(); e.sockets[0].open();
  e.sockets[0].fail();
  assert.equal(e.errors.length, 1);
  assert.ok(!JSON.stringify(e.errors).includes('SECRET'));
  assert.equal(e.status().kind, 'polling');
  await e.clock.tick(1999);
  assert.equal(e.calls.length, 2);
  await e.clock.tick(1);
  assert.equal(e.calls.length, 3);
  assert.equal(e.sockets.length, 2);
  e.sockets[1].open();
  assert.deepEqual(e.sockets[1].sent[0], { type: 'subscribe', scope: 'all', ids: ['node-1'] });
});
test('HTTP failures are explicit, sensitive details never escape, auth failures do not loop', async t => {
  for (const code of [401, 403, 404, 409, 500]) {
    await t.test(String(code), async sub => {
      const e = setup(sub, { handler: ({ url }) => url.pathname === '/api/config'
        ? response({ site_title: 'Real site' })
        : response({ error: 'SECRET-TOKEN secret backend path', token: 'SECRET' }, code) });
      await e.client.start();
      assert.equal(e.errors.length, 1);
      assert.equal(e.errors[0].status, code);
      assert.equal(e.errors[0].needsAuth, code === 401);
      assert.equal(e.errors[0].needsTurnstile, code === 403);
      assert.deepEqual(Object.keys(e.errors[0]).sort(), ['message', 'needsAuth', 'needsTurnstile', 'status']);
      assert.ok(!JSON.stringify(e.errors).includes('SECRET'));
      assert.equal(e.status().kind, 'error');
      assert.equal(e.state().servers.length, 0, 'never replace an API failure with demo servers');
      assert.equal(e.sockets.length, 0);
      await e.clock.tick(60_000);
      assert.equal(e.calls.length, code >= 500 ? 3 : 2);
      await e.client.refresh();
      assert.equal(e.calls.length, code >= 500 ? 4 : 3, 'explicit refresh can retry after login');
    });
  }
});

test('invalid JSON, malformed shapes and HTTP-200 error envelopes are visible errors', async t => {
  const invalid = [
    { ok: true, status: 200, json: async () => { throw new SyntaxError('SECRET-JSON'); } },
    response(null), response([]), response({ error: 'SECRET-BODY' }),
    response({ success: false, message: 'SECRET-BODY' }), response({ servers: {} }),
    response({ servers: [node()], sysConfig: [] }), response({ servers: [node(), node()] })
  ];
  for (const [index, body] of invalid.entries()) {
    await t.test(String(index), async sub => {
      const e = setup(sub, { handler: ({ url }) => url.pathname === '/api/config' ? response({}) : body });
      await e.client.start();
      assert.equal(e.errors.length, 1);
      assert.equal(e.status().kind, 'error');
      assert.equal(e.state().servers.length, 0);
      assert.equal(e.sockets.length, 0);
      assert.ok(!JSON.stringify(e.errors).includes('SECRET'));
    });
  }
});

test('WebSocket malformed JSON/shape never throws or corrupts state, next valid update recovers', async t => {
  const e = setup(t);
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  const original = structuredClone(e.state());
  for (const value of ['{ SECRET-INVALID', 'null', '[]', { type: 'batchUpdate', updates: null },
    batch([], { updates: [{ serverId: 'node-1', samples: {} }] })]) {
    assert.doesNotThrow(() => ws.message(value));
  }
  assert.equal(e.errors.length, 5);
  assert.deepEqual(e.state(), original);
  assert.ok(!JSON.stringify(e.errors).includes('SECRET'));
  ws.message({ type: 'hello', ts: T });
  ws.message({ type: 'pong' });
  ws.message({ type: 'ping', ts: 0 });
  assert.deepEqual(ws.sent.at(-1), { type: 'pong', ts: 0 });
  ws.message(batch([{ ts: T + 1000, data: { cpu: 8 } }]));
  assert.equal(e.state().servers[0].cpu, 8);
  assert.equal(e.status().kind, 'live');
});

test('malicious IDs/keys cannot pollute objects, overwrite identity or extend subscription', async t => {
  const e = setup(t);
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  const count = e.calls.length;
  for (const id of ['__proto__', 'constructor', 'prototype', 'all', 'ALL', 'a&admin=1', '../admin', '', 'a'.repeat(65), {}, 42, undefined]) {
    await e.client.setDetail(id);
  }
  assert.equal(e.calls.length, count);
  const malicious = JSON.parse('{"id":"evil","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"cpu":0,"disk":{"__proto__":{"polluted":true},"read_bps":0}}');
  ws.message(batch([{ ts: T + 2000, data: malicious }], { updates: [
    { serverId: '__proto__', samples: [{ ts: T + 1000, data: { polluted: true } }] },
    { serverId: 'unknown', samples: [{ ts: T + 1000, data: { cpu: 98 } }] },
    { serverId: 'node-1', samples: [{ ts: T + 2000, data: malicious }] }
  ] }));
  const current = e.state().servers[0];
  assert.equal(current.id, 'node-1');
  assert.equal(current.cpu, 0);
  assert.equal(current.disk.read_bps, 0);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn(current, '__proto__'), false);
  assert.equal(Object.hasOwn(current, 'constructor'), false);
  assert.equal(e.state().servers.length, 1);
  e.state().servers[0].name = 'View mutation';
  ws.message(batch([{ ts: T + 3000, data: { cpu: 1 } }]));
  assert.equal(e.state().servers[0].name, 'Server node-1', 'snapshots do not expose mutable internal objects');
});
test('malicious REST IDs and bad deep links are rejected without a socket', async t => {
  for (const id of ['__proto__', 'constructor', 'prototype', 'x/y', 'all']) {
    await t.test(`REST ${id}`, async sub => {
      const e = setup(sub, { servers: [node(id)] });
      await e.client.start();
      assert.equal(e.errors.length, 1);
      assert.equal(e.state().servers.length, 0);
      assert.equal(e.sockets.length, 0);
      assert.equal(Object.prototype.polluted, undefined);
    });
  }
  for (const hash of ['#/server/%E0%A4%A', '#/server/%2e%2e%2fadmin', '#/server/__proto__', '#/server/']) {
    await t.test(hash, async sub => {
      const e = setup(sub, { hash });
      await e.client.start();
      assert.equal(e.calls.length, 0);
      assert.equal(e.errors.length, 1);
    });
  }
});

test('multi-origin and cross-origin config fail explicitly; same-origin meta is supported', async t => {
  for (const meta of ['https://monitor.example,https://other.example', 'https://other.example',
    'https://monitor.example/path', 'https://user:secret@monitor.example', 'javascript:alert(1)']) {
    await t.test(meta, async sub => {
      const e = setup(sub, { meta, storage: { jwt_token: 'SECRET-TOKEN' } });
      await e.client.start();
      assert.equal(e.calls.length, 0);
      assert.equal(e.sockets.length, 0);
      assert.equal(e.errors.length, 1);
      assert.equal(e.storageReads.length, 0);
      assert.ok(!JSON.stringify(e.errors).includes('secret'));
    });
  }
  await t.test('same-origin root and disabled storage', async sub => {
    const e = setup(sub, { meta: 'https://monitor.example/', storageThrows: true });
    await e.client.start();
    assert.equal(e.calls.length, 2);
    assert.equal(e.errors.length, 0);
    assert.equal(e.calls[1].init.headers.Authorization, undefined);
    assert.equal(e.calls[1].init.credentials, 'same-origin');
    assert.ok(!e.sockets[0].url.includes('token='));
  });
});

test('server membership changes refresh all-scope ids without opening another socket', async t => {
  const e = setup(t);
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  e.handle(() => response({ servers: [node('node-2'), node('node-3')], sysConfig: { show_price: false } }));
  await e.client.refresh();
  assert.equal(e.sockets.length, 1);
  assert.deepEqual(ws.sent.at(-1), { type: 'subscribe', scope: 'all', ids: ['node-2', 'node-3'] });
  assert.equal(e.state().sysConfig.show_price, false);
  assert.deepEqual(e.state().servers.map(server => server.id), ['node-2', 'node-3']);
});

test('slow REST cannot regress a newer WebSocket sample', async t => {
  const e = setup(t);
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  let finish;
  e.handle(() => new Promise(resolve => { finish = resolve; }));
  const request = e.client.refresh(); await flush();
  ws.message(batch([{ ts: T + 3000, data: { cpu: 7, ram_used: 0 } }]));
  finish(response({ servers: [node()], sysConfig: {} }));
  await request;
  assert.equal(e.state().servers[0].cpu, 7);
  assert.equal(e.state().servers[0].ram_used, 0);
  assert.equal(e.state().servers[0].timestamp, T + 3000);
});

test('detail switch cancels pending old route and ignores its eventual stale completion', async t => {
  let finish;
  const e = setup(t, { hash: '#/server/old', handler: ({ url }) => {
    if (url.pathname === '/api/config') return response({});
    if (url.searchParams.get('id') === 'old') return new Promise(resolve => { finish = resolve; });
    return response(node(url.searchParams.get('id')));
  } });
  const oldRequest = e.client.start(); await flush();
  const oldSignal = e.calls[1].init.signal;
  await e.client.setDetail('new');
  assert.equal(oldSignal.aborted, true);
  finish(response(node('old'))); await oldRequest;
  assert.equal(e.state().selectedServer.id, 'new');
  assert.equal(e.sockets.length, 1);
  assert.equal(new URL(e.sockets[0].url).searchParams.get('subscribe'), 'new');
  assert.equal(e.errors.length, 0);
});

test('stop before queued start performs no request; pending requests abort without errors', async t => {
  const e = setup(t);
  const request = e.client.start();
  await e.client.stop(); await request;
  assert.equal(e.calls.length, 0);
  assert.equal(e.clock.timers.size, 0);
  e.handle(({ init }) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('SECRET-ABORT')))));
  const next = e.client.start(); await flush();
  assert.equal(e.calls.length, 1);
  await e.client.stop(); await next;
  assert.equal(e.calls[0].init.signal.aborted, true);
  assert.equal(e.errors.length, 0);
  assert.equal(e.clock.timers.size, 0);
});

test('request timeout reports safe error and permits bounded polling retry', async t => {
  const e = setup(t, { handler: ({ init }) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('SECRET-ABORT')));
  }) });
  const request = e.client.start(); await flush();
  await e.clock.tick(15_000); await request;
  assert.equal(e.errors.length, 1);
  assert.match(e.errors[0].message, /超时/);
  assert.ok(!JSON.stringify(e.errors).includes('SECRET'));
  assert.equal(e.errors[0].status, 0);
  assert.equal(e.sockets.length, 0);
  assert.equal(e.clock.timers.size, 1, 'only one retry timer remains');
});

test('more than 500 servers explicitly use polling rather than truncate ids', async t => {
  const e = setup(t, { servers: Array.from({ length: 501 }, (_, index) => node(`n-${index}`)) });
  await e.client.start();
  assert.equal(e.state().servers.length, 501);
  assert.equal(e.status().kind, 'polling');
  assert.match(e.status().message, /500/);
  assert.equal(e.sockets.length, 0);
  await e.clock.tick(60_000);
  assert.equal(e.calls.length, 3);
});

test('REST ordering uses last_updated, not the server configuration creation timestamp', async t => {
  const e = setup(t, { servers: [node('node-1', { timestamp: T - 86_400_000, last_updated: T })] });
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  ws.message(batch([{ ts: T - 1000, data: { cpu: 99 } }]));
  assert.equal(e.state().servers[0].cpu, 22, 'a delayed sample must not replace newer REST metrics');
  ws.message(batch([{ ts: T + 1000, data: { cpu: 7 } }]));
  e.handle(() => response({ servers: [node('node-1', {
    timestamp: T - 86_400_000, last_updated: T + 2000, cpu: 31
  })] }));
  await e.client.refresh();
  assert.equal(e.state().servers[0].cpu, 31, 'newer REST data must catch up after live updates');
});

test('older REST metrics do not prevent fresh metadata, billing and history from loading', async t => {
  const e = setup(t, { servers: [node('node-1', { connection_mode: 'auto', price: 10 })] });
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  ws.message(batch([{ ts: T + 3000, data: { cpu: 7 } }]));
  const ping = [{ ts: T + 1000, ct: 44 }];
  e.handle(() => response({ servers: [node('node-1', {
    name: 'Renamed', tags: 'new', server_group: 'New group', price: 25, connection_mode: 'wss',
    expire_date: '2030-01-01', ping, loss: []
  })] }));
  await e.client.refresh();
  const s = e.state().servers[0];
  assert.equal(s.cpu, 7, 'retain the newer live reading');
  assert.equal(s.name, 'Renamed');
  assert.equal(s.tags, 'new');
  assert.equal(s.server_group, 'New group');
  assert.equal(s.price, 25);
  assert.equal(s.connection_mode, 'wss');
  assert.equal(s.expire_date, '2030-01-01');
  assert.deepEqual(s.ping, ping);
  assert.deepEqual(s.loss, []);
});

test('REST aggregates at the same sample time do not overwrite instantaneous live metrics', async t => {
  // A created/imported server can share its configuration timestamp with its first sample.
  const e = setup(t);
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  ws.message(batch([{ ts: T, data: { cpu: 7 } }]));
  e.handle(() => response({ servers: [node('node-1', { cpu: 55 })] }));
  await e.client.refresh();
  assert.equal(e.state().servers[0].cpu, 7);
  assert.equal(e.state().servers[0].last_updated, T + 9000, 'do not regress the live report time');
});

test('a newer report for an older sample refreshes liveness without regressing metrics', async t => {
  const e = setup(t);
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  e.clock.now = T + 600_000;
  ws.message(batch([{ ts: T - 1000, data: { cpu: 99 } }], { ts: T + 600_000 }));
  assert.equal(e.state().servers[0].cpu, 22);
  assert.equal(e.state().servers[0].sample_timestamp ?? e.state().servers[0].timestamp, T);
  assert.equal(e.state().servers[0].last_updated, T + 600_000);
});

test('half-open sockets time out when heartbeats receive no reply', async t => {
  const e = setup(t, { noPong: true });
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  await e.clock.tick(25_000);
  assert.deepEqual(ws.sent.at(-1), { type: 'ping' });
  await e.clock.tick(10_000);
  assert.equal(ws.closed, 1, 'an OPEN but unreachable connection must be replaced');
  assert.equal(e.status().kind, 'polling');
  await e.clock.tick(2000);
  assert.equal(e.calls.length, 3, 'read REST before reconnecting');
  assert.equal(e.sockets.length, 2);
});

test('visibility restoration and navigation retain the deadline while REST is pending', async t => {
  for (const action of ['visibility', 'navigation']) {
    await t.test(action, async sub => {
      const e = setup(sub, { minutes: 1 });
      await e.client.start(); e.sockets[0].open();
      await e.clock.tick(55_000);
      e.handle(({ init }) => new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('SECRET-ABORT')));
      }));
      let pending;
      if (action === 'visibility') {
        e.page.setHidden(true); e.page.setHidden(false);
      } else pending = e.client.setDetail('node-2');
      await flush();
      const signal = e.calls.at(-1).init.signal;
      await e.clock.tick(5000);
      assert.equal(signal.aborted, true, 'the existing deadline cancels catch-up work on time');
      assert.equal(e.status().kind, 'paused');
      assert.equal(e.clock.timers.size, 0);
      if (pending) await pending;
    });
  }
});

test('body-read timeouts and interrupted transfers remain retryable transport errors', async t => {
  for (const kind of ['timeout', 'network']) {
    await t.test(kind, async sub => {
      const e = setup(sub, { handler: ({ url, init }) => {
        if (url.pathname === '/api/config') return response({});
        return { ok: true, status: 200, json: () => kind === 'timeout'
          ? new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('SECRET', 'AbortError'))))
          : Promise.reject(new TypeError('SECRET-TRUNCATED-BODY')) };
      } });
      const pending = e.client.start(); await flush();
      if (kind === 'timeout') await e.clock.tick(15_000);
      await pending;
      assert.equal(e.errors[0].status, 0, 'a failed response body is not a validated HTTP-200 payload');
      if (kind === 'timeout') assert.match(e.errors[0].message, /超时/);
      e.handle(() => response({ servers: [node()] }));
      await e.clock.tick(60_000);
      assert.equal(e.calls.length, 3, 'transient body errors must not disable retries');
      assert.equal(e.state().servers.length, 1);
    });
  }
});

test('temporary HTTP client errors recover automatically with bounded polling', async t => {
  for (const code of [408, 425, 429]) {
    await t.test(String(code), async sub => {
      const e = setup(sub, { handler: ({ url }) => url.pathname === '/api/config'
        ? response({}) : response({ error: 'Temporary failure' }, code) });
      await e.client.start();
      assert.equal(e.errors[0].status, code);
      e.handle(() => response({ servers: [node()] }));
      await e.clock.tick(59_999);
      assert.equal(e.calls.length, 2);
      await e.clock.tick(1);
      assert.equal(e.calls.length, 3);
      assert.equal(e.state().servers.length, 1);
    });
  }
});

test('a transient REST outage leaves an already healthy live connection running', async t => {
  const e = setup(t);
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  e.handle(() => response({ error: 'D1 temporarily unavailable' }, 500));
  await e.client.refresh();
  assert.equal(ws.closed, 0, 'a REST/database failure must not tear down the independent live stream');
  ws.message(batch([{ ts: T + 3000, data: { cpu: 7 } }]));
  assert.equal(e.state().servers[0].cpu, 7);
  assert.equal(e.status().kind, 'live');
});

test('an error callback can switch routes without the old failure blocking the new route', async t => {
  let recovery;
  const e = setup(t, { onError: () => { recovery = e.client.setDetail('node-2'); }, handler: ({ url }) => {
    if (url.pathname === '/api/config') return response({});
    if (url.pathname === '/api/servers') return response({ error: 'Unauthorized' }, 401);
    return response(node('node-2'));
  } });
  await e.client.start(); await recovery;
  e.sockets[0].open();
  const count = e.calls.length;
  await e.clock.tick(60_000);
  assert.equal(e.calls.length, count + 1, 'the old route must not disable polling on the recovered route');
  assert.equal(e.state().selectedServer.id, 'node-2');
});

test('mixed-case detail IDs use a case-preserving single-ID filter', async t => {
  const id = 'ABCDEF01-2345-6789-ABCD-EF0123456789';
  const e = setup(t, { hash: `#/server/${id}` });
  await e.client.start(); const ws = e.sockets[0]; ws.open();
  const subscription = ws.sent.find(message => message.type === 'subscribe');
  const scope = String(subscription?.scope ?? new URL(ws.url).searchParams.get('subscribe')).toLowerCase();
  const receives = scope === 'all' ? subscription?.ids.includes(id) : scope === id;
  assert.equal(receives, true, 'match the broadcaster, which lowercases scopes but not filtered IDs');
  assert.equal(e.calls.some(call => call.url.pathname === '/api/servers'), false);
  if (subscription) assert.deepEqual(subscription.ids, [id], 'never broaden a detail subscription');
  ws.message(batch([], { updates: [{ serverId: id, samples: [{ ts: T + 1000, data: { cpu: 7 } }] }] }));
  assert.equal(e.state().selectedServer.cpu, 7);
});

test('test cleanup restores every global even when a leak assertion fails', async () => {
  const keys = ['location', 'document', 'localStorage', 'fetch', 'WebSocket', 'setTimeout', 'clearTimeout'];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalNow = Date.now;
  const hooks = [];
  const e = setup({ after: hook => hooks.push(hook) });
  try {
    await e.client.start();
    const stop = e.client.stop;
    e.client.stop = async () => { await stop(); e.clock.set(() => {}, 1000); };
    await assert.rejects(hooks[0], /stop clears every timer/);
    assert.equal(Date.now, originalNow);
    for (const [key, descriptor] of originals) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), descriptor, key);
    }
  } finally {
    Date.now = originalNow;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});


test('a socket-constructor error callback can stop without a stale polling status', async t => {
  const e = setup(t, { onError: () => { void e.client.stop(); } });
  globalThis.WebSocket = class { constructor() { throw new Error('SECRET-CONSTRUCTOR'); } };
  await e.client.start();
  assert.equal(e.errors.length, 1);
  assert.equal(e.status().kind, 'paused');
  assert.equal(e.clock.timers.size, 0);
});

test('session verification is reused without ever attaching it to anonymous config', async t => {
  const e = setup(t, { storage: { turnstile_verified: 'old.local' }, sessionStorage: { turnstile_verified: 'new.session' } });
  await e.client.start();
  assert.equal(e.calls[0].init.credentials, 'omit');
  assert.equal(e.calls[0].init.headers['X-Turnstile-Verified'], undefined);
  assert.equal(e.calls[1].init.headers['X-Turnstile-Verified'], 'new.session');
});
