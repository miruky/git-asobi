import { describe, expect, it } from 'vitest';
import { complete, type Refs } from './completion';

const refs: Refs = { branches: ['main', 'feature', 'fix'], tags: ['v1'] };

describe('complete', () => {
  it('一意に決まるサブコマンドは末尾に空白をつけて補完する', () => {
    expect(complete('git comm', refs)).toEqual({ line: 'git commit ', candidates: [] });
  });

  it('複数候補は共通接頭辞まで伸ばし、一覧を返す', () => {
    const result = complete('git c', refs);
    expect(result.line).toBe('git c'); // commit / checkout の共通接頭辞は "c"
    expect(result.candidates).toContain('commit');
    expect(result.candidates).toContain('checkout');
  });

  it('git の後の空白では全サブコマンドが候補になる', () => {
    const result = complete('git ', refs);
    expect(result.line).toBe('git ');
    expect(result.candidates).toContain('merge');
    expect(result.candidates).toContain('rebase');
  });

  it('checkout の引数はブランチ名とタグ名で補完する', () => {
    expect(complete('git checkout fe', refs)).toEqual({
      line: 'git checkout feature ',
      candidates: [],
    });
  });

  it('参照名の共通接頭辞で複数候補を返す', () => {
    const result = complete('git switch f', refs);
    expect(result.line).toBe('git switch f'); // feature / fix の共通接頭辞は "f"
    expect(result.candidates).toEqual(['feature', 'fix']);
  });

  it('タグも参照候補に含まれる', () => {
    expect(complete('git reset v', refs)).toEqual({ line: 'git reset v1 ', candidates: [] });
  });

  it('一致しなければ行を変えない', () => {
    expect(complete('git zzz', refs)).toEqual({ line: 'git zzz', candidates: [] });
  });

  it('フラグは補完しない', () => {
    expect(complete('git branch -', refs)).toEqual({ line: 'git branch -', candidates: [] });
  });

  it('先頭の単語は git / help を候補にする', () => {
    expect(complete('hel', refs)).toEqual({ line: 'help ', candidates: [] });
  });
});
