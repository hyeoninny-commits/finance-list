/* 내역: 날짜별 묶음, 날짜별 소계, 기간·카테고리·결제수단·키워드 필터, 클릭 시 수정/삭제 */
(function (L) {
  'use strict';

  var U = L.utils;
  var PAGE = 300;
  var filter = null;  // 화면을 다시 그려도 유지되는 필터 상태
  var limit = PAGE;
  var detailsOpen = null; // 상세 조건 펼침 상태 (사용자가 바꾸면 기억)

  /** 프리셋으로 표현되지 않는 조건 수 (카테고리·결제수단·직접 고른 기간) */
  function activeCount() {
    var p = presets();
    var isPreset = Object.keys(p).some(function (k) { return p[k].from === filter.from && p[k].to === filter.to; });
    return (filter.categoryId ? 1 : 0) + (filter.payment ? 1 : 0) + (isPreset ? 0 : 1);
  }

  /** 넓은 화면이거나 상세 조건이 걸려 있으면 펼친 상태로 시작 */
  function moreOpen() {
    if (detailsOpen !== null) return detailsOpen;
    return window.innerWidth >= 768 || activeCount() > 0;
  }

  function defaults() {
    var t = U.today();
    return { from: U.startOfMonth(t), to: U.endOfMonth(t), categoryId: '', payment: '', q: '' };
  }

  function presets() {
    var t = U.today(), mk = U.monthKey(t), prev = U.addMonths(mk, -1);
    return {
      thisMonth: { from: mk + '-01', to: U.endOfMonth(t) },
      lastMonth: { from: prev + '-01', to: U.endOfMonth(prev + '-01') },
      last3: { from: U.addMonths(mk, -2) + '-01', to: U.endOfMonth(t) },
      all: { from: '', to: '' }
    };
  }

  function applyFilter(expenses) {
    var q = filter.q.trim().toLowerCase();
    return expenses.filter(function (e) {
      if (filter.from && e.date < filter.from) return false;
      if (filter.to && e.date > filter.to) return false;
      if (filter.categoryId && e.categoryId !== filter.categoryId) return false;
      if (filter.payment && e.payment !== filter.payment) return false;
      if (q && (e.place + ' ' + (e.memo || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderResults(el) {
    var s = L.store.getState();
    var rows = L.ui.sortExpenses(applyFilter(s.expenses));
    var total = rows.reduce(function (a, e) { return a + e.amount; }, 0);
    var box = el.querySelector('#list-results');

    if (!s.expenses.length) {
      box.innerHTML = '<div class="card"><div class="empty"><p>아직 지출이 없어요. 첫 지출을 기록해 보세요.</p>' +
        '<button type="button" class="btn btn-primary btn-small" data-add-expense>지출 기록하기</button></div></div>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<div class="card"><div class="empty"><p>조건에 맞는 지출이 없어요.</p>' +
        '<button type="button" class="btn btn-small" data-reset-filter>조건 지우고 전체 보기</button></div></div>';
      box.querySelector('[data-reset-filter]').addEventListener('click', function () {
        filter = { from: '', to: '', categoryId: '', payment: '', q: '' }; limit = PAGE; L.ui.preserveFocus(el, function () { render(el); });
      });
      return;
    }

    var shown = rows.slice(0, limit);
    var groups = [];
    shown.forEach(function (e) {
      var g = groups[groups.length - 1];
      if (!g || g.date !== e.date) { g = { date: e.date, items: [] }; groups.push(g); }
      g.items.push(e);
    });
    // 날짜 소계는 잘린 목록이 아니라 전체 기준
    var dayTotals = {};
    rows.forEach(function (e) { dayTotals[e.date] = (dayTotals[e.date] || 0) + e.amount; });

    box.innerHTML =
      '<p class="list-summary"><span>' + rows.length.toLocaleString('ko-KR') + '건</span><strong>합계 ' + U.formatWon(total) + '</strong></p>' +
      groups.map(function (g) {
        return '<section class="day-group card">' +
          '<h3 class="day-head"><span>' + U.formatDateKo(g.date) + '</span><span class="day-total">' + U.formatWon(dayTotals[g.date]) + '</span></h3>' +
          '<ul class="expense-list">' + g.items.map(function (x) { return L.ui.expenseRow(x); }).join('') + '</ul>' +
        '</section>';
      }).join('') +
      (rows.length > limit ? '<button type="button" class="btn btn-block" id="list-more">더 보기 (' + (rows.length - limit).toLocaleString('ko-KR') + '건 남음)</button>' : '');

    var more = box.querySelector('#list-more');
    if (more) more.addEventListener('click', function () { limit += PAGE; L.ui.preserveFocus(el, function () { renderResults(el); }); });
  }

  function render(el) {
    filter = filter || defaults();
    var p = presets();
    function presetBtn(key, label) {
      var on = filter.from === p[key].from && filter.to === p[key].to;
      return '<button type="button" class="chip chip-small" data-preset="' + key + '" aria-pressed="' + on + '">' + label + '</button>';
    }
    el.innerHTML =
      '<h2 class="view-title">내역</h2>' +
      '<form class="card filters" id="list-filters" role="search" onsubmit="return false">' +
        '<label class="field"><span class="visually-hidden">검색</span><input type="search" name="q" placeholder="사용처나 메모로 검색" value="' + U.escapeHtml(filter.q) + '"></label>' +
        '<div class="chips">' + presetBtn('thisMonth', '이번 달') + presetBtn('lastMonth', '지난달') + presetBtn('last3', '최근 3개월') + presetBtn('all', '전체') + '</div>' +
        '<details class="filter-more"' + (moreOpen() ? ' open' : '') + '>' +
          '<summary>상세 조건' + (activeCount() ? ' <span class="badge badge-info">' + activeCount() + '개 적용</span>' : '') + '</summary>' +
          '<div class="filter-more-body">' +
            '<div class="field-row">' +
              '<label class="field"><span>시작일</span><input type="date" name="from" value="' + filter.from + '"></label>' +
              '<label class="field"><span>종료일</span><input type="date" name="to" value="' + filter.to + '"></label>' +
            '</div>' +
            '<div class="field-row">' +
              '<label class="field"><span>카테고리</span><select name="categoryId">' + L.ui.categoryOptions(filter.categoryId, true) + '</select></label>' +
              '<label class="field"><span>결제수단</span><select name="payment">' + L.ui.paymentOptions(filter.payment, '전체 결제수단') + '</select></label>' +
            '</div>' +
          '</div>' +
        '</details>' +
      '</form>' +
      '<div id="list-results"></div>' +
      L.ui.fabHtml();

    var form = el.querySelector('#list-filters');
    form.querySelector('details').addEventListener('toggle', function (e) { detailsOpen = e.target.open; });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'q') return;
      filter[e.target.name] = e.target.value;
      limit = PAGE;
      L.ui.preserveFocus(el, function () { render(el); });
    });
    var timer;
    form.q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { filter.q = form.q.value; limit = PAGE; renderResults(el); }, 150);
    });
    form.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = p[b.getAttribute('data-preset')];
        filter.from = r.from; filter.to = r.to; limit = PAGE;
        L.ui.preserveFocus(el, function () { render(el); });
      });
    });
    L.ui.bindExpenseClicks(el.querySelector('#list-results'));
    renderResults(el);
  }

  L.views = L.views || {};
  L.views.list = { title: '내역', render: render };
})(window.Ledger = window.Ledger || {});
