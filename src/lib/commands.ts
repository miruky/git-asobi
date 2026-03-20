// コマンドラインの解釈。クォートを含む素朴なトークナイズと、
// 対応するサブコマンドへの振り分けを行う。

import type { CommandResult, Repo } from './repo';

export function tokenize(line: string): string[] | null {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (quote) return null;
  if (hasToken) tokens.push(current);
  return tokens;
}

const HELP_LINES = [
  'git commit -m "メッセージ"   コミットを作る',
  'git branch                  ブランチ一覧',
  'git branch <名前>           ブランチを作る',
  'git branch -d <名前>        マージ済みブランチを削除(-D で強制)',
  'git checkout <参照>         ブランチやコミットへ移動(-b で作成して移動)',
  'git switch <ブランチ>       ブランチへ移動(-c で作成して移動)',
  'git merge <ブランチ>        マージ(fast-forwardまたはマージコミット)',
  'git rebase <ブランチ>       コミットを積み替える',
  'git reset --hard <参照>     ブランチの先端を動かす',
  'git tag [<名前>]            タグ一覧・作成',
  'git log                     歴史を表示',
  'git status                  いまの状態',
  'help                        この一覧',
];

export function execute(repo: Repo, line: string): CommandResult {
  const tokens = tokenize(line);
  if (tokens === null) return { ok: false, output: ['クォートが閉じていません'] };
  if (tokens.length === 0) return { ok: true, output: [] };
  const [first, second, ...rest] = tokens;

  if (first === 'help' || (first === 'git' && second === 'help')) {
    return { ok: true, output: HELP_LINES };
  }
  if (first !== 'git') {
    return {
      ok: false,
      output: [`'${first}' は使えません。gitで始まるコマンドか help を入力してください`],
    };
  }
  if (!second) return { ok: false, output: ['サブコマンドがありません。help で一覧を表示します'] };

  switch (second) {
    case 'commit': {
      const messageIndex = rest.indexOf('-m');
      if (messageIndex === -1 || rest[messageIndex + 1] === undefined) {
        return { ok: false, output: ['コミットメッセージが必要です: git commit -m "メッセージ"'] };
      }
      return repo.commit(rest[messageIndex + 1] as string);
    }
    case 'branch': {
      if (rest.length === 0) return repo.listBranches();
      if (rest[0] === '-d' || rest[0] === '-D') {
        const name = rest[1];
        if (!name) return { ok: false, output: ['削除するブランチ名を指定してください'] };
        return repo.deleteBranch(name, rest[0] === '-D');
      }
      return repo.createBranch(rest[0] as string);
    }
    case 'checkout': {
      if (rest[0] === '-b') {
        const name = rest[1];
        if (!name)
          return { ok: false, output: ['ブランチ名を指定してください: git checkout -b <名前>'] };
        return repo.checkout(name, true);
      }
      if (!rest[0]) return { ok: false, output: ['移動先を指定してください: git checkout <参照>'] };
      return repo.checkout(rest[0], false);
    }
    case 'switch': {
      if (rest[0] === '-c') {
        const name = rest[1];
        if (!name)
          return { ok: false, output: ['ブランチ名を指定してください: git switch -c <名前>'] };
        return repo.checkout(name, true);
      }
      if (!rest[0])
        return { ok: false, output: ['移動先を指定してください: git switch <ブランチ>'] };
      if (!repo.branches.has(rest[0])) {
        return {
          ok: false,
          output: [`ブランチ '${rest[0]}' が見つかりません(switchはブランチ専用です)`],
        };
      }
      return repo.checkout(rest[0], false);
    }
    case 'merge': {
      if (!rest[0]) return { ok: false, output: ['マージするブランチを指定してください'] };
      return repo.merge(rest[0]);
    }
    case 'rebase': {
      if (!rest[0]) return { ok: false, output: ['積み替え先のブランチを指定してください'] };
      return repo.rebase(rest[0]);
    }
    case 'reset': {
      if (rest[0] !== '--hard' || !rest[1]) {
        return {
          ok: false,
          output: ['このシミュレータでは git reset --hard <参照> だけが使えます'],
        };
      }
      return repo.resetHard(rest[1]);
    }
    case 'tag': {
      if (!rest[0]) return repo.listTags();
      return repo.createTag(rest[0]);
    }
    case 'log':
      return repo.log();
    case 'status':
      return repo.status();
    default:
      return {
        ok: false,
        output: [`'git ${second}' には対応していません。help で一覧を表示します`],
      };
  }
}
