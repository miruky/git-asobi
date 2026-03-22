// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';

// main.ts はimport時に画面を組み立てるので、先に#appを用意してから読み込む
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('./main');
});

function typeCommand(line: string): void {
  const input = document.querySelector('.term-input') as HTMLInputElement;
  const form = document.querySelector('.term-form') as HTMLFormElement;
  input.value = line;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('main', () => {
  it('起動するとヘッダー・シナリオ・グラフ・ターミナルが組み上がる', () => {
    expect(document.querySelector('h1')?.textContent).toBe('git-asobi');
    expect(document.querySelectorAll('[data-scenario]').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('.graph-pane svg')).not.toBeNull();
    expect(document.querySelector('.term-input')).not.toBeNull();
    expect((document.getElementById('graph-empty') as HTMLElement).hidden).toBe(false);
  });

  it('コマンドを打つとノードが増え、出力がログに残り、URLに状態が載る', () => {
    typeCommand('git commit -m "最初のコミット"');
    expect(document.querySelectorAll('.node').length).toBe(1);
    expect((document.getElementById('graph-empty') as HTMLElement).hidden).toBe(true);
    const log = document.querySelector('.term-log') as HTMLElement;
    expect(log.textContent).toContain('最初のコミット');
    expect(location.hash.startsWith('#replay=')).toBe(true);
  });

  it('失敗したコマンドはエラー行になり、状態を変えない', () => {
    const before = location.hash;
    typeCommand('git merge nai-branch');
    expect(document.querySelector('.term-error')).not.toBeNull();
    expect(location.hash).toBe(before);
  });

  it('シナリオを選ぶと初期状態が再生される', () => {
    const chip = document.querySelector<HTMLButtonElement>('[data-scenario="merge-practice"]');
    chip?.click();
    expect(document.querySelectorAll('.node').length).toBe(4);
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
  });

  it('空に戻すとグラフが消えて空状態の案内に戻る', () => {
    document.getElementById('reset-button')?.click();
    expect(document.querySelectorAll('.node').length).toBe(0);
    expect((document.getElementById('graph-empty') as HTMLElement).hidden).toBe(false);
    expect(location.hash).toBe('');
  });

  it('Tabキーでコマンドを補完できる', () => {
    const input = document.querySelector('.term-input') as HTMLInputElement;
    input.value = 'git comm';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true }),
    );
    expect(input.value).toBe('git commit ');
  });

  it('テーマトグルは自動→ライト→ダークと巡回し、html要素へ反映する', () => {
    const toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
    expect(toggle.dataset.choice).toBe('system');
    toggle.click();
    expect(toggle.dataset.choice).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    toggle.click();
    expect(toggle.dataset.choice).toBe('dark');
  });
});
