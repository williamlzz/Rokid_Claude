import { describe, it, expect } from 'vitest';
import { allowKey, decide, memoryKey, summarize } from '../src/permission';

describe('permission 纯逻辑', () => {
  it('allowKey 由工具名+命令稳定生成', () => {
    expect(allowKey('Bash', 'npm test')).toBe('Bash::npm test');
    expect(allowKey('Write', '/a/b.txt')).toBe('Write::/a/b.txt');
  });
  it('memoryKey:Bash 按命令收窄,写文件类按工具放行', () => {
    expect(memoryKey('Bash', 'rm -rf /')).toBe('Bash::rm -rf /');
    expect(memoryKey('Write', '/a/b.txt')).toBe('Write');
    expect(memoryKey('Edit', '/a/b.txt')).toBe('Edit');
  });
  it('decide:在已允许集合内→allow', () => {
    const set = new Set<string>(['Bash::npm test']);
    expect(decide('Bash::npm test', set)).toBe('allow');
  });
  it('decide:不在集合内→ask', () => {
    expect(decide('Bash::rm -rf /', new Set())).toBe('ask');
  });
  it('summarize:Bash 显命令,Write 显路径,其他显工具名', () => {
    expect(summarize('Bash', { command: 'npm test' })).toEqual({ summary: '运行: npm test', command: 'npm test' });
    expect(summarize('Write', { file_path: '/a.txt' })).toEqual({ summary: '写: /a.txt', command: '/a.txt' });
    expect(summarize('Glob', {})).toEqual({ summary: 'Glob', command: 'Glob' });
  });
});

describe('summarize lang', () => {
  it('zh 动词', () => {
    expect(summarize('Bash', { command: 'ls' }, 'zh').summary).toBe('运行: ls');
    expect(summarize('Write', { file_path: 'a.txt' }, 'zh').summary).toBe('写: a.txt');
  });
  it('en 动词', () => {
    expect(summarize('Bash', { command: 'ls' }, 'en').summary).toBe('Run: ls');
    expect(summarize('Write', { file_path: 'a.txt' }, 'en').summary).toBe('Write: a.txt');
  });
});
