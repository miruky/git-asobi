// 実行したコマンド列をURLのハッシュに載せて共有する。
// base64url(UTF-8のJSON) という素朴な形式で、読めなければ黙って無視する。

export function encodeCommands(commands: string[]): string {
  const json = JSON.stringify(commands);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCommands(encoded: string): string[] | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((item): item is string => typeof item === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function replayHash(commands: string[]): string {
  return commands.length > 0 ? `#replay=${encodeCommands(commands)}` : '';
}

export function commandsFromHash(hash: string): string[] | null {
  const match = /^#replay=(.+)$/.exec(hash);
  if (!match || match[1] === undefined) return null;
  return decodeCommands(match[1]);
}
