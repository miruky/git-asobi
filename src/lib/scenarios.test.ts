import { describe, expect, it } from 'vitest';
import { execute } from './commands';
import { Repo } from './repo';
import { scenarioById, scenarios } from './scenarios';

describe('scenarios', () => {
  it('idは一意で、名前と説明が埋まっている', () => {
    const ids = scenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of scenarios) {
      expect(scenario.name).not.toBe('');
      expect(scenario.description).not.toBe('');
    }
  });

  it('全シナリオのコマンドはエラーなく再生できる', () => {
    for (const scenario of scenarios) {
      const repo = new Repo();
      for (const line of scenario.commands) {
        const result = execute(repo, line);
        expect(result.ok, `${scenario.id}: ${line} -> ${result.output.join(' / ')}`).toBe(true);
      }
    }
  });

  it('branch-practice はmainとfeatureが分岐した状態になる', () => {
    const repo = new Repo();
    for (const line of scenarioById('branch-practice')?.commands ?? []) execute(repo, line);
    const main = repo.branches.get('main');
    const feature = repo.branches.get('feature');
    expect(main).toBeDefined();
    expect(feature).toBeDefined();
    expect(main).not.toBe(feature);
    expect(repo.isAncestor(feature as string, main as string)).toBe(false);
    expect(repo.isAncestor(main as string, feature as string)).toBe(false);
  });

  it('merge-practice はマージ直前(双方に固有のコミット)になっている', () => {
    const repo = new Repo();
    for (const line of scenarioById('merge-practice')?.commands ?? []) execute(repo, line);
    expect(repo.head).toEqual({ type: 'branch', name: 'main' });
    const result = execute(repo, 'git merge topic');
    expect(result.ok).toBe(true);
    expect(result.output.join(' ')).toContain('マージコミット');
  });
});
