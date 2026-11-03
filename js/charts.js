/* SVG 차트 (외부 라이브러리 없이, 인터넷 없이 동작)
 * 각 조각/막대에 data-tip을 달아 두면 ui.bindChartTips가 말풍선을 띄운다. */
(function (L) {
  'use strict';

  var U = L.utils;

  /**
   * 도넛 차트
   * @param segments [{value, color, label}]
   */
  function donut(segments, centerTop, centerBottom) {
    var r = 80, stroke = 26, c = 2 * Math.PI * r;
    var total = segments.reduce(function (a, s) { return a + s.value; }, 0);
    var offset = 0;
    var gap = segments.length > 1 ? 2 : 0; // 조각 사이 틈
    var arcs = total ? segments.map(function (s) {
      var len = s.value / total * c;
      var pct = (s.value / total * 100).toFixed(1);
      var tip = s.label + ' ' + U.formatWon(s.value) + ' (' + pct + '%)';
      var visible = Math.max(0.5, len - gap);
      var arc = '<circle class="donut-seg" cx="100" cy="100" r="' + r + '" fill="none" stroke="' + U.escapeHtml(s.color) + '" ' +
        'stroke-width="' + stroke + '" stroke-dasharray="' + visible.toFixed(2) + ' ' + (c - visible).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 100 100)" ' +
        'tabindex="0" role="img" aria-label="' + U.escapeHtml(tip) + '" ' +
        'data-tip="' + U.escapeHtml(tip) + '" data-label="' + U.escapeHtml(s.label) + '" data-value="' + s.value + '"></circle>';
      offset += len;
      return arc;
    }).join('') : '';
    return '<svg class="donut" viewBox="0 0 200 200" role="group" aria-label="카테고리별 지출 비율">' +
      '<circle cx="100" cy="100" r="' + r + '" fill="none" class="donut-track" stroke-width="' + stroke + '"/>' +
      arcs +
      '<text x="100" y="94" text-anchor="middle" class="donut-label" data-center-top>' + U.escapeHtml(centerTop) + '</text>' +
      '<text x="100" y="118" text-anchor="middle" class="donut-value" data-center-bottom>' + U.escapeHtml(centerBottom) + '</text>' +
      '</svg>';
  }

  function compactWon(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
    if (n >= 10000) return Math.round(n / 1000) / 10 + '만';
    return n.toLocaleString('ko-KR');
  }

  /**
   * 막대 그래프
   * @param items [{label, value, isCurrent, title}]
   */
  function bars(items) {
    var w = 320, h = 180, top = 20, bottom = 28, gap = 10;
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var bw = (w - gap * (items.length + 1)) / items.length;
    var body = items.map(function (it, i) {
      var x = gap + i * (bw + gap);
      var bh = it.value ? Math.max(3, (h - top - bottom) * it.value / max) : 0;
      var y = h - bottom - bh;
      var tip = (it.title || it.label) + ' ' + U.formatWon(it.value);
      return '<g class="bar' + (it.isCurrent ? ' is-current' : '') + '" tabindex="0" role="img" aria-label="' + U.escapeHtml(tip) + '" data-tip="' + U.escapeHtml(tip) + '">' +
        // 막대가 낮아도 누르기 쉽게 투명한 넓은 영역
        '<rect x="' + x.toFixed(1) + '" y="' + top + '" width="' + bw.toFixed(1) + '" height="' + (h - top - bottom) + '" fill="transparent" style="fill:transparent"/>' +
        '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="5"/>' +
        (it.value ? '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle" class="bar-value">' + compactWon(it.value) + '</text>' : '') +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (h - 9) + '" text-anchor="middle" class="bar-label">' + U.escapeHtml(it.label) + '</text>' +
        '</g>';
    }).join('');
    return '<svg class="bars" viewBox="0 0 ' + w + ' ' + h + '" role="group" aria-label="기간별 지출 추이">' +
      '<line x1="0" x2="' + w + '" y1="' + (h - bottom) + '" y2="' + (h - bottom) + '" class="bar-axis"/>' + body + '</svg>';
  }

  L.charts = { donut: donut, bars: bars };
})(window.Ledger = window.Ledger || {});
