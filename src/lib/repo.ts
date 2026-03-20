// ミニチュアのGitエンジン。ファイルの中身は持たず、コミットグラフと参照
// (ブランチ・タグ・HEAD)の動きだけを忠実に再現する。各操作は実行結果の
// メッセージ列を返し、グラフの状態は外から直接読む。

export interface Commit {
  id: string;
  parents: string[];
  message: string;
  // 作成時に居たブランチのレーン。グラフ描画の列に使う
  lane: number;
  seq: number;
}

export type Head = { type: 'branch'; name: string } | { type: 'detached'; id: string };

export interface CommandResult {
  ok: boolean;
  output: string[];
}

const ok = (...output: string[]): CommandResult => ({ ok: true, output });
const fail = (...output: string[]): CommandResult => ({ ok: false, output });

export class Repo {
  readonly commits = new Map<string, Commit>();
  readonly branches = new Map<string, string>();
  readonly tags = new Map<string, string>();
  head: Head = { type: 'branch', name: 'main' };
  private seq = 0;
  private readonly laneOf = new Map<string, number>([['main', 0]]);
  private nextLane = 1;

  // カウンタから決定的に7桁の疑似ハッシュを作る(衝突時はずらして再計算)
  private newId(): string {
    for (let n = this.seq; ; n += 9973) {
      let x = Math.imul(n + 1, 0x9e3779b9);
      x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
      x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
      x = (x ^ (x >>> 16)) >>> 0;
      const id = x.toString(16).padStart(8, '0').slice(0, 7);
      if (!this.commits.has(id)) return id;
    }
  }

  headCommitId(): string | null {
    if (this.head.type === 'detached') return this.head.id;
    return this.branches.get(this.head.name) ?? null;
  }

  currentLane(): number {
    if (this.head.type === 'branch') return this.laneOf.get(this.head.name) ?? 0;
    const commit = this.commits.get(this.head.id);
    return commit ? commit.lane : 0;
  }

  // ブランチ名・タグ名・ハッシュ(4文字以上の前方一致)をコミットIDへ解決する
  resolve(ref: string): string | null {
    const viaBranch = this.branches.get(ref);
    if (viaBranch) return viaBranch;
    const viaTag = this.tags.get(ref);
    if (viaTag) return viaTag;
    if (ref === 'HEAD') return this.headCommitId();
    if (/^[0-9a-f]{4,40}$/.test(ref)) {
      const matches = [...this.commits.keys()].filter((id) => id.startsWith(ref));
      if (matches.length === 1) return matches[0] as string;
    }
    return null;
  }

  reachableFrom(id: string): Set<string> {
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      const commit = this.commits.get(current);
      if (commit) stack.push(...commit.parents);
    }
    return seen;
  }

  isAncestor(ancestor: string, descendant: string): boolean {
    return this.reachableFrom(descendant).has(ancestor);
  }

  commit(message: string): CommandResult {
    const parentId = this.headCommitId();
    const commit: Commit = {
      id: this.newId(),
      parents: parentId ? [parentId] : [],
      message,
      lane: this.currentLane(),
      seq: this.seq++,
    };
    this.commits.set(commit.id, commit);
    if (this.head.type === 'branch') {
      this.branches.set(this.head.name, commit.id);
      return ok(`[${this.head.name} ${commit.id}] ${message}`);
    }
    this.head = { type: 'detached', id: commit.id };
    return ok(
      `[HEAD切り離し ${commit.id}] ${message}`,
      '注意: このコミットはどのブランチにも属していません',
    );
  }

  createBranch(name: string): CommandResult {
    if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(name)) {
      return fail(`'${name}' はブランチ名に使えません`);
    }
    if (this.branches.has(name)) return fail(`ブランチ '${name}' は既に存在します`);
    const headId = this.headCommitId();
    if (!headId) return fail('まだコミットがありません。先に git commit してください');
    this.branches.set(name, headId);
    if (!this.laneOf.has(name)) this.laneOf.set(name, this.nextLane++);
    return ok(`ブランチ '${name}' を ${headId} に作成しました`);
  }

  deleteBranch(name: string, force: boolean): CommandResult {
    if (this.head.type === 'branch' && this.head.name === name) {
      return fail(`現在いるブランチ '${name}' は削除できません`);
    }
    const tip = this.branches.get(name);
    if (!tip) return fail(`ブランチ '${name}' が見つかりません`);
    const headId = this.headCommitId();
    if (!force && (!headId || !this.isAncestor(tip, headId))) {
      return fail(
        `ブランチ '${name}' はマージされていません`,
        '取り込んでから削除するか、git branch -D で強制削除してください',
      );
    }
    this.branches.delete(name);
    return ok(`ブランチ '${name}' を削除しました(先端は ${tip} でした)`);
  }

  listBranches(): CommandResult {
    if (this.branches.size === 0) return ok('(ブランチはまだありません)');
    const lines = [...this.branches.keys()]
      .sort()
      .map((name) =>
        this.head.type === 'branch' && this.head.name === name ? `* ${name}` : `  ${name}`,
      );
    return ok(...lines);
  }

  checkout(target: string, create: boolean): CommandResult {
    if (create) {
      const created = this.createBranch(target);
      if (!created.ok) return created;
      this.head = { type: 'branch', name: target };
      return ok(`新しいブランチ '${target}' に切り替えました`);
    }
    if (this.branches.has(target)) {
      if (this.head.type === 'branch' && this.head.name === target) {
        return ok(`すでに '${target}' にいます`);
      }
      this.head = { type: 'branch', name: target };
      return ok(`ブランチ '${target}' に切り替えました`);
    }
    const id = this.resolve(target);
    if (!id) return fail(`'${target}' というブランチもコミットも見つかりません`);
    this.head = { type: 'detached', id };
    return ok(
      `HEADを ${id} に切り離しました(detached HEAD)`,
      'ブランチに戻るには git checkout <ブランチ名>',
    );
  }

  merge(name: string): CommandResult {
    if (this.head.type === 'detached') {
      return fail('detached HEADではマージできません。先にブランチへ戻ってください');
    }
    const targetId = this.branches.get(name);
    if (!targetId) return fail(`ブランチ '${name}' が見つかりません`);
    if (name === this.head.name) return fail('自分自身はマージできません');
    const headId = this.headCommitId();
    if (!headId) return fail('まだコミットがありません');
    if (this.isAncestor(targetId, headId)) {
      return ok('Already up to date. (取り込むものがありません)');
    }
    if (this.isAncestor(headId, targetId)) {
      this.branches.set(this.head.name, targetId);
      return ok(`Fast-forward: ${this.head.name} を ${targetId} まで進めました`);
    }
    const message = `Merge branch '${name}'`;
    const commit: Commit = {
      id: this.newId(),
      parents: [headId, targetId],
      message,
      lane: this.currentLane(),
      seq: this.seq++,
    };
    this.commits.set(commit.id, commit);
    this.branches.set(this.head.name, commit.id);
    return ok(`マージコミット ${commit.id} を作成しました(親: ${headId}, ${targetId})`);
  }

  rebase(name: string): CommandResult {
    if (this.head.type === 'detached') {
      return fail('detached HEADではrebaseできません。先にブランチへ戻ってください');
    }
    const ontoId = this.branches.get(name);
    if (!ontoId) return fail(`ブランチ '${name}' が見つかりません`);
    if (name === this.head.name) return fail('自分自身にはrebaseできません');
    const headId = this.headCommitId();
    if (!headId) return fail('まだコミットがありません');
    if (this.isAncestor(headId, ontoId)) {
      this.branches.set(this.head.name, ontoId);
      return ok(`Fast-forward: ${this.head.name} を ${ontoId} まで進めました`);
    }
    if (this.isAncestor(ontoId, headId)) {
      return ok('Current branch is up to date. (積み替えるものがありません)');
    }
    const ontoReachable = this.reachableFrom(ontoId);
    const toReplay = [...this.reachableFrom(headId)]
      .filter((id) => !ontoReachable.has(id))
      .map((id) => this.commits.get(id) as Commit)
      .sort((a, b) => a.seq - b.seq);
    const lane = this.currentLane();
    let parent = ontoId;
    const output: string[] = [];
    for (const original of toReplay) {
      const replayed: Commit = {
        id: this.newId(),
        parents: [parent],
        message: original.message,
        lane,
        seq: this.seq++,
      };
      this.commits.set(replayed.id, replayed);
      output.push(`Applying: ${original.message} (${original.id} → ${replayed.id})`);
      parent = replayed.id;
    }
    this.branches.set(this.head.name, parent);
    output.push(`${this.head.name} を ${name} の上に積み替えました`);
    output.push('元のコミットはどの参照からも届かなくなりました(灰色で残ります)');
    return { ok: true, output };
  }

  resetHard(ref: string): CommandResult {
    const id = this.resolve(ref);
    if (!id) return fail(`'${ref}' を解決できません`);
    if (this.head.type === 'branch') {
      this.branches.set(this.head.name, id);
      return ok(`HEAD is now at ${id} (${this.head.name} を移動しました)`);
    }
    this.head = { type: 'detached', id };
    return ok(`HEAD is now at ${id}`);
  }

  createTag(name: string): CommandResult {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return fail(`'${name}' はタグ名に使えません`);
    if (this.tags.has(name)) return fail(`タグ '${name}' は既に存在します`);
    const headId = this.headCommitId();
    if (!headId) return fail('まだコミットがありません');
    this.tags.set(name, headId);
    return ok(`タグ '${name}' を ${headId} に付けました`);
  }

  listTags(): CommandResult {
    if (this.tags.size === 0) return ok('(タグはまだありません)');
    return ok(...[...this.tags.keys()].sort());
  }

  log(): CommandResult {
    const headId = this.headCommitId();
    if (!headId) return ok('(まだコミットがありません)');
    const reachable = [...this.reachableFrom(headId)]
      .map((id) => this.commits.get(id) as Commit)
      .sort((a, b) => b.seq - a.seq);
    const lines = reachable.map((commit) => {
      const refs: string[] = [];
      if (headId === commit.id) refs.push('HEAD');
      for (const [name, id] of this.branches) if (id === commit.id) refs.push(name);
      for (const [name, id] of this.tags) if (id === commit.id) refs.push(`tag: ${name}`);
      const decoration = refs.length > 0 ? ` (${refs.join(', ')})` : '';
      return `${commit.id}${decoration} ${commit.message}`;
    });
    return ok(...lines);
  }

  status(): CommandResult {
    const lines: string[] = [];
    if (this.head.type === 'branch') {
      lines.push(`On branch ${this.head.name}`);
    } else {
      lines.push(`HEAD detached at ${this.head.id}`);
    }
    lines.push('nothing to commit, working tree clean(このシミュレータに作業ツリーはありません)');
    return ok(...lines);
  }

  // 描画用: ブランチに割り当てたレーン番号
  branchLane(name: string): number {
    return this.laneOf.get(name) ?? 0;
  }
}
