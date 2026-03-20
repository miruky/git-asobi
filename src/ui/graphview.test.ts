// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { execute } from '../lib/commands';
import { layoutGraph } from '../lib/graphlayout';
import { Repo } from '../lib/repo';
import { GraphView } from './graphview';

function repoWith(...lines: string[]): Repo {
  const repo = new Repo();
  for (const line of lines) execute(repo, line);
  return repo;
}

function mount(): { host: HTMLElement; view: GraphView } {
  const host = document.createElement('div');
  document.body.append(host);
  return { host, view: new GraphView(host) };
}

describe('GraphView', () => {
  it('コミット数ぶんのノードと親子数ぶんのエッジを描く', () => {
    const { host, view } = mount();
    view.render(layoutGraph(repoWith('git commit -m "1"', 'git commit -m "2"')));
    expect(host.querySelectorAll('.node').length).toBe(2);
    expect(host.querySelectorAll('.edge').length).toBe(1);
    const svg = host.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
  });

  it('HEADのノードにだけリングが付く', () => {
    const { host, view } = mount();
    view.render(layoutGraph(repoWith('git commit -m "1"', 'git commit -m "2"')));
    expect(host.querySelectorAll('.head-ring').length).toBe(1);
  });

  it('再描画では同じコミットのDOM要素を使い回す', () => {
    const { host, view } = mount();
    const repo = repoWith('git commit -m "1"');
    view.render(layoutGraph(repo));
    const before = host.querySelector('.node');
    execute(repo, 'git commit -m "2"');
    view.render(layoutGraph(repo));
    const nodes = [...host.querySelectorAll('.node')];
    expect(nodes.length).toBe(2);
    expect(nodes).toContain(before);
  });

  it('別のリポジトリを描くと前のノードは消える', () => {
    const { host, view } = mount();
    view.render(layoutGraph(repoWith('git commit -m "1"', 'git commit -m "2"')));
    view.render(layoutGraph(repoWith('git commit -m "別"')));
    expect(host.querySelectorAll('.node').length).toBe(1);
    expect(host.querySelectorAll('.edge').length).toBe(0);
  });

  it('rebaseで孤児になったノードはorphanクラスと破線エッジになる', () => {
    const { host, view } = mount();
    const repo = repoWith(
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "実験"',
      'git checkout main',
      'git commit -m "本筋"',
      'git checkout topic',
      'git rebase main',
    );
    view.render(layoutGraph(repo));
    expect(host.querySelectorAll('.node.orphan').length).toBe(1);
    expect(host.querySelectorAll('.edge.orphan').length).toBe(1);
  });

  it('ブランチ先端にチップ、各ノードにメッセージが描かれる', () => {
    const { host, view } = mount();
    view.render(layoutGraph(repoWith('git commit -m "初版"', 'git tag v1')));
    const chipTexts = [...host.querySelectorAll('.chip text')].map((el) => el.textContent);
    expect(chipTexts).toContain('HEAD');
    expect(chipTexts).toContain('main');
    expect(chipTexts).toContain('v1');
    const messages = [...host.querySelectorAll('.msg')].map((el) => el.textContent);
    expect(messages).toContain('初版');
  });
});
