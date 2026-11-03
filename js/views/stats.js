/* 통계: 일/주/월 탭, 기간 이동, 직전 기간 대비, 카테고리 도넛, 추이 막대 */
(function (L) {
  'use strict';

  var U = L.utils;
  var view = { type: 'month', anchor: null };
  var TYPES = [['day', '일'], ['week', '주'], ['month', '월']];

  function compareText(sm) {
    if (!sm.total && !sm.prevTotal) return '이 기간에도, ' + sm.prevWord + '에도 지출이 없어요.';
    if (!sm.prevTotal) return sm.prevWord + '에는 지출이 없었어요.';
    if (sm.diff === 0) return sm.prevWord + ' 대비 변동 없음';
    var more = sm.diff > 0;
    return '<span class="' + (more ? 'up' : 'down') + '">' + sm.prevWord + '보다 ' + U.formatWon(Math.abs(sm.diff)) +
      (more ? ' 더 씀 ▲' : ' 덜 씀 ▼') + Math.abs(Math.round(sm.diffPct)) + '%</span>';
  }

  function render(el) {
    var s = L.store.getState();
    var today = U.today();
    var anchor = view.anchor || today;
    var ws = s.settings.weekStartsOn;
    var sm = L.stats.summary(s.expenses, view.type, anchor, ws);
    var tr = L.stats.trend(s.expenses, view.type, anchor, ws);
    var isCurrent = today >= sm.range.start && today <= sm.range.end;

    var segments = sm.categories.map(function (c) {
      var cat = L.store.getCategory(c.categoryId);
      return { value: c.amount, color: cat.color, label: cat.name };
    });

    var catList = sm.categories.length
      ? '<ul class="cat-list">' + sm.categories.map(function (c) {
          var cat = L.store.getCategory(c.categoryId);
          return '<li class="cat-row">' +
            '<span class="cat-name"><span aria-hidden="true">' + U.escapeHtml(cat.emoji) + '</span> ' + U.escapeHtml(cat.name) + '</span>' +
            '<span class="cat-bar" aria-hidden="true"><span style="width:' + c.pct.toFixed(1) + '%;background:' + U.escapeHtml(cat.color) + '"></span></span>' +
            '<span class="cat-pct">' + c.pct.toFixed(1) + '%</span>' +
            '<span class="cat-amount">' + U.formatWon(c.amount) + '</span>' +
          '</li>';
        }).join('') + '</ul>'
      : '<p class="empty">이 기간에는 지출이 없어요.</p>';

    var bars = tr.map(function (t) {
      var title = view.type === 'week' ? U.formatShort(t.start) + '~' + U.formatShort(t.end)
        : view.type === 'month' ? U.formatMonth(t.start.slice(0, 7)) : U.formatDateKo(t.start);
      return { label: t.label, value: t.total, isCurrent: t.isCurrent, title: title };
    });

    el.innerHTML =
      '<h2 class="view-title">통계</h2>' +
      '<div class="stats-controls">' +
        '<div class="segmented" role="tablist" aria-label="기간 단위">' + TYPES.map(function (t) {
          return '<button type="button" role="tab" aria-selected="' + (view.type === t[0]) + '" data-type="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="period-nav">' +
          '<button type="button" class="icon-btn" data-shift="-1" aria-label="이전 기간">‹</button>' +
          '<strong class="period-label" aria-live="polite">' + U.escapeHtml(sm.label) + '</strong>' +
          '<button type="button" class="icon-btn" data-shift="1" aria-label="다음 기간">›</button>' +
          (isCurrent ? '' : '<button type="button" class="btn btn-small" data-today>오늘로</button>') +
        '</div>' +
      '</div>' +
      '<section class="card">' +
        '<p class="hero-label">' + sm.count + '건 지출</p>' +
        '<p class="hero-value" id="stats-total">' + U.formatWon(sm.total) + '</p>' +
        '<p class="compare">' + compareText(sm) + '</p>' +
      '</section>' +
      '<div class="split">' +
        '<section class="card" id="cat-card"><h3 class="card-title">카테고리별</h3>' +
          '<div class="donut-wrap">' + L.charts.donut(segments, '합계', U.formatWon(sm.total)) + '</div>' +
          catList +
        '</section>' +
        '<section class="card" id="trend-card"><h3 class="card-title">추이 <small class="muted">' +
          ({ day: '최근 7일', week: '최근 8주', month: '최근 6개월' })[view.type] + '</small></h3>' +
          L.charts.bars(bars) +
        '</section>' +
      '</div>';

    // 도넛 조각을 가리키면 가운데 글자가 그 카테고리로 바뀐다
    var top = el.querySelector('[data-center-top]'), bottom = el.querySelector('[data-center-bottom]');
    L.ui.bindChartTips(el.querySelector('#cat-card'), function (seg) {
      top.textContent = seg ? seg.getAttribute('data-label') : '합계';
      bottom.textContent = U.formatWon(seg ? +seg.getAttribute('data-value') : sm.total);
    });
    L.ui.bindChartTips(el.querySelector('#trend-card'));

    el.querySelectorAll('[data-type]').forEach(function (b) {
      b.addEventListener('click', function () { view.type = b.getAttribute('data-type'); L.ui.preserveFocus(el, function () { render(el); }); });
    });
    el.querySelectorAll('[data-shift]').forEach(function (b) {
      b.addEventListener('click', function () {
        view.anchor = L.stats.shift(view.type, anchor, +b.getAttribute('data-shift'));
        L.ui.preserveFocus(el, function () { render(el); });
      });
    });
    var t = el.querySelector('[data-today]');
    if (t) t.addEventListener('click', function () { view.anchor = null; L.ui.preserveFocus(el, function () { render(el); }); });
  }

  L.views = L.views || {};
  L.views.stats = { title: '통계', render: render };
})(window.Ledger = window.Ledger || {});
