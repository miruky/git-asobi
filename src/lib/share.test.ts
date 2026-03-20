import { describe, expect, it } from 'vitest';
import { commandsFromHash, decodeCommands, encodeCommands, replayHash } from './share';

describe('share', () => {
  it('コマンド列をエンコードして復元できる', () => {
    const commands = ['git commit -m "日本語 メッセージ"', 'git checkout -b feature'];
    const encoded = encodeCommands(commands);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCommands(encoded)).toEqual(commands);
  });

  it('壊れた入力はnullになる', () => {
    expect(decodeCommands('!!!')).toBeNull();
    expect(decodeCommands(encodeCommands([]).slice(1))).toBeNull();
    expect(decodeCommands(btoa('{"not":"array"}'))).toBeNull();
  });

  it('replayHashとcommandsFromHashが対になっている', () => {
    const commands = ['git commit -m "a"'];
    const hash = replayHash(commands);
    expect(hash.startsWith('#replay=')).toBe(true);
    expect(commandsFromHash(hash)).toEqual(commands);
    expect(replayHash([])).toBe('');
    expect(commandsFromHash('#other')).toBeNull();
  });
});
