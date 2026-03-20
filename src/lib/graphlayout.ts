// コミットグラフのSVG座標計算。列はコミット作成時のブランチレーン、
// 行は新しいものが上にくる時系列。どの参照からも届かないコミットは
// 「孤児」として印を付け、描画側で灰色にする。

import type { Repo } from './repo';

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  lane: number;
  message: string;
  isHead: boolean;
  isOrphan: boolean;
  labels: { text: string; kind: 'branch' | 'tag' | 'head' }[];
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isOrphan: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  laneCount: number;
}

export const LANE_GAP = 56;
export const ROW_GAP = 52;
const MARGIN_X = 28;
const MARGIN_Y = 26;

export function layoutGraph(repo: Repo): GraphLayout {
  const commits = [...repo.commits.values()].sort((a, b) => b.seq - a.seq);
  const headId = repo.headCommitId();

  const reachable = new Set<string>();
  for (const tip of repo.branches.values()) {
    for (const id of repo.reachableFrom(tip)) reachable.add(id);
  }
  for (const tip of repo.tags.values()) {
    for (const id of repo.reachableFrom(tip)) reachable.add(id);
  }
  if (headId) {
    for (const id of repo.reachableFrom(headId)) reachable.add(id);
  }

  const position = new Map<string, { x: number; y: number }>();
  let maxLane = 0;
  commits.forEach((commit, row) => {
    maxLane = Math.max(maxLane, commit.lane);
    position.set(commit.id, {
      x: MARGIN_X + commit.lane * LANE_GAP,
      y: MARGIN_Y + row * ROW_GAP,
    });
  });

  const nodes: GraphNode[] = commits.map((commit) => {
    const { x, y } = position.get(commit.id) as { x: number; y: number };
    const labels: GraphNode['labels'] = [];
    if (headId === commit.id) {
      labels.push({ text: 'HEAD', kind: 'head' });
    }
    for (const [name, id] of repo.branches) {
      if (id === commit.id) labels.push({ text: name, kind: 'branch' });
    }
    for (const [name, id] of repo.tags) {
      if (id === commit.id) labels.push({ text: name, kind: 'tag' });
    }
    return {
      id: commit.id,
      x,
      y,
      lane: commit.lane,
      message: commit.message,
      isHead: headId === commit.id,
      isOrphan: !reachable.has(commit.id),
      labels,
    };
  });

  const edges: GraphEdge[] = [];
  for (const commit of commits) {
    const from = position.get(commit.id) as { x: number; y: number };
    for (const parentId of commit.parents) {
      const to = position.get(parentId);
      if (!to) continue;
      edges.push({
        fromId: commit.id,
        toId: parentId,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        isOrphan: !reachable.has(commit.id),
      });
    }
  }

  return {
    nodes,
    edges,
    width: MARGIN_X * 2 + (maxLane + 1) * LANE_GAP + 150,
    height: MARGIN_Y * 2 + Math.max(commits.length - 1, 0) * ROW_GAP + 20,
    laneCount: maxLane + 1,
  };
}
