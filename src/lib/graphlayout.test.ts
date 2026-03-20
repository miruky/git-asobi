import { describe, expect, it } from 'vitest';
import { execute } from './commands';
import { layoutGraph } from './graphlayout';
import { Repo } from './repo';

function build(...lines: string[]): Repo {
  const repo = new Repo();
  for (const line of lines) execute(repo, line);
  return repo;
}

describe('layoutGraph', () => {
  it('空のリポジトリは空のレイアウトになる', () => {
    const layout = layoutGraph(new Repo());
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  it('新しいコミットほど上の行に置かれる', () => {
    const repo = build('git commit -m "1"', 'git commit -m "2"', 'git commit -m "3"');
    const layout = layoutGraph(repo);
    const sorted = [...layout.nodes].sort((a, b) => a.y - b.y);
    expect(sorted[0]?.message).toBe('3');
    expect(sorted[2]?.message).toBe('1');
  });

  it('ブランチごとに別のレーンへ分かれる', () => {
    const repo = build(
      'git commit -m "1"',
      'git checkout -b feature',
      'git commit -m "f1"',
      'git checkout main',
      'git commit -m "m1"',
    );
    const layout = layoutGraph(repo);
    const f1 = layout.nodes.find((n) => n.message === 'f1');
    const m1 = layout.nodes.find((n) => n.message === 'm1');
    expect(f1?.lane).not.toBe(m1?.lane);
    expect(layout.laneCount).toBe(2);
  });

  it('マージコミットは2本のエッジを持つ', () => {
    const repo = build(
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "t1"',
      'git checkout main',
      'git commit -m "m1"',
      'git merge topic',
    );
    const layout = layoutGraph(repo);
    const merge = layout.nodes.find((n) => n.message.startsWith('Merge'));
    expect(merge).toBeDefined();
    const fromMerge = layout.edges.filter((e) => e.fromId === merge?.id);
    expect(fromMerge.length).toBe(2);
  });

  it('HEADのコミットにHEADラベルが付き、ブランチ先端にブランチ名が付く', () => {
    const repo = build('git commit -m "1"', 'git tag v1');
    const layout = layoutGraph(repo);
    const labels = layout.nodes[0]?.labels.map((l) => `${l.kind}:${l.text}`);
    expect(labels).toContain('head:HEAD');
    expect(labels).toContain('branch:main');
    expect(labels).toContain('tag:v1');
  });

  it('rebase後の元コミットは孤児として印が付く', () => {
    const repo = build(
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "実験"',
      'git checkout main',
      'git commit -m "本筋"',
      'git checkout topic',
      'git rebase main',
    );
    const layout = layoutGraph(repo);
    const orphans = layout.nodes.filter((n) => n.isOrphan);
    expect(orphans.length).toBe(1);
    expect(orphans[0]?.message).toBe('実験');
  });

  it('座標はNaNにならず重ならない', () => {
    const repo = build(
      'git commit -m "1"',
      'git checkout -b a',
      'git commit -m "2"',
      'git checkout -b b',
      'git commit -m "3"',
      'git checkout main',
      'git merge a',
    );
    const layout = layoutGraph(repo);
    const seen = new Set<string>();
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      const key = `${node.x},${node.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
