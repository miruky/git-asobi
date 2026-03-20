// 進捗と下書きの保存先。localStorageが使えない環境(プライベートモードや
// 不完全なテスト環境)では、セッション内だけ生きるメモリ実装に切り替える。

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  };
}

function detect(): KeyValueStore {
  try {
    const candidate = window.localStorage;
    const probe = '__git-asobi-probe__';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    if (typeof candidate.clear !== 'function') return memoryStore();
    return candidate;
  } catch {
    return memoryStore();
  }
}

export const store: KeyValueStore = detect();
