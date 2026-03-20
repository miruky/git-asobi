// コミットグラフのSVG描画。要素をコミットIDで使い回し、既存ノードの
// 位置替えはCSSトランジション、新規ノードは入場アニメーションに任せる。
// 色はCSSカスタムプロパティ(--lane-N)経由でテーマに追従する。

import { LANE_GAP, type GraphEdge, type GraphLayout, type GraphNode } from '../lib/graphlayout';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LANE_COLORS = 6;
const CHIP_HEIGHT = 16;
const CHIP_GAP = 5;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

// 等幅前提の概算。CJKは全角幅、それ以外は約0.62em として測る
function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    width += (ch.codePointAt(0) ?? 0) > 0xff ? fontSize : fontSize * 0.62;
  }
  return width;
}

function laneColor(lane: number): string {
  return `var(--lane-${lane % LANE_COLORS})`;
}

// 親子が別レーンならS字のベジェで結ぶ。子(新しい方)が常に上の行にいる
function edgePath(edge: GraphEdge): string {
  if (edge.x1 === edge.x2) return `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`;
  const bend = Math.min(28, (edge.y2 - edge.y1) / 2);
  return `M ${edge.x1} ${edge.y1} C ${edge.x1} ${edge.y1 + bend}, ${edge.x2} ${edge.y2 - bend}, ${edge.x2} ${edge.y2}`;
}

export class GraphView {
  private readonly svg: SVGSVGElement;
  private readonly edgeLayer: SVGGElement;
  private readonly nodeLayer: SVGGElement;
  private readonly nodeEls = new Map<string, SVGGElement>();
  private readonly edgeEls = new Map<string, SVGPathElement>();

  constructor(host: HTMLElement) {
    this.svg = svgEl('svg', { role: 'img', 'aria-label': 'コミットグラフ' });
    this.edgeLayer = svgEl('g', { class: 'edges' });
    this.nodeLayer = svgEl('g', { class: 'nodes' });
    this.svg.append(this.edgeLayer, this.nodeLayer);
    host.append(this.svg);
  }

  render(layout: GraphLayout): void {
    const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
    const messageX =
      layout.nodes.length > 0
        ? Math.max(...layout.nodes.map((node) => node.x)) + LANE_GAP * 0.75
        : 0;

    const aliveEdges = new Set<string>();
    for (const edge of layout.edges) {
      const key = `${edge.fromId}->${edge.toId}`;
      aliveEdges.add(key);
      let el = this.edgeEls.get(key);
      if (!el) {
        el = svgEl('path', { class: 'edge enter', fill: 'none' });
        this.edgeLayer.append(el);
        this.edgeEls.set(key, el);
      }
      el.setAttribute('d', edgePath(edge));
      const lane = nodeById.get(edge.fromId)?.lane ?? 0;
      el.setAttribute('stroke', edge.isOrphan ? 'var(--graph-muted)' : laneColor(lane));
      el.classList.toggle('orphan', edge.isOrphan);
    }
    for (const [key, el] of this.edgeEls) {
      if (!aliveEdges.has(key)) {
        el.remove();
        this.edgeEls.delete(key);
      }
    }

    let maxRowEnd = layout.width;
    const aliveNodes = new Set<string>();
    for (const node of layout.nodes) {
      aliveNodes.add(node.id);
      let el = this.nodeEls.get(node.id);
      if (!el) {
        el = svgEl('g', { class: 'node enter' });
        el.append(svgEl('title'), svgEl('circle', { class: 'dot', r: '7' }));
        this.nodeLayer.append(el);
        this.nodeEls.set(node.id, el);
      }
      el.setAttribute('transform', `translate(${node.x}, ${node.y})`);
      el.classList.toggle('orphan', node.isOrphan);
      const title = el.querySelector('title');
      if (title) title.textContent = `${node.id} ${node.message}`;
      const dot = el.querySelector('.dot');
      dot?.setAttribute('fill', node.isOrphan ? 'var(--graph-muted)' : laneColor(node.lane));

      // リングを残したまま更新すると、HEADが動いたときだけ入場アニメーションが走る
      const ring = el.querySelector('.head-ring');
      if (node.isHead && !ring) {
        el.append(svgEl('circle', { class: 'head-ring', r: '11.5', fill: 'none' }));
      } else if (!node.isHead && ring) {
        ring.remove();
      }

      el.querySelector('.meta')?.remove();
      const { meta, width } = this.buildMeta(node, messageX - node.x);
      el.append(meta);
      maxRowEnd = Math.max(maxRowEnd, messageX + width + 24);
    }
    for (const [id, el] of this.nodeEls) {
      if (!aliveNodes.has(id)) {
        el.remove();
        this.nodeEls.delete(id);
      }
    }

    const width = Math.ceil(maxRowEnd);
    this.svg.setAttribute('viewBox', `0 0 ${width} ${layout.height}`);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(layout.height));
  }

  // ノード右側のメタ列: 参照チップ(HEAD・ブランチ・タグ)とコミットメッセージ
  private buildMeta(node: GraphNode, offsetX: number): { meta: SVGGElement; width: number } {
    const meta = svgEl('g', { class: 'meta' });
    let x = offsetX;
    for (const label of node.labels) {
      const chipWidth = Math.ceil(textWidth(label.text, 10.5)) + 12;
      const chip = svgEl('g', { class: `chip chip-${label.kind}` });
      chip.append(
        svgEl('rect', {
          x: String(x),
          y: String(-CHIP_HEIGHT / 2),
          width: String(chipWidth),
          height: String(CHIP_HEIGHT),
          rx: String(CHIP_HEIGHT / 2),
        }),
      );
      const text = svgEl('text', {
        x: String(x + chipWidth / 2),
        y: '3.5',
        'text-anchor': 'middle',
      });
      text.textContent = label.text;
      chip.append(text);
      meta.append(chip);
      x += chipWidth + CHIP_GAP;
    }
    const message = svgEl('text', { class: 'msg', x: String(x + 3), y: '4.5' });
    message.textContent = node.message;
    meta.append(message);
    return { meta, width: x + 3 + textWidth(node.message, 13) - offsetX };
  }
}
