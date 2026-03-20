// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { store } from './storage';

describe('store', () => {
  beforeEach(() => {
    store.clear();
  });

  it('値の保存・取得・削除ができる', () => {
    expect(store.getItem('key')).toBeNull();
    store.setItem('key', 'value');
    expect(store.getItem('key')).toBe('value');
    store.removeItem('key');
    expect(store.getItem('key')).toBeNull();
  });

  it('clearで全件消える', () => {
    store.setItem('a', '1');
    store.setItem('b', '2');
    store.clear();
    expect(store.getItem('a')).toBeNull();
    expect(store.getItem('b')).toBeNull();
  });

  it('同じキーへの上書きは最後の値が勝つ', () => {
    store.setItem('key', 'old');
    store.setItem('key', 'new');
    expect(store.getItem('key')).toBe('new');
  });
});
