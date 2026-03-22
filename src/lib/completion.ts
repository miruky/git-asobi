// Tab補完。コマンド・サブコマンド・参照名(ブランチ / タグ)を、入力中の単語の
// 前方一致で補う。参照名を引数で受け取る純粋関数にして、補完後の行と候補一覧を返す。

export interface Refs {
  branches: string[];
  tags: string[];
}

export interface CompletionResult {
  /** 補完後の行(変化がなければ元のまま) */
  line: string;
  /** 候補が複数あるとき表示する一覧(なければ空) */
  candidates: string[];
}

const TOP_LEVEL = ['git', 'help'];
const SUBCOMMANDS = [
  'commit',
  'branch',
  'checkout',
  'switch',
  'merge',
  'rebase',
  'reset',
  'tag',
  'log',
  'status',
];
// 第3トークン以降で参照名を期待するサブコマンド
const REF_TAKERS = new Set(['checkout', 'switch', 'merge', 'rebase', 'reset', 'branch', 'tag']);

function longestCommonPrefix(words: string[]): string {
  if (words.length === 0) return '';
  let prefix = words[0] as string;
  for (const word of words.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < word.length && prefix[i] === word[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

function candidatePool(prevTokens: string[], refs: Refs): string[] {
  if (prevTokens.length === 0) return TOP_LEVEL;
  if (prevTokens[0] !== 'git') return [];
  if (prevTokens.length === 1) return SUBCOMMANDS;
  return REF_TAKERS.has(prevTokens[1] as string) ? [...refs.branches, ...refs.tags] : [];
}

/** 行末の単語を補完する。フラグ(- で始まる)は対象外。 */
export function complete(line: string, refs: Refs): CompletionResult {
  const match = /^(.*?)(\S*)$/.exec(line);
  if (!match) return { line, candidates: [] };
  const head = match[1] as string;
  const word = match[2] as string;
  if (word.startsWith('-')) return { line, candidates: [] };
  const prevTokens = head.trim().split(/\s+/).filter(Boolean);
  const pool = candidatePool(prevTokens, refs);
  const matches = [...new Set(pool.filter((c) => c.startsWith(word)))];
  if (matches.length === 0) return { line, candidates: [] };
  if (matches.length === 1) return { line: `${head}${matches[0]} `, candidates: [] };
  // 共通接頭辞まで伸ばせるなら伸ばし、候補一覧も返す
  const lcp = longestCommonPrefix(matches);
  const extended = lcp.length > word.length ? lcp : word;
  return { line: `${head}${extended}`, candidates: [...matches].sort() };
}
