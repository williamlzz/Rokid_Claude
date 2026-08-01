#!/usr/bin/env node
// PreToolUse hook:把工具放行决定外包给中继(中继再问眼镜)。任何异常=拒绝(安全默认)。
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let allow = false;
try {
  const { tool_name, tool_input } = JSON.parse(raw || '{}');
  const bridge = process.env.ROKID_PERM_BRIDGE ?? 'http://127.0.0.1:8787/permission';
  const token = process.env.ROKID_PERM_TOKEN ?? '';
  const r = await fetch(bridge, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-rokid-permission-token': token },
    body: JSON.stringify({ tool: tool_name, input: tool_input ?? {} }),
  });
  allow = (await r.json()).allow === true;
} catch { allow = false; }
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: allow ? 'allow' : 'deny',
    permissionDecisionReason: allow ? '用户允许' : '用户拒绝或超时',
  },
}));
