import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createRelayServer } from './server';
import { runClaude } from './claude-runner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PORT = 8787;
const token = process.env.ROKID_TOKEN;
const permissionToken = randomBytes(32).toString('hex');
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

// 写一份含 PreToolUse hook 的 settings:写文件/Bash 类工具放行决定外包给中继(中继再问眼镜)。
const hookScript = join(__dirname, 'permission-hook.mjs');
const settingsPath = join(tmpdir(), 'rokid-perm-settings.json');
writeFileSync(settingsPath, JSON.stringify({
  // 只读类联网工具静默放行(改不了 Mac,headless 下也不该卡确认)。
  permissions: { allow: ['WebSearch', 'WebFetch'] },
  hooks: {
    PreToolUse: [{
      matcher: 'Bash|Write|Edit|MultiEdit|NotebookEdit',
      hooks: [{ type: 'command', command: `ROKID_PERM_TOKEN=${permissionToken} node ${shellQuote(hookScript)}` }],
    }],
  },
}));

const { http } = createRelayServer({
  sandboxDir: join(root, 'sandbox'),
  webDir: join(root, 'web'),
  stateDir: join(root, 'state'),
  modelPath: join(root, 'models', 'ggml-small.bin'),
  token,
  permissionToken,
  dictionaryDir: root,
  runner: (o) => runClaude({ ...o, settingsPath }),
});

http.listen(PORT, () => {
  console.log(`Rokid relay 已启动: http://localhost:${PORT}`);
  console.log(`鉴权: ${token ? '已开启 (ROKID_TOKEN)' : '未开启 (本地直连)'}`);
  console.log(`sandbox: ${join(root, 'sandbox')} | state: ${join(root, 'state')}`);
});
