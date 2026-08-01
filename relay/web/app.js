import { cleanTranscript } from './transcript.js';

const $ = (id) => document.getElementById(id);
const panel = $('panel'), content = $('content'), status = $('status'), conn = $('conn'), usage = $('usage');

const LS = 'rokid-relay-pos';
let pos = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })();
let ws;

function savePos() { localStorage.setItem(LS, JSON.stringify(pos)); }

function connect() {
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = new URLSearchParams(location.search).get('token');
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  ws = new WebSocket(`${wsProto}//${location.host}/${qs}`);
  ws.onopen = () => {
    conn.textContent = '已连接';
    ws.send(JSON.stringify({ type: 'hello', lastRunId: pos.lastRunId, lastSeq: pos.lastSeq }));
  };
  ws.onclose = () => { conn.textContent = '断开,重连中…'; setTimeout(connect, 1000); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}

function addLine(text, cls) {
  const div = document.createElement('div');
  div.className = 'line ' + (cls || '');
  div.textContent = text;
  content.appendChild(div);
  content.scrollTop = content.scrollHeight;
  return div;
}

const ICON = { running: '⏳', done: '✅', error: '❌' };
const toolLines = {};
function summarize(input) {
  if (!input || typeof input !== 'object') return '';
  return input.file_path || input.command || input.pattern || input.path || input.query || '';
}

function renderEvent(ev) {
  switch (ev.type) {
    case 'system': status.textContent = '🟢 已就绪 · 思考中…'; break;
    case 'thinking': status.textContent = '💭 思考中…'; break;
    case 'text': addLine(ev.delta, ''); break;
    case 'tool_use': {
      const sum = summarize(ev.input);
      const el = addLine(`${ICON.running} ${ev.name}${sum ? ' — ' + sum : ''}`, 'tool');
      toolLines[ev.id] = { el, name: ev.name, sum };
      status.textContent = `⏳ ${ev.name}…`;
      break;
    }
    case 'tool_result': {
      const t = toolLines[ev.id];
      if (t) t.el.textContent = `${ev.isError ? ICON.error : ICON.done} ${t.name}${t.sum ? ' — ' + t.sum : ''}`;
      break;
    }
    case 'done': status.textContent = '✅ 完成'; break;
    case 'error': addLine('错误: ' + ev.message, 'err'); status.textContent = '❌ 出错'; break;
  }
}

function handle(msg) {
  if (msg.type === 'sync') {
    if (msg.currentRun && msg.currentRun.id !== pos.lastRunId) {
      content.innerHTML = '';
      pos = { lastRunId: msg.currentRun.id, lastSeq: 0 };
      savePos();
    }
    if (msg.currentRun) addLine(`── 续接:${msg.currentRun.prompt || '上次会话'} ──`, 'think');
    return;
  }
  if (msg.type === 'event') {
    pos.lastRunId = msg.runId; pos.lastSeq = msg.seq; savePos();
    renderEvent(msg.event);
    return;
  }
  if (msg.type === 'runEnd') {
    if (msg.status === 'interrupted') { addLine('⚠️ 上轮被中断,可发新指令续', 'err'); status.textContent = '⚠️ 已中断'; }
    else status.textContent = msg.status === 'error' ? '❌ 出错' : '✅ 完成';
    return;
  }
  if (msg.type === 'usage') {
    const model = msg.model || '—';
    const cost = typeof msg.costUsd === 'number' ? msg.costUsd.toFixed(4) : '0.0000';
    const tok = msg.tokens || 0;
    usage.textContent = `${model} · $${cost} · ${tok}tok`;
    return;
  }
  if (msg.type === 'permissionRequest') {
    addLine(`🔐 权限请求:${msg.summary || msg.tool}(请在眼镜上确认)`, 'think');
    return;
  }
  if (msg.type === 'modelRequest') {
    addLine('🔀 模型选择(请在眼镜上选)', 'think');
    return;
  }
}

// 打字与语音共用的发送入口
function sendPrompt(text) {
  const prompt = cleanTranscript(text);
  if (!prompt || ws?.readyState !== WebSocket.OPEN) return;
  addLine('▶ ' + prompt, 'think');
  status.textContent = '提交中…';
  ws.send(JSON.stringify({ type: 'prompt', prompt }));
}

function sendTyped() {
  sendPrompt($('prompt').value);
  $('prompt').value = '';
}

$('send').onclick = sendTyped;
$('prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTyped(); });
$('stop').onclick = () => ws?.send(JSON.stringify({ type: 'stop' }));
$('new').onclick = () => {
  pos = {}; savePos();
  ws?.send(JSON.stringify({ type: 'newSession' }));
  content.innerHTML = ''; status.textContent = '🆕 新会话';
};
$('guides').onchange = (e) => panel.classList.toggle('guides', e.target.checked);
$('rotate').onchange = (e) => panel.classList.toggle('rot', e.target.checked);

// --- 按住说话(Web Speech API)---
const micBtn = $('mic');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  micBtn.disabled = true;
  micBtn.title = '需要 Chrome / Edge';
} else {
  let recog = null, finalText = '', lastInterim = '', listening = false;

  const startListen = () => {
    if (listening) return;
    listening = true; finalText = ''; lastInterim = '';
    recog = new SR();
    recog.lang = 'zh-CN';
    recog.interimResults = true;
    recog.continuous = true;
    recog.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      lastInterim = interim;
      status.textContent = `🎤 听着…${finalText}${interim}`;
    };
    recog.onerror = (e) => { status.textContent = `🎤 识别出错: ${e.error}`; };
    recog.onend = () => {
      const text = cleanTranscript(`${finalText} ${lastInterim}`);
      if (text) sendPrompt(text);
      else status.textContent = '(没听到内容)';
    };
    micBtn.classList.add('listening');
    try { recog.start(); } catch { /* already started */ }
  };

  const stopListen = () => {
    if (!listening) return;
    listening = false;
    micBtn.classList.remove('listening');
    try { recog && recog.stop(); } catch { /* noop */ }
    // 发送在 recog.onend 里做(确保拿到最终结果)
  };

  micBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startListen(); });
  micBtn.addEventListener('pointerup', stopListen);
  micBtn.addEventListener('pointerleave', stopListen);
}

panel.classList.toggle('guides', $('guides').checked);
connect();
