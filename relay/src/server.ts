import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { runClaude, type RunHandle } from './claude-runner';
import { RunStore } from './run-store';
import { transcribe } from './transcribe';
import { checkToken } from './auth';
import { memoryKey, decide, summarize } from './permission';
import { expandPrompt, loadDictionary } from './dictionary';
import { parseModelCommand, modelArg, type ModelAlias } from './model';
import { tr, normalizeLang, type Lang } from './i18n';

type RunnerFn = (opts: { prompt: string; cwd: string; sessionId?: string; model?: string }) => RunHandle;
type TranscriberFn = (wavPath: string, modelPath: string, lang: Lang) => Promise<string>;

export interface ServerOptions {
  sandboxDir: string;
  webDir: string;
  stateDir: string;
  modelPath: string;
  token?: string;
  permissionToken?: string;
  dictionaryDir?: string;
  runner?: RunnerFn;
  transcriber?: TranscriberFn;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

export function createRelayServer(opts: ServerOptions) {
  const runner = opts.runner ?? runClaude;
  const transcriber = opts.transcriber ?? transcribe;
  const store = new RunStore(opts.stateDir);
  const expectedPermissionToken = opts.permissionToken ?? opts.token;
  let current: RunHandle | null = null;
  let currentRunId: string | null = null;

  const allowedSet = new Set<string>();
  const pending = new Map<string, (choice: string) => void>();
  const clients = new Set<(msg: unknown) => void>();
  const broadcast = (msg: unknown) => { for (const send of clients) send(msg); };

  let lang: Lang = 'zh';                      // 本连接语言(hello 时由客户端 config 传入)
  let currentModel: string | null = null;   // 最近一次 system 事件的真实模型(全 id)
  let selectedModel: ModelAlias | null = null;  // 用户语音选定的别名(opus/sonnet/haiku),开跑前即显示
  let sessionCostUsd = 0;
  let sessionTokens = 0;

  function usageSnapshot() {
    return { type: 'usage', model: selectedModel ?? currentModel, costUsd: sessionCostUsd, tokens: sessionTokens };
  }
  function broadcastUsage() { broadcast(usageSnapshot()); }

  function applyModel(model: ModelAlias) { selectedModel = model; broadcastUsage(); }

  /** 发 modelRequest,等用户在眼镜选,超时=取消。复用 pending(由 permissionDecision 兑现)。 */
  function requestModelChoice(current: ModelAlias | null, timeoutMs = 60000): Promise<string> {
    const id = `model-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cancel = tr(lang).modelCancel;
    const options = ['opus', 'sonnet', 'haiku', cancel];
    const currentIdx = current ? options.indexOf(current) : 0;
    return new Promise((resolve) => {
      let done = false;
      const finish = (choice: string) => { if (done) return; done = true; pending.delete(id); resolve(choice); };
      pending.set(id, finish);
      broadcast({ type: 'modelRequest', id, options, current: currentIdx < 0 ? 0 : currentIdx, timeoutChoice: cancel });
      setTimeout(() => finish(cancel), timeoutMs);
    });
  }

  /** 发 permissionRequest 给眼镜,等 permissionDecision 或 timeoutMs 超时→拒绝。allowKey 由眼镜原样回传用于记忆。 */
  function requestDecision(
    req: { tool: string; summary: string; command: string; allowKey?: string },
    timeoutMs = 60000,
  ): Promise<string> {
    const id = `perm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const t = tr(lang);
    const options = [t.permOnce, t.permKind, t.permDeny];
    return new Promise((resolve) => {
      let done = false;
      const finish = (choice: string) => { if (done) return; done = true; pending.delete(id); resolve(choice); };
      pending.set(id, finish);
      broadcast({ type: 'permissionRequest', id, tool: req.tool, summary: req.summary, options, allowKey: req.allowKey ?? '', timeoutChoice: t.permDeny });
      setTimeout(() => finish(t.permDeny), timeoutMs);
    });
  }

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/permission') {
      if (expectedPermissionToken && req.headers['x-rokid-permission-token'] !== expectedPermissionToken) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ allow: false }));
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        try {
          const { tool, input } = JSON.parse(body || '{}');
          const { summary, command } = summarize(tool, input ?? {}, lang);
          // 记忆键策略:Bash 按命令收窄(避免一次放行后任意命令免确认),写文件类按工具放行(利于批量)。
          const key = memoryKey(tool, command);
          if (decide(key, allowedSet) === 'allow') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ allow: true })); return; }
          const choice = await requestDecision({ tool, summary, command, allowKey: key });
          const t = tr(lang);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ allow: choice === t.permOnce || choice === t.permKind }));
        } catch { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ allow: false })); }
      });
      return;
    }
    const urlPath = (req.url === '/' || !req.url) ? '/index.html' : req.url.split('?')[0];
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(opts.webDir, safe);
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });

  async function startRun(prompt: string): Promise<void> {
    const run = store.startRun(prompt);
    currentRunId = run.id;
    const handle = runner({ prompt, cwd: opts.sandboxDir, sessionId: run.sessionId, model: selectedModel ? modelArg(selectedModel) : undefined });
    current = handle;
    try {
      for await (const event of handle.events) {
        store.appendEvent(run.id, event);
        if (event.type === 'system' && event.model) { currentModel = event.model; broadcastUsage(); }
        if (event.type === 'done') {
          if (typeof event.costUsd === 'number') sessionCostUsd += event.costUsd;
          sessionTokens += (event.tokensIn ?? 0) + (event.tokensOut ?? 0);
          broadcastUsage();
        }
      }
      const last = store.eventsSince(run.id, 0).at(-1)?.event;
      store.finishRun(run.id, last?.type === 'error' ? 'error' : 'done');
    } catch (err) {
      store.appendEvent(run.id, { type: 'error', message: String(err) });
      store.finishRun(run.id, 'error');
    } finally {
      if (currentRunId === run.id) { current = null; currentRunId = null; }
    }
  }

  async function handleAudio(ws: WebSocket, wavBase64: string): Promise<void> {
    let text = '';
    const tmp = join(tmpdir(), `rokid-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    try {
      await writeFile(tmp, Buffer.from(wavBase64, 'base64'));
      text = await transcriber(tmp, opts.modelPath, lang);
    } catch { text = ''; }
    finally { await unlink(tmp).catch(() => {}); }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'transcript', text }));
  }

  const wss = new WebSocketServer({ server: http });
  wss.on('connection', (ws, req) => {
    if (!checkToken(req.url, opts.token)) { ws.close(1008, 'unauthorized'); return; }
    const send = (msg: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
    clients.add(send);
    const sentMax = new Map<string, number>();
    let live = false;
    const queue: Array<['event', { runId: string; seq: number; event: unknown }] | ['end', { runId: string; status: string }]> = [];

    const rawSendEvent = (runId: string, seq: number, event: unknown) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (seq <= (sentMax.get(runId) ?? 0)) return;
      sentMax.set(runId, seq);
      ws.send(JSON.stringify({ type: 'event', runId, seq, event }));
    };
    const rawSendEnd = (runId: string, status: string) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'runEnd', runId, status }));
    };
    const onEvent = (m: { runId: string; seq: number; event: unknown }) => {
      if (live) rawSendEvent(m.runId, m.seq, m.event); else queue.push(['event', m]);
    };
    const onRunEnd = (m: { runId: string; status: string }) => {
      if (live) rawSendEnd(m.runId, m.status); else queue.push(['end', m]);
    };
    store.on('event', onEvent);
    store.on('runEnd', onRunEnd);

    ws.on('message', (data) => {
      let msg: { type?: string; prompt?: string; lastRunId?: string; lastSeq?: number; wav?: string; id?: string; choice?: string; allowKey?: string; lang?: string };
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'hello') {
        lang = normalizeLang(msg.lang);
        const cur = store.getCurrent();
        ws.send(JSON.stringify({ type: 'sync', sessionId: cur.sessionId, currentRun: cur.currentRun }));
        ws.send(JSON.stringify(usageSnapshot()));
        if (cur.currentRun) {
          const since = msg.lastRunId === cur.currentRun.id ? (msg.lastSeq ?? 0) : 0;
          for (const e of store.eventsSince(cur.currentRun.id, since)) rawSendEvent(cur.currentRun.id, e.seq, e.event);
          if (cur.currentRun.status !== 'running') rawSendEnd(cur.currentRun.id, cur.currentRun.status);
        }
        for (const item of queue) {
          if (item[0] === 'event') rawSendEvent(item[1].runId, item[1].seq, item[1].event);
          else rawSendEnd(item[1].runId, item[1].status);
        }
        queue.length = 0;
        live = true;
        return;
      }
      if (msg.type === 'prompt' && msg.prompt) {
        const cmd = parseModelCommand(msg.prompt, lang);
        if (cmd?.kind === 'pick') {
          void requestModelChoice(selectedModel).then((choice) => {
            if (choice === 'opus' || choice === 'sonnet' || choice === 'haiku') applyModel(choice);
          });
          return;
        }
        const dict = opts.dictionaryDir ? loadDictionary(join(opts.dictionaryDir, `dictionary.${lang}.json`)) : {};
        const text = expandPrompt(msg.prompt, dict);
        void startRun(text);
        return;
      }
      if (msg.type === 'audio' && typeof msg.wav === 'string') { void handleAudio(ws, msg.wav); return; }
      if (msg.type === 'stop') { current?.stop(); return; }
      if (msg.type === 'newSession') {
        store.newSession(); allowedSet.clear();
        currentModel = null; selectedModel = null; sessionCostUsd = 0; sessionTokens = 0;
        broadcastUsage();
        return;
      }
      if (msg.type === 'setLang' && typeof msg.lang === 'string') {
        lang = normalizeLang(msg.lang);
        return;
      }
      if (msg.type === 'permissionDecision' && msg.id && typeof msg.choice === 'string') {
        if (msg.choice === tr(lang).permKind && msg.allowKey) allowedSet.add(msg.allowKey);
        pending.get(msg.id)?.(msg.choice);
        return;
      }
    });

    ws.on('close', () => { store.off('event', onEvent); store.off('runEnd', onRunEnd); clients.delete(send); });
  });

  return { http, wss, store, requestDecision, allowedSet };
}
