import { tr, type Lang } from './i18n';

/** 由工具名+命令串生成"已允许"记忆键。 */
export function allowKey(tool: string, command: string): string {
  return `${tool}::${command}`;
}

/**
 * 记忆键策略(混合):
 * - Bash 按"工具+命令"收窄,放行一次某条命令不会让其它任意命令(如 rm -rf)免确认;
 * - 写文件类(Write/Edit/MultiEdit/NotebookEdit)按"工具"放行,"这类都允许"可覆盖整批文件,保留批量体验。
 */
export function memoryKey(tool: string, command: string): string {
  return tool === 'Bash' ? allowKey(tool, command) : tool;
}

/** 命中已允许集合=allow,否则=ask(需要问用户)。 */
export function decide(key: string, allowedSet: Set<string>): 'allow' | 'ask' {
  return allowedSet.has(key) ? 'allow' : 'ask';
}

/** 从工具名+输入提炼给用户看的一句人话 + 用于记忆键的命令串。动词按 lang。 */
export function summarize(tool: string, input: Record<string, unknown>, lang: Lang = 'zh'): { summary: string; command: string } {
  const cmd =
    (typeof input.command === 'string' && input.command) ||
    (typeof input.file_path === 'string' && input.file_path) ||
    (typeof input.path === 'string' && input.path) ||
    '';
  const verb = tr(lang).verb(tool);
  return { summary: cmd ? `${verb}: ${cmd}` : tool, command: cmd || tool };
}
