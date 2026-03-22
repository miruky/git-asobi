// 画面の組み立てと配線。状態は「成功した変更系コマンドの列」が正で、
// グラフはそれを再生したRepoから毎回計算する。列はURLハッシュと
// localStorageに保存し、共有と再開の両方を同じ仕組みでまかなう。

import './style.css';
import { execute, tokenize } from './lib/commands';
import { layoutGraph } from './lib/graphlayout';
import { Repo } from './lib/repo';
import { scenarioById, scenarios } from './lib/scenarios';
import { commandsFromHash, replayHash } from './lib/share';
import { store } from './lib/storage';
import {
  THEME_STORAGE_KEY,
  choiceLabel,
  nextChoice,
  parseChoice,
  resolveTheme,
  type ThemeChoice,
} from './lib/theme';
import { GraphView } from './ui/graphview';
import { Terminal } from './ui/terminal';

const STORAGE_KEY = 'git-asobi:commands';

const THEME_ICON = `<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/></svg>`;

const BRAND_MARK = `
  <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" class="mark-bg" />
    <path d="M 22 14 V 50" class="mark-main" />
    <path d="M 22 18 C 38 22, 42 24, 42 32 C 42 40, 38 42, 22 46" class="mark-branch" />
    <circle cx="22" cy="14" r="5" class="mark-dot mark-dot-main" />
    <circle cx="42" cy="32" r="5" class="mark-dot mark-dot-branch" />
    <circle cx="22" cy="50" r="5" class="mark-dot mark-dot-main" />
  </svg>`;

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

app.innerHTML = `
  <div class="app">
    <header class="app-header">
      <div class="brand">
        ${BRAND_MARK}
        <div class="brand-text">
          <p class="kicker">Git Playground</p>
          <h1>git-asobi</h1>
          <p class="tagline">コマンドを打つとコミットグラフが動く、Git学習シミュレータ</p>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="button theme-toggle" id="theme-toggle">${THEME_ICON}<span id="theme-label">自動</span></button>
        <button type="button" class="button" id="share-button">URLで共有</button>
        <button type="button" class="button" id="reset-button">空に戻す</button>
      </div>
    </header>
    <nav class="scenario-bar" aria-label="シナリオ">
      <span class="scenario-label">シナリオ</span>
      ${scenarios
        .map(
          (scenario) =>
            `<button type="button" class="chip" data-scenario="${scenario.id}" aria-pressed="false" title="${scenario.description}">${scenario.name}</button>`,
        )
        .join('')}
    </nav>
    <main class="panes">
      <section class="pane graph-pane" aria-label="コミットグラフ">
        <div class="graph-scroll" id="graph-host"></div>
        <p class="graph-empty" id="graph-empty">
          まだコミットがありません。ターミナルで
          <code>git commit -m "最初のコミット"</code> を実行してみてください。
        </p>
      </section>
      <section class="pane terminal-pane" aria-label="ターミナル" id="terminal-host"></section>
    </main>
    <footer class="app-footer">
      <p>
        すべてブラウザ内だけで動き、入力はこの端末のlocalStorageとURLにだけ残ります。
        <a href="https://github.com/miruky/git-asobi">ソースコード</a>
      </p>
    </footer>
  </div>`;

let repo = new Repo();
let executed: string[] = [];

const graphHost = document.getElementById('graph-host') as HTMLElement;
const graphEmpty = document.getElementById('graph-empty') as HTMLElement;
const graph = new GraphView(graphHost);
const terminal = new Terminal(document.getElementById('terminal-host') as HTMLElement, handleLine);
const scenarioButtons = [...app.querySelectorAll<HTMLButtonElement>('[data-scenario]')];

// テーマ切替(自動 / ライト / ダーク)。選択は保存し、自動時はOSに追従する。
function setupTheme(): void {
  const btn = document.getElementById('theme-toggle') as HTMLButtonElement | null;
  const labelEl = document.getElementById('theme-label');
  if (!btn || !labelEl) return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let choice: ThemeChoice = parseChoice(store.getItem(THEME_STORAGE_KEY));
  const apply = (): void => {
    document.documentElement.dataset.theme = resolveTheme(choice, media.matches);
    labelEl.textContent = choiceLabel(choice);
    btn.dataset.choice = choice;
    btn.setAttribute('aria-label', `テーマ: ${choiceLabel(choice)}。クリックで切り替え`);
  };
  btn.addEventListener('click', () => {
    choice = nextChoice(choice);
    store.setItem(THEME_STORAGE_KEY, choice);
    apply();
  });
  media.addEventListener('change', () => {
    if (choice === 'system') apply();
  });
  apply();
}
setupTheme();

// log・status・一覧表示はグラフを変えないので、再生列には変更系だけを残す
function isMutation(line: string): boolean {
  const tokens = tokenize(line) ?? [];
  if (tokens[0] !== 'git') return false;
  const sub = tokens[1];
  if (sub === 'log' || sub === 'status' || sub === 'help') return false;
  if ((sub === 'branch' || sub === 'tag') && tokens.length === 2) return false;
  return true;
}

function renderGraph(): void {
  const layout = layoutGraph(repo);
  graph.render(layout);
  graphEmpty.hidden = layout.nodes.length > 0;
}

function persist(): void {
  store.setItem(STORAGE_KEY, JSON.stringify(executed));
  const hash = replayHash(executed);
  history.replaceState(null, '', hash !== '' ? hash : location.pathname + location.search);
}

function replay(lines: string[]): number {
  let applied = 0;
  for (const line of lines) {
    if (execute(repo, line).ok && isMutation(line)) {
      executed.push(line);
      applied += 1;
    }
  }
  return applied;
}

function setActiveScenario(active: HTMLButtonElement | null): void {
  for (const button of scenarioButtons) {
    button.setAttribute('aria-pressed', String(button === active));
  }
}

function handleLine(line: string): void {
  terminal.print(`$ ${line}`, 'prompt');
  const result = execute(repo, line);
  if (result.ok && isMutation(line)) {
    executed.push(line);
    persist();
  }
  terminal.printLines(result.output, result.ok ? 'output' : 'error');
  renderGraph();
  setActiveScenario(null);
}

for (const button of scenarioButtons) {
  button.addEventListener('click', () => {
    const scenario = scenarioById(button.dataset.scenario ?? '');
    if (!scenario) return;
    repo = new Repo();
    executed = [];
    replay(scenario.commands);
    persist();
    renderGraph();
    terminal.print(`シナリオ「${scenario.name}」: ${scenario.description}`, 'note');
    setActiveScenario(button);
    terminal.focus();
  });
}

document.getElementById('reset-button')?.addEventListener('click', () => {
  repo = new Repo();
  executed = [];
  persist();
  renderGraph();
  terminal.print('リポジトリを空に戻しました', 'note');
  setActiveScenario(null);
  terminal.focus();
});

document.getElementById('share-button')?.addEventListener('click', () => {
  const button = document.getElementById('share-button') as HTMLButtonElement;
  navigator.clipboard
    .writeText(location.href)
    .then(() => {
      const original = button.textContent;
      button.textContent = 'コピーしました';
      button.disabled = true;
      window.setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 1600);
    })
    .catch(() => {
      terminal.print('コピーできませんでした。アドレスバーのURLをそのまま共有してください', 'note');
    });
});

function savedCommands(): string[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // 壊れた保存データは初回起動と同じ扱いにする
  }
  return [];
}

const fromUrl = commandsFromHash(location.hash);
if (fromUrl && fromUrl.length > 0) {
  const applied = replay(fromUrl);
  terminal.print(`共有URLからコマンドを${applied}件再生しました`, 'note');
} else {
  const saved = savedCommands();
  if (saved.length > 0) {
    const applied = replay(saved);
    terminal.print(`前回の続きです(${applied}件のコマンドを再生)`, 'note');
  } else {
    terminal.print('コマンドを打つと右のグラフが動きます。help で一覧を表示します', 'note');
  }
}
persist();
renderGraph();
terminal.focus();
