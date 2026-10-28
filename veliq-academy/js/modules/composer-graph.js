/**
 * composer-graph.js — 影響関係グラフ（D3.js force）
 * URL: #/graph
 */
const ComposerGraphModule = (() => {

  function render() {
    VeliqUI.setTitle('作曲家の影響関係');
    const stopTimer = VeliqUI.startStudyTimer();

    const html = `
      <div class="graph-page anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">作曲家の影響関係</h1>
          <p class="hero-subtitle">作曲家間の師弟関係・影響の網を可視化</p>
        </section>
        <div style="font-size:var(--font-size-xs); color:var(--color-text-muted); margin-bottom:var(--space-4);">
          ドラッグで移動 / スクロールでズーム / クリックで作曲家詳細へ
        </div>
        <div id="graph-container" style="width:100%; height:600px; border:1px solid var(--color-border-primary); border-radius:var(--radius-lg); background:var(--color-bg-secondary); overflow:hidden;"></div>
      </div>
    `;

    VeliqUI.render(html);
    buildGraph();
    return stopTimer;
  }

  function buildGraph() {
    const container = document.getElementById('graph-container');
    if (!container || typeof d3 === 'undefined') return;

    const composers = window.VA_DATA?.composers || [];
    if (composers.length === 0) return;

    const composerMap = new Map(composers.map(c => [c.id, c]));
    const nodes = composers.map(c => ({
      id: c.id, name: c.name, era: c.era,
      connections: (c.influencedBy?.length || 0) + (c.influenced?.length || 0)
    }));

    const links = [];
    composers.forEach(c => {
      (c.influenced || []).forEach(targetId => {
        if (composerMap.has(targetId)) {
          links.push({ source: c.id, target: targetId });
        }
      });
    });

    const width = container.clientWidth || 900;
    const height = 600;
    container.innerHTML = '';

    const svg = d3.select(container).append('svg')
      .attr('width', width).attr('height', height);

    const g = svg.append('g');

    svg.append('defs').append('marker')
      .attr('id', 'arrowhead').attr('viewBox', '0 -5 10 10')
      .attr('refX', 20).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#4A3C20');

    const eraColors = {
      baroque: '#9B7A6B', classical: '#6B8B9B', romantic: '#9B6B7A',
      modern: '#7A6B9B', contemporary: '#6B9B8B', renaissance: '#7A9B6B', ancient: '#8B7355'
    };

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(25));

    const link = g.append('g').selectAll('line')
      .data(links).join('line')
      .attr('stroke', '#2E2820').attr('stroke-width', 1)
      .attr('marker-end', 'url(#arrowhead)');

    const node = g.append('g').selectAll('g')
      .data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    node.append('circle')
      .attr('r', d => 6 + Math.min(d.connections * 2, 12))
      .attr('fill', d => eraColors[d.era] || '#C9A84C')
      .attr('stroke', d => eraColors[d.era] || '#C9A84C')
      .attr('stroke-width', 2).attr('stroke-opacity', 0.3);

    node.append('text')
      .text(d => d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name)
      .attr('dy', -12).attr('text-anchor', 'middle')
      .attr('fill', '#A89B7A').attr('font-size', '10px');

    node.on('click', (event, d) => { window.location.hash = `#/composers/${d.id}`; });

    simulation.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    const zoom = d3.zoom().scaleExtent([0.3, 5]).on('zoom', event => g.attr('transform', event.transform));
    svg.call(zoom);
  }

  return { render };
})();

window.ComposerGraphModule = ComposerGraphModule;
