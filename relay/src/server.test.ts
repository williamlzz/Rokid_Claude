import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRelayServer } from './server';

/** 起一个 relay,注入会记录被调语言的假转写器和空跑 runner。 */
function makeServer() {
  const langSeen: string[] = [];
  const transcriber = async (_wav: string, _model: string, lang: 'zh' | 'en') => {
    langSeen.push(lang);
    return '';
  };
  const dir = mkdtempSync(join(tmpdir(), 'rokid-test-'));
  const srv = createRelayServer({
    sandboxDir: dir, webDir: dir, stateDir: dir, modelPath: 'unused',
    transcriber,
    runner: () => ({ events: (async function* () {})(), stop() {} }),
  });
  return { srv, langSeen };
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
  });
}

/** 等下一条指定 type 的服务端消息。 */
function waitFor(ws: WebSocket, type: string): Promise<any> {
  return new Promise((resolve) => {
    const h = (raw: Buffer) => {
      const m = JSON.parse(raw.toString());
      if (m.type === type) { ws.off('message', h); resolve(m); }
    };
    ws.on('message', h);
  });
}

describe('setLang', () => {
  it('switches the whisper language for subsequent audio', async () => {
    const { srv, langSeen } = makeServer();
    await new Promise<void>((r) => srv.http.listen(0, r));
    const port = (srv.http.address() as any).port;
    const ws = await connect(port);
    const wav = Buffer.from('x').toString('base64');

    ws.send(JSON.stringify({ type: 'hello', lang: 'zh' }));
    ws.send(JSON.stringify({ type: 'audio', wav }));
    await waitFor(ws, 'transcript');
    expect(langSeen).toEqual(['zh']);

    ws.send(JSON.stringify({ type: 'setLang', lang: 'en' }));
    ws.send(JSON.stringify({ type: 'audio', wav }));
    await waitFor(ws, 'transcript');
    expect(langSeen).toEqual(['zh', 'en']);

    ws.close();
    await new Promise<void>((r) => srv.http.close(() => r()));
  });
});

describe('broadcast fan-out', () => {
  it('sends permissionRequest to all connected clients, any one can answer', async () => {
    const { srv } = makeServer();
    await new Promise<void>((r) => srv.http.listen(0, r));
    const port = (srv.http.address() as any).port;
    const wsA = await connect(port);
    const wsB = await connect(port);
    wsA.send(JSON.stringify({ type: 'hello', lang: 'zh' }));
    wsB.send(JSON.stringify({ type: 'hello', lang: 'zh' }));
    await new Promise((r) => setTimeout(r, 50));

    const gotA = waitFor(wsA, 'permissionRequest');
    const gotB = waitFor(wsB, 'permissionRequest');

    // 触发权限请求(/permission 会等裁决后才响应,所以先别 await)
    const resP = fetch(`http://localhost:${port}/permission`, {
      method: 'POST',
      body: JSON.stringify({ tool: 'Bash', input: { command: 'ls' } }),
    });

    const [reqA, reqB] = await Promise.all([gotA, gotB]);
    expect(reqA.id).toBe(reqB.id);   // 同一请求扇出给两端

    // 任一客户端回裁决即兑现
    expect(reqA.allowKey).toBe('Bash::ls');
    wsA.send(JSON.stringify({ type: 'permissionDecision', id: reqA.id, choice: '允许一次', allowKey: reqA.allowKey }));
    const body = await (await resP).json();
    expect(body.allow).toBe(true);

    wsA.close();
    wsB.close();
    await new Promise<void>((r) => srv.http.close(() => r()));
  });
});
