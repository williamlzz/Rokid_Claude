import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createRelayServer } from '../src/server';
import type { AgentEvent } from '../src/events';
import type { RunHandle } from '../src/claude-runner';

function fakeRunner(events: AgentEvent[]): () => RunHandle {
  return () => ({
    events: (async function* () { for (const e of events) yield e; })(),
    stop() {},
  });
}

function fakeTranscriber(text: string) {
  return async (_wav: string, _model: string) => text;
}

let dir: string;
let close: (() => void) | null = null;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'srv-')); });
afterEach(() => { close?.(); close = null; rmSync(dir, { recursive: true, force: true }); });

async function start(events: AgentEvent[], transcriber?: (w: string, m: string) => Promise<string>): Promise<number> {
  const { http } = createRelayServer({
    sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
    runner: fakeRunner(events), transcriber,
  });
  await new Promise<void>((r) => http.listen(0, r));
  close = () => http.close();
  return (http.address() as AddressInfo).port;
}

/** 连接,发送若干消息,收集回包直到出现 runEnd(或超时)。 */
function session(port: number, sends: object[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const got: any[] = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 3000);
    ws.on('open', () => sends.forEach((m) => ws.send(JSON.stringify(m))));
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      got.push(msg);
      if (msg.type === 'runEnd') { clearTimeout(timer); ws.close(); resolve(got); }
    });
    ws.on('error', reject);
  });
}

describe('createRelayServer 重连协议', () => {
  it('hello→sync;prompt→带 seq 的 event + runEnd', async () => {
    const port = await start([
      { type: 'system', sessionId: 's1' },
      { type: 'tool_use', id: 't1', name: 'Write', input: {} },
      { type: 'done', sessionId: 's1' },
    ]);
    const msgs = await session(port, [{ type: 'hello' }, { type: 'prompt', prompt: 'hi' }]);
    const sync = msgs.find((m) => m.type === 'sync');
    expect(sync).toBeTruthy();
    const events = msgs.filter((m) => m.type === 'event');
    expect(events.map((m) => m.event.type)).toEqual(['system', 'tool_use', 'done']);
    expect(events.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(msgs.at(-1)).toMatchObject({ type: 'runEnd', status: 'done' });
  });

  it('第二个客户端重连(无 lastSeq)→ sync 含 currentRun + 全量重放 + runEnd', async () => {
    const port = await start([
      { type: 'system', sessionId: 's1' },
      { type: 'done', sessionId: 's1' },
    ]);
    await session(port, [{ type: 'hello' }, { type: 'prompt', prompt: 'hi' }]); // 客户端1 跑完
    const msgs = await session(port, [{ type: 'hello' }]); // 客户端2 重连
    const sync = msgs.find((m) => m.type === 'sync');
    expect(sync.currentRun.status).toBe('done');
    expect(msgs.filter((m) => m.type === 'event').map((m) => m.seq)).toEqual([1, 2]);
    expect(msgs.at(-1)).toMatchObject({ type: 'runEnd', status: 'done' });
  });

  it('重连带 lastSeq → 只补 seq 之后的事件', async () => {
    const port = await start([
      { type: 'system', sessionId: 's1' },
      { type: 'text', delta: 'a' },
      { type: 'done', sessionId: 's1' },
    ]);
    const first = await session(port, [{ type: 'hello' }, { type: 'prompt', prompt: 'hi' }]);
    const runId = first.find((m) => m.type === 'event').runId;
    const msgs = await session(port, [{ type: 'hello', lastRunId: runId, lastSeq: 2 }]);
    expect(msgs.filter((m) => m.type === 'event').map((m) => m.seq)).toEqual([3]);
    expect(msgs.at(-1)).toMatchObject({ type: 'runEnd', status: 'done' });
  });

  it('收到 audio → 回 transcript(注入假转写)', async () => {
    const port = await start([], fakeTranscriber('在沙盒建个文件'));
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const got: any = await new Promise((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'audio', wav: Buffer.from('x').toString('base64') })));
      ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'transcript') resolve(m); });
    });
    ws.close();
    expect(got).toMatchObject({ type: 'transcript', text: '在沙盒建个文件' });
  });
});

describe('token 鉴权', () => {
  async function startWithToken(token: string): Promise<number> {
    const { http } = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: fakeRunner([]), token,
    });
    await new Promise<void>((r) => http.listen(0, r));
    close = () => http.close();
    return (http.address() as AddressInfo).port;
  }

  it('缺 token 的连接被服务端关闭', async () => {
    const port = await startWithToken('secret');
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on('close', (c) => resolve(c));
      ws.on('open', () => ws.send('{"type":"hello"}'));
    });
    expect(code).toBe(1008);
  });

  it('带对 token 的连接能正常 hello/sync', async () => {
    const port = await startWithToken('secret');
    const sync = await new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=secret`);
      const t = setTimeout(() => reject(new Error('timeout')), 3000);
      ws.on('open', () => ws.send('{"type":"hello"}'));
      ws.on('message', (d) => { clearTimeout(t); resolve(JSON.parse(d.toString())); ws.close(); });
    });
    expect(sync.type).toBe('sync');
  });

  it('/permission 缺少桥接密钥时拒绝', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: fakeRunner([]), permissionToken: 'bridge-secret',
    });
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/permission`, {
      method: 'POST',
      body: JSON.stringify({ tool: 'Bash', input: { command: 'ls' } }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ allow: false });
  });

  it('/permission 带桥接密钥时使用工具+命令记忆键', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: fakeRunner([]), permissionToken: 'bridge-secret',
    });
    srv.allowedSet.add('Bash::ls');
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/permission`, {
      method: 'POST',
      headers: { 'x-rokid-permission-token': 'bridge-secret' },
      body: JSON.stringify({ tool: 'Bash', input: { command: 'ls' } }),
    });
    expect(await res.json()).toEqual({ allow: true });
  });

  it('写文件类"这类都允许"后整批文件免确认(混合策略)', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: fakeRunner([]), permissionToken: 'bridge-secret',
    });
    srv.allowedSet.add('Write'); // 按工具放行(如"这类都允许 Write")
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;

    // 不同文件路径都应免确认(若按 Write::path 收窄,这条会卡在等裁决)
    for (const file_path of ['/tmp/a.txt', '/tmp/b.txt']) {
      const res = await fetch(`http://127.0.0.1:${port}/permission`, {
        method: 'POST',
        headers: { 'x-rokid-permission-token': 'bridge-secret' },
        body: JSON.stringify({ tool: 'Write', input: { file_path } }),
      });
      expect(await res.json()).toEqual({ allow: true });
    }
  });
});

describe('权限桥', () => {
  it('发 permissionRequest;收到 permissionDecision→兑现 choice', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: fakeRunner([]),
    });
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => ws.on('open', () => { ws.send('{"type":"hello"}'); r(); }));

    const decisionP = srv.requestDecision({ tool: 'Bash', summary: '运行: ls', command: 'ls' }, 5000);
    const req: any = await new Promise((r) => ws.on('message', (d) => {
      const m = JSON.parse(d.toString()); if (m.type === 'permissionRequest') r(m);
    }));
    expect(req.summary).toBe('运行: ls');
    ws.send(JSON.stringify({ type: 'permissionDecision', id: req.id, choice: '允许一次' }));
    expect(await decisionP).toBe('允许一次');
    ws.close();
  });

  it('无人裁决→超时返回 拒绝', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: fakeRunner([]),
    });
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const choice = await srv.requestDecision({ tool: 'Bash', summary: 'x', command: 'x' }, 80);
    expect(choice).toBe('拒绝');
  });
});

describe('命令词典展开', () => {
  it('命中口令→startRun 收到展开值', async () => {
    let seenPrompt = '';
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      dictionaryDir: dir,
      runner: (o) => { seenPrompt = o.prompt; return { events: (async function* () {})(), stop() {} }; },
    });
    writeFileSync(dir + '/dictionary.zh.json', JSON.stringify({ '审查代码': '审查我的改动' }));
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => ws.on('open', () => { ws.send('{"type":"hello"}'); ws.send(JSON.stringify({ type: 'prompt', prompt: '审查代码' })); r(); }));
    await new Promise((r) => setTimeout(r, 200));
    expect(seenPrompt).toBe('审查我的改动');
    ws.close();
  });
});

describe('双语', () => {
  it('hello lang=en → 权限框英文选项 + timeoutChoice=Deny', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: fakeRunner([]),
    });
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    // 等 hello 被处理(relay 处理后会回一帧 usage 快照)再发起裁决,确保 lang 已置 en
    await new Promise<void>((r) => {
      ws.on('open', () => ws.send('{"type":"hello","lang":"en"}'));
      ws.on('message', (d) => { if (JSON.parse(d.toString()).type === 'usage') r(); });
    });
    const req: any = await new Promise((r) => {
      ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'permissionRequest') r(m); });
      srv.requestDecision({ tool: 'Bash', summary: 'Run: ls', command: 'ls', allowKey: 'Bash' });
    });
    expect(req.options).toEqual(['Allow once', 'Allow this kind', 'Deny']);
    expect(req.timeoutChoice).toBe('Deny');
    ws.close();
  });

  it('en:模型框选项含 Cancel + timeoutChoice=Cancel', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: () => ({ events: (async function* () {})(), stop() {} }),
    });
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => ws.on('open', () => { ws.send('{"type":"hello","lang":"en"}'); r(); }));
    const req: any = await new Promise((r) => {
      ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'modelRequest') r(m); });
      ws.send(JSON.stringify({ type: 'prompt', prompt: 'switch model' }));
    });
    expect(req.options).toEqual(['opus', 'sonnet', 'haiku', 'Cancel']);
    expect(req.timeoutChoice).toBe('Cancel');
    ws.close();
  });
});

describe('用量累加与广播', () => {
  it('跑完后广播 usage(model + 累计 $ + tokens)', async () => {
    const port = await start([
      { type: 'system', sessionId: 's1', model: 'claude-opus-4-8' },
      { type: 'done', sessionId: 's1', costUsd: 0.02, tokensIn: 1000, tokensOut: 500 },
    ]);
    const msgs = await session(port, [{ type: 'hello' }, { type: 'prompt', prompt: 'hi' }]);
    const usages = msgs.filter((m) => m.type === 'usage');
    const last = usages.at(-1);
    expect(last.model).toBe('claude-opus-4-8');
    expect(last.costUsd).toBeCloseTo(0.02, 5);
    expect(last.tokens).toBe(1500);
  });

  it('hello 后立即收到 usage 快照(开跑前为初值)', async () => {
    const port = await start([]);
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const snap: any = await new Promise((resolve) => {
      ws.on('open', () => ws.send('{"type":"hello"}'));
      ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'usage') resolve(m); });
    });
    ws.close();
    expect(snap).toMatchObject({ type: 'usage', model: null, costUsd: 0, tokens: 0 });
  });
});

describe('语音切模型拦截', () => {
  it('选择框选定后,下次开跑带上 --model;裸型号名不被劫持(照常开跑)', async () => {
    let runModel: string | undefined = 'NONE';
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: (o: any) => { runModel = o.model; return { events: (async function* () {})(), stop() {} }; },
    });
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => ws.on('open', () => { ws.send('{"type":"hello"}'); r(); }));

    // 「切换模型」→ 选择框 → 选 haiku
    const req: any = await new Promise((r) => {
      ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'modelRequest') r(m); });
      ws.send(JSON.stringify({ type: 'prompt', prompt: '切换模型' }));
    });
    expect(runModel).toBe('NONE');                       // 弹框期间没开跑
    ws.send(JSON.stringify({ type: 'permissionDecision', id: req.id, choice: 'haiku', allowKey: '' }));
    await new Promise((r) => setTimeout(r, 100));

    // 下次开跑带 --model(haiku → haiku 别名)
    ws.send(JSON.stringify({ type: 'prompt', prompt: '随便跑一下' }));
    await new Promise((r) => setTimeout(r, 150));
    expect(runModel).toBe('haiku');

    // 裸型号名不再被识别为切换 → 照常当 prompt 开跑(不拦截)
    ws.send(JSON.stringify({ type: 'prompt', prompt: '切换到 opus' }));
    await new Promise((r) => setTimeout(r, 150));
    expect(runModel).toBe('haiku');                      // 仍是上次选定的 haiku(opus 没被当成切换)
    ws.close();
  });

  it('说「切换模型」→ 广播 modelRequest(含 options 与当前项)', async () => {
    const srv = createRelayServer({
      sandboxDir: '/tmp/x', webDir: '/tmp/x', stateDir: dir, modelPath: '/tmp/m.bin',
      runner: () => ({ events: (async function* () {})(), stop() {} }),
    });
    await new Promise<void>((r) => srv.http.listen(0, r));
    close = () => srv.http.close();
    const port = (srv.http.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((r) => ws.on('open', () => { ws.send('{"type":"hello"}'); r(); }));
    const req: any = await new Promise((r) => {
      ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'modelRequest') r(m); });
      ws.send(JSON.stringify({ type: 'prompt', prompt: '切换模型' }));
    });
    expect(req.options).toEqual(['opus', 'sonnet', 'haiku', '取消']);
    expect(typeof req.id).toBe('string');
    const usages: any[] = [];
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'usage') usages.push(m); });
    ws.send(JSON.stringify({ type: 'permissionDecision', id: req.id, choice: 'sonnet', allowKey: '' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(usages.at(-1).model).toBe('sonnet');
    ws.close();
  });
});
