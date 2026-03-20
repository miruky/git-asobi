import { describe, expect, it } from 'vitest';
import { execute } from './commands';
import { Repo } from './repo';

function run(repo: Repo, ...lines: string[]): string[] {
  const output: string[] = [];
  for (const line of lines) {
    output.push(...execute(repo, line).output);
  }
  return output;
}

describe('commit', () => {
  it('最初のコミットは親を持たない', () => {
    const repo = new Repo();
    const result = execute(repo, 'git commit -m "初版"');
    expect(result.ok).toBe(true);
    expect(repo.commits.size).toBe(1);
    const commit = [...repo.commits.values()][0];
    expect(commit?.parents).toEqual([]);
    expect(commit?.id).toMatch(/^[0-9a-f]{7}$/);
    expect(repo.branches.get('main')).toBe(commit?.id);
  });

  it('2つ目のコミットは1つ目を親に持つ', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git commit -m "2"');
    const tip = repo.commits.get(repo.branches.get('main') ?? '');
    expect(tip?.parents.length).toBe(1);
  });

  it('-mがないとエラーになる', () => {
    const repo = new Repo();
    const result = execute(repo, 'git commit');
    expect(result.ok).toBe(false);
    expect(result.output[0]).toContain('-m');
  });

  it('クォートに空白を含むメッセージを書ける', () => {
    const repo = new Repo();
    execute(repo, 'git commit -m "空白 を 含む"');
    expect([...repo.commits.values()][0]?.message).toBe('空白 を 含む');
  });
});

describe('branchとcheckout', () => {
  it('ブランチの作成と切り替え', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git branch feature', 'git checkout feature');
    expect(repo.head).toEqual({ type: 'branch', name: 'feature' });
    expect(repo.branches.get('feature')).toBe(repo.branches.get('main'));
  });

  it('checkout -b は作成と切り替えを同時に行う', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git checkout -b topic');
    expect(repo.head).toEqual({ type: 'branch', name: 'topic' });
  });

  it('switchはブランチ専用でコミットへは移動できない', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"');
    const id = repo.branches.get('main') as string;
    expect(execute(repo, `git switch ${id}`).ok).toBe(false);
    expect(execute(repo, 'git switch -c topic').ok).toBe(true);
  });

  it('コミットがないとブランチは作れない', () => {
    const repo = new Repo();
    expect(execute(repo, 'git branch feature').ok).toBe(false);
  });

  it('重複したブランチ名は拒否される', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git branch feature');
    expect(execute(repo, 'git branch feature').ok).toBe(false);
  });

  it('ハッシュの前方一致でdetached HEADになり、そこでのcommitは警告つき', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git commit -m "2"');
    const firstId = [...repo.commits.values()].find((c) => c.seq === 0)?.id as string;
    const result = execute(repo, `git checkout ${firstId.slice(0, 5)}`);
    expect(result.ok).toBe(true);
    expect(repo.head).toEqual({ type: 'detached', id: firstId });
    const commitResult = execute(repo, 'git commit -m "迷子"');
    expect(commitResult.ok).toBe(true);
    expect(commitResult.output.join(' ')).toContain('属していません');
  });

  it('現在のブランチは削除できず、未マージは-dで拒否、-Dで削除できる', () => {
    const repo = new Repo();
    run(
      repo,
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "実験"',
      'git checkout main',
    );
    expect(execute(repo, 'git branch -d topic').ok).toBe(false);
    expect(execute(repo, 'git branch -D topic').ok).toBe(true);
    expect(repo.branches.has('topic')).toBe(false);
  });

  it('マージ済みブランチは-dで削除できる', () => {
    const repo = new Repo();
    run(
      repo,
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "実験"',
      'git checkout main',
      'git merge topic',
    );
    expect(execute(repo, 'git branch -d topic').ok).toBe(true);
  });
});

describe('merge', () => {
  it('一直線ならfast-forwardしてコミットは増えない', () => {
    const repo = new Repo();
    run(
      repo,
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "2"',
      'git checkout main',
    );
    const before = repo.commits.size;
    const result = execute(repo, 'git merge topic');
    expect(result.output[0]).toContain('Fast-forward');
    expect(repo.commits.size).toBe(before);
    expect(repo.branches.get('main')).toBe(repo.branches.get('topic'));
  });

  it('分岐していればマージコミットができ、親が2つある', () => {
    const repo = new Repo();
    run(
      repo,
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "実験"',
      'git checkout main',
      'git commit -m "本筋"',
    );
    const result = execute(repo, 'git merge topic');
    expect(result.ok).toBe(true);
    const tip = repo.commits.get(repo.branches.get('main') ?? '');
    expect(tip?.parents.length).toBe(2);
    expect(tip?.message).toBe(`Merge branch 'topic'`);
  });

  it('取り込み済みならAlready up to date', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git branch topic', 'git commit -m "2"');
    const result = execute(repo, 'git merge topic');
    expect(result.output[0]).toContain('Already up to date');
  });

  it('detached HEADではマージできない', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git branch topic', 'git commit -m "2"');
    const firstId = [...repo.commits.values()].find((c) => c.seq === 0)?.id as string;
    execute(repo, `git checkout ${firstId}`);
    expect(execute(repo, 'git merge topic').ok).toBe(false);
  });
});

describe('rebase', () => {
  it('分岐したブランチを積み替えると新しいIDで複製され、元は孤児になる', () => {
    const repo = new Repo();
    run(
      repo,
      'git commit -m "1"',
      'git checkout -b topic',
      'git commit -m "実験1"',
      'git commit -m "実験2"',
      'git checkout main',
      'git commit -m "本筋"',
      'git checkout topic',
    );
    const oldTip = repo.branches.get('topic') as string;
    const result = execute(repo, 'git rebase main');
    expect(result.ok).toBe(true);
    expect(result.output.filter((line) => line.startsWith('Applying')).length).toBe(2);
    const newTip = repo.branches.get('topic') as string;
    expect(newTip).not.toBe(oldTip);
    expect(repo.isAncestor(repo.branches.get('main') as string, newTip)).toBe(true);
    expect(repo.commits.has(oldTip)).toBe(true);
    expect(repo.isAncestor(oldTip, newTip)).toBe(false);
  });

  it('遅れているだけならfast-forwardになる', () => {
    const repo = new Repo();
    run(
      repo,
      'git commit -m "1"',
      'git checkout -b topic',
      'git checkout main',
      'git commit -m "2"',
      'git checkout topic',
    );
    const result = execute(repo, 'git rebase main');
    expect(result.output[0]).toContain('Fast-forward');
    expect(repo.branches.get('topic')).toBe(repo.branches.get('main'));
  });
});

describe('reset / tag / log / status', () => {
  it('reset --hardでブランチの先端が戻る', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git commit -m "2"');
    const firstId = [...repo.commits.values()].find((c) => c.seq === 0)?.id as string;
    const result = execute(repo, `git reset --hard ${firstId}`);
    expect(result.ok).toBe(true);
    expect(repo.branches.get('main')).toBe(firstId);
  });

  it('タグを付けてタグ名で参照できる', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git tag v1.0', 'git commit -m "2"');
    expect(execute(repo, 'git reset --hard v1.0').ok).toBe(true);
    expect(repo.branches.get('main')).toBe(repo.tags.get('v1.0'));
  });

  it('logはHEADから届くコミットを新しい順に並べ、参照を飾る', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"', 'git commit -m "2"');
    const lines = execute(repo, 'git log').output;
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('HEAD');
    expect(lines[0]).toContain('main');
    expect(lines[0]).toContain('2');
    expect(lines[1]).toContain('1');
  });

  it('statusは現在のブランチまたはdetachedを表示する', () => {
    const repo = new Repo();
    run(repo, 'git commit -m "1"');
    expect(execute(repo, 'git status').output[0]).toBe('On branch main');
  });
});

describe('入力の解釈', () => {
  it('git以外のコマンドとgitの未対応サブコマンドを案内する', () => {
    const repo = new Repo();
    expect(execute(repo, 'ls -la').ok).toBe(false);
    expect(execute(repo, 'git stash').ok).toBe(false);
    expect(execute(repo, 'git stash').output[0]).toContain('help');
  });

  it('helpは対応コマンドの一覧を返す', () => {
    const repo = new Repo();
    const lines = execute(repo, 'help').output;
    expect(lines.length).toBeGreaterThan(8);
    expect(lines.join('\n')).toContain('git merge');
  });

  it('閉じていないクォートはエラー', () => {
    const repo = new Repo();
    expect(execute(repo, 'git commit -m "途中まで').ok).toBe(false);
  });

  it('空行は何もしない', () => {
    const repo = new Repo();
    const result = execute(repo, '   ');
    expect(result.ok).toBe(true);
    expect(result.output).toEqual([]);
  });
});
