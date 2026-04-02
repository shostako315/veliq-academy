/**
 * timeline.js — 時代年表（D3.js）
 * URL: #/timeline
 */
const TimelineModule = (() => {

  const ERA_BANDS = [
    { id: 'ancient', name: '古代・中世', start: 0, end: 1400, color: '#8B7355' },
    { id: 'renaissance', name: 'ルネサンス', start: 1400, end: 1600, color: '#7A9B6B' },
    { id: 'baroque', name: 'バロック', start: 1600, end: 1750, color: '#9B7A6B' },
    { id: 'classical', name: '古典派', start: 1750, end: 1820, color: '#6B8B9B' },
    { id: 'romantic', name: 'ロマン派', start: 1820, end: 1900, color: '#9B6B7A' },
    { id: 'modern', name: '近代', start: 1900, end: 1945, color: '#7A6B9B' },
    { id: 'contemporary', name: '現代', start: 1945, end: 2025, color: '#6B9B8B' },
  ];

  const TYPE_STYLES = {
    music: { symbol: '◆', color: '#C9A84C' },
    birth: { symbol: '◎', color: '#4A8B5C' },
    death: { symbol: '×', color: '#6B6050' },
    history: { symbol: '◇', color: '#4A6B8B' },
  };

  function render() {
    VeliqUI.setTitle('時代年表');
    const stopTimer = VeliqUI.startStudyTimer();

    const html = `
      <div class="timeline-page anim-fade-in">
        <section class="hero">
          <h1 class="hero-title">時代年表</h1>
          <p class="hero-subtitle">音楽史と世界史の交差点を辿る</p>
        </section>

        <div class="tab-filter" id="timeline-filter">
          <button class="tab-filter-btn active" data-type="all">すべて</button>
          <button class="tab-filter-btn" data-type="music">音楽 ◆</button>
          <button class="tab-filter-btn" data-type="birth">誕生 ◎</button>
          <button class="tab-filter-btn" data-type="death">死 ×</button>
          <button class="tab-filter-btn" data-type="history">歴史 ◇</button>
        </div>

        <div style="margin-bottom:var(--space-4); font-size:var(--font-size-xs); color:var(--color-text-muted);">
          ドラッグで移動 / スクロールでズーム
        </div>

        <div id="timeline-container" style="width:100%; overflow:hidden; border:1px solid var(--color-border-primary); border-radius:var(--radius-lg); background:var(--color-bg-secondary);"></div>

        <div id="timeline-tooltip" style="position:fixed; display:none; background:var(--color-bg-elevated); border:1px solid var(--color-border-gold); border-radius:var(--radius-md); padding:var(--space-3) var(--space-4); max-width:320px; box-shadow:var(--shadow-lg); z-index:200; pointer-events:none;">
        </div>
      </div>
    `;

    VeliqUI.render(html);
    buildTimeline();

    let activeFilter = 'all';
    document.getElementById('timeline-filter')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-filter-btn');
      if (!btn) return;
      activeFilter = btn.dataset.type;
      document.querySelectorAll('#timeline-filter .tab-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterEvents(activeFilter);
    });

    return stopTimer;
  }

  function buildTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container || typeof d3 === 'undefined') return;

    const events = window.VA_DATA?.timelineEvents || [];
    const containerWidth = container.clientWidth || 900;
    const margin = { top: 60, right: 40, bottom: 50, left: 40 };
    const width = containerWidth - margin.left - margin.right;
    const height = 420;

    container.innerHTML = '';

    const svg = d3.select(container)
      .append('svg')
      .attr('width', containerWidth)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain([1400, 2025])
      .range([0, width]);

    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d3.format('d'))
      .ticks(12);

    const axisGroup = g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);

    axisGroup.selectAll('text')
      .attr('fill', '#A89B7A')
      .attr('font-size', '11px');
    axisGroup.selectAll('line').attr('stroke', '#2E2820');
    axisGroup.select('.domain').attr('stroke', '#2E2820');

    const eraBandsG = g.append('g').attr('class', 'era-bands');
    ERA_BANDS.forEach(era => {
      const x0 = Math.max(xScale(era.start), 0);
      const x1 = Math.min(xScale(era.end), width);
      if (x1 <= x0) return;

      eraBandsG.append('rect')
        .attr('x', x0)
        .attr('y', 0)
        .attr('width', x1 - x0)
        .attr('height', height)
        .attr('fill', era.color)
        .attr('opacity', 0.08)
        .style('cursor', 'pointer')
        .on('click', () => { window.location.hash = `#/eras/${era.id}`; });

      eraBandsG.append('text')
        .attr('x', (x0 + x1) / 2)
        .attr('y', 16)
        .attr('text-anchor', 'middle')
        .attr('fill', era.color)
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('opacity', 0.8)
        .text(era.name);
    });

    const tooltip = document.getElementById('timeline-tooltip');
    const eventDots = g.append('g').attr('class', 'event-dots');

    const validEvents = events.filter(e => e.year >= 1400 && e.year <= 2025);

    validEvents.forEach((evt, i) => {
      const style = TYPE_STYLES[evt.type] || TYPE_STYLES.music;
      const yPos = 40 + (i % 8) * 42 + Math.random() * 10;

      const dot = eventDots.append('g')
        .attr('class', `event-dot event-type-${evt.type || 'music'}`)
        .attr('transform', `translate(${xScale(evt.year)},${yPos})`)
        .style('cursor', 'pointer');

      dot.append('circle')
        .attr('r', 5)
        .attr('fill', style.color)
        .attr('opacity', 0.8)
        .attr('stroke', style.color)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.4);

      dot.on('mouseenter', function(event) {
        d3.select(this).select('circle')
          .transition().duration(150)
          .attr('r', 8)
          .attr('opacity', 1);

        tooltip.innerHTML = `
          <div style="font-size:12px; color:${style.color}; margin-bottom:4px;">${style.symbol} ${VeliqUI.escape(String(evt.year))}年</div>
          <div style="font-size:14px; color:#F0EAD6; font-weight:500; margin-bottom:4px;">${VeliqUI.escape(evt.title)}</div>
          <div style="font-size:12px; color:#A89B7A;">${VeliqUI.escape(evt.description || '')}</div>
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
      });

      dot.on('mousemove', function(event) {
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
      });

      dot.on('mouseleave', function() {
        d3.select(this).select('circle')
          .transition().duration(150)
          .attr('r', 5)
          .attr('opacity', 0.8);
        tooltip.style.display = 'none';
      });

      dot.on('click', function() {
        if (evt.relatedIds && evt.relatedIds.length > 0) {
          const rel = evt.relatedIds[0];
          if (rel.type === 'composer') window.location.hash = `#/composers/${rel.id}`;
          else if (rel.type === 'work') window.location.hash = `#/works/${rel.id}`;
        }
      });
    });

    const zoom = d3.zoom()
      .scaleExtent([1, 20])
      .translateExtent([[0, 0], [width, height]])
      .extent([[0, 0], [width, height]])
      .on('zoom', function(event) {
        const newX = event.transform.rescaleX(xScale);
        axisGroup.call(xAxis.scale(newX));
        axisGroup.selectAll('text').attr('fill', '#A89B7A').attr('font-size', '11px');
        axisGroup.selectAll('line').attr('stroke', '#2E2820');
        axisGroup.select('.domain').attr('stroke', '#2E2820');

        ERA_BANDS.forEach((era, idx) => {
          const x0 = Math.max(newX(era.start), 0);
          const x1 = Math.min(newX(era.end), width);
          const rects = eraBandsG.selectAll('rect');
          const texts = eraBandsG.selectAll('text');
          if (rects.nodes()[idx]) {
            d3.select(rects.nodes()[idx]).attr('x', x0).attr('width', Math.max(x1 - x0, 0));
          }
          if (texts.nodes()[idx]) {
            d3.select(texts.nodes()[idx]).attr('x', (x0 + x1) / 2);
          }
        });

        eventDots.selectAll('.event-dot').each(function(d, idx) {
          if (idx < validEvents.length) {
            const evt = validEvents[idx];
            const yPos = 40 + (idx % 8) * 42;
            d3.select(this).attr('transform', `translate(${newX(evt.year)},${yPos})`);
          }
        });
      });

    svg.call(zoom);
  }

  function filterEvents(type) {
    const svg = d3.select('#timeline-container svg');
    if (svg.empty()) return;

    svg.selectAll('.event-dot').each(function() {
      const el = d3.select(this);
      const classes = el.attr('class') || '';
      if (type === 'all') {
        el.style('display', null).style('opacity', 0.8);
      } else if (classes.includes(`event-type-${type}`)) {
        el.style('display', null).style('opacity', 1);
      } else {
        el.style('opacity', 0.1);
      }
    });
  }

  return { render };
})();

window.TimelineModule = TimelineModule;
