// ターミナル風UI。実行のたびにプロンプト行と結果を追記し、上下キーで入力履歴を
// たどり、Tabでコマンド・参照名を補完できる。DOMの肥大を防ぐため古い行は捨てる。

import type { CompletionResult } from '../lib/completion';

export type LineKind = 'prompt' | 'output' | 'error' | 'note';

const MAX_LINES = 400;

export class Terminal {
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private history: string[] = [];
  private pos = 0;
  private draft = '';

  constructor(
    host: HTMLElement,
    onSubmit: (line: string) => void,
    onComplete?: (line: string) => CompletionResult,
  ) {
    host.innerHTML = `
      <div class="term-log" role="log" aria-live="polite" aria-label="コマンドの実行結果"></div>
      <form class="term-form">
        <span class="term-ps1" aria-hidden="true">$</span>
        <input
          class="term-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="send"
          aria-label="gitコマンド入力"
          placeholder='git commit -m "メッセージ" または help'
        />
      </form>`;
    this.log = host.querySelector('.term-log') as HTMLElement;
    this.input = host.querySelector('.term-input') as HTMLInputElement;
    const form = host.querySelector('.term-form') as HTMLFormElement;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const line = this.input.value;
      if (line.trim() === '') return;
      this.history.push(line);
      this.pos = this.history.length;
      this.draft = '';
      this.input.value = '';
      onSubmit(line);
    });

    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') {
        if (this.pos === 0) return;
        if (this.pos === this.history.length) this.draft = this.input.value;
        this.pos -= 1;
        this.input.value = this.history[this.pos] ?? '';
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        if (this.pos >= this.history.length) return;
        this.pos += 1;
        this.input.value =
          this.pos === this.history.length ? this.draft : (this.history[this.pos] ?? '');
        event.preventDefault();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (!onComplete) return;
        const result = onComplete(this.input.value);
        this.input.value = result.line;
        if (result.candidates.length > 0) this.print(result.candidates.join('   '), 'note');
      }
    });

    // 行間の余白をクリックしても入力へ戻れるようにする
    host.addEventListener('click', (event) => {
      if (window.getSelection()?.toString()) return;
      if (event.target === host || event.target === this.log) this.input.focus();
    });
  }

  print(line: string, kind: LineKind): void {
    this.printLines([line], kind);
  }

  printLines(lines: string[], kind: LineKind): void {
    for (const [index, line] of lines.entries()) {
      const el = document.createElement('div');
      el.className = `term-line term-${kind}`;
      el.textContent = line;
      el.style.setProperty('--stagger', `${index * 35}ms`);
      this.log.append(el);
    }
    while (this.log.childElementCount > MAX_LINES) {
      this.log.firstElementChild?.remove();
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  focus(): void {
    this.input.focus();
  }
}
