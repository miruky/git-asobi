export interface Scenario {
  id: string;
  name: string;
  description: string;
  commands: string[];
}

export const scenarios: Scenario[] = [
  {
    id: 'fresh',
    name: 'まっさら',
    description: '空のリポジトリから始める',
    commands: [],
  },
  {
    id: 'first-steps',
    name: '最初の一歩',
    description: 'mainに2つのコミットがある状態',
    commands: ['git commit -m "初版"', 'git commit -m "READMEを追加"'],
  },
  {
    id: 'branch-practice',
    name: 'ブランチ練習',
    description: 'featureブランチとmainが分岐した状態',
    commands: [
      'git commit -m "初版"',
      'git commit -m "土台を作る"',
      'git checkout -b feature',
      'git commit -m "新機能の下書き"',
      'git checkout main',
      'git commit -m "誤字を直す"',
    ],
  },
  {
    id: 'merge-practice',
    name: 'マージ練習',
    description: '2本のブランチを統合する直前の状態',
    commands: [
      'git commit -m "初版"',
      'git checkout -b topic',
      'git commit -m "実験その1"',
      'git commit -m "実験その2"',
      'git checkout main',
      'git commit -m "本筋の修正"',
    ],
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}
