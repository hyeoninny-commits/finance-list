/* 기간별 합계 계산 (화면과 분리된 순수 함수)
 * type: 'day' | 'week' | 'month', anchor: 기준 날짜 'YYYY-MM-DD' */
(function (L) {
  'use strict';

  var U = L.utils;
  var TREND_COUNT = { day: 7, week: 8, month: 6 };
  var PREV_WORD = { day: '전날', week: '지난주', month: '지난달' };

  function inRange(e, start, end) { return e.date >= start && e.date <= end; }

  function sum(expenses, start, end) {
    var total = 0;
    for (var i = 0; i < expenses.length; i++) {
      if (inRange(expenses[i], start, end)) total += expenses[i].amount;
    }
    return total;
  }

  /** { categoryId: 금액 } */
  function byCategory(expenses, start, end) {
    var map = {};
    expenses.forEach(function (e) {
      if (inRange(e, start, end)) map[e.categoryId] = (map[e.categoryId] || 0) + e.amount;
    });
    return map;
  }

  function range(type, anchor, weekStartsOn) {
    if (type === 'day') return { start: anchor, end: anchor };
    if (type === 'week') {
      var s = U.startOfWeek(anchor, weekStartsOn);
      return { start: s, end: U.addDays(s, 6) };
    }
    return { start: U.startOfMonth(anchor), end: U.endOfMonth(anchor) };
  }

  /** 기준 날짜를 n 기간만큼 이동 */
  function shift(type, anchor, n) {
    if (type === 'day') return U.addDays(anchor, n);
    if (type === 'week') return U.addDays(anchor, 7 * n);
    return U.addMonths(U.monthKey(anchor), n) + '-01';
  }

  function label(type, r) {
    if (type === 'day') return U.formatDateKo(r.start);
    if (type === 'week') return U.formatShort(r.start) + ' ~ ' + U.formatShort(r.end);
    return U.formatMonth(U.monthKey(r.start));
  }

  function shortLabel(type, r) {
    if (type === 'day') return U.formatShort(r.start);
    if (type === 'week') return U.formatShort(r.start) + '~';
    return (+r.start.slice(5, 7)) + '월';
  }

  /** 기간 요약: 총액, 직전 기간 대비, 카테고리별 금액·비율 */
  function summary(expenses, type, anchor, weekStartsOn) {
    var r = range(type, anchor, weekStartsOn);
    var prev = range(type, shift(type, anchor, -1), weekStartsOn);
    var total = 0, count = 0, map = {};
    expenses.forEach(function (e) {
      if (inRange(e, r.start, r.end)) {
        total += e.amount;
        count++;
        map[e.categoryId] = (map[e.categoryId] || 0) + e.amount;
      }
    });
    var prevTotal = sum(expenses, prev.start, prev.end);
    var categories = Object.keys(map).map(function (id) {
      return { categoryId: id, amount: map[id], pct: total ? map[id] / total * 100 : 0 };
    }).sort(function (a, b) { return b.amount - a.amount; });
    return {
      type: type,
      range: r,
      label: label(type, r),
      total: total,
      count: count,
      prevRange: prev,
      prevTotal: prevTotal,
      prevWord: PREV_WORD[type],
      diff: total - prevTotal,
      diffPct: prevTotal ? (total - prevTotal) / prevTotal * 100 : null,
      categories: categories
    };
  }

  /** 추이: 일=최근 7일, 주=최근 8주, 월=최근 6개월 (기준 기간이 마지막) */
  function trend(expenses, type, anchor, weekStartsOn) {
    var n = TREND_COUNT[type];
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var r = range(type, shift(type, anchor, -i), weekStartsOn);
      out.push({ start: r.start, end: r.end, label: shortLabel(type, r), total: sum(expenses, r.start, r.end), isCurrent: i === 0 });
    }
    return out;
  }

  L.stats = {
    sum: sum,
    byCategory: byCategory,
    range: range,
    shift: shift,
    label: label,
    summary: summary,
    trend: trend
  };
})(window.Ledger = window.Ledger || {});
