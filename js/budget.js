/* 예산 상태·경고 계산 (화면과 분리된 순수 함수)
 * 단계: 'ok'(정상) → 'warn'(기준 % 이상, 주의) → 'over'(100% 이상, 초과) */
(function (L) {
  'use strict';

  var U = L.utils;
  var RANK = { ok: 0, warn: 1, over: 2 };

  function level(spent, limit, warnPercent) {
    if (!limit) return null;
    var pct = spent / limit * 100;
    if (pct >= 100) return 'over';
    if (pct >= warnPercent) return 'warn';
    return 'ok';
  }

  function getBudget(state, mk) {
    var b = state.budgets[mk];
    return { total: (b && b.total) || null, byCategory: (b && b.byCategory) || {} };
  }

  function item(spent, limit, warnPercent) {
    return {
      spent: spent,
      limit: limit || null,
      remaining: limit ? limit - spent : null,
      pct: limit ? spent / limit * 100 : null,
      level: level(spent, limit, warnPercent)
    };
  }

  /**
   * 월 예산 현황
   * @param mk 'YYYY-MM'
   * @param today 하루 권장 지출 계산 기준일
   */
  function monthStatus(state, mk, today) {
    var start = mk + '-01', end = U.endOfMonth(start);
    var warnPercent = state.settings.warnPercent;
    var budget = getBudget(state, mk);
    var spentByCat = L.stats.byCategory(state.expenses, start, end);
    var spent = L.stats.sum(state.expenses, start, end);

    var categories = state.categories.map(function (c) {
      return Object.assign({ categoryId: c.id }, item(spentByCat[c.id] || 0, budget.byCategory[c.id], warnPercent));
    });
    var total = item(spent, budget.total, warnPercent);

    var daily = null;
    if (today && U.monthKey(today) === mk && budget.total) {
      var daysLeft = U.diffDays(today, end) + 1; // 오늘 포함
      daily = {
        daysLeft: daysLeft,
        amount: Math.max(0, Math.floor(total.remaining / daysLeft)),
        over: total.remaining < 0
      };
    }
    return { month: mk, start: start, end: end, total: total, categories: categories, daily: daily, hasBudget: !!budget.total || Object.keys(budget.byCategory).length > 0 };
  }

  /** 저장 전후 비교용 단계 스냅샷 */
  function levelsSnapshot(state, mk) {
    var st = monthStatus(state, mk, null);
    var cats = {};
    st.categories.forEach(function (c) { if (c.level) cats[c.categoryId] = c; });
    return { month: mk, total: st.total, categories: cats };
  }

  function categoryName(state, id) {
    var c = L.store.getCategory(id);
    return c ? c.name : '';
  }

  function message(name, it, monthWord) {
    var prefix = monthWord ? monthWord + ' ' : '';
    if (it.level === 'over') {
      return it.spent === it.limit
        ? '🚨 ' + prefix + name + ' 예산을 모두 사용했어요.'
        : '🚨 ' + prefix + name + ' 예산을 ' + U.formatWon(it.spent - it.limit) + ' 초과했어요.';
    }
    return '⚠️ ' + prefix + name + ' 예산의 ' + Math.floor(it.pct) + '%를 사용했어요. 남은 금액 ' + U.formatWon(it.remaining);
  }

  /** 홈 배너용: 이번 달 주의/초과 항목 (초과 먼저) */
  function warnings(state, today) {
    var st = monthStatus(state, U.monthKey(today), today);
    var list = [];
    if (st.total.level === 'warn' || st.total.level === 'over') {
      list.push({ level: st.total.level, text: message('전체', st.total, '이번 달') });
    }
    st.categories.forEach(function (c) {
      if (c.level === 'warn' || c.level === 'over') {
        list.push({ level: c.level, text: message(categoryName(state, c.categoryId), c, '이번 달') });
      }
    });
    return list.sort(function (a, b) { return RANK[b.level] - RANK[a.level]; });
  }

  /** 저장 직후 단계가 올라간 항목의 토스트 문구 */
  function levelUpMessages(state, before, after) {
    var msgs = [];
    function check(name, b, a) {
      if (!a || !a.level) return;
      var prev = b && b.level ? RANK[b.level] : 0;
      if (RANK[a.level] > prev) {
        msgs.push({
          level: a.level,
          text: a.level === 'over'
            ? '🚨 ' + name + ' 예산을 ' + (a.spent === a.limit ? '모두 썼어요' : U.formatWon(a.spent - a.limit) + ' 초과했어요')
            : '⚠️ ' + name + ' 예산의 ' + Math.floor(a.pct) + '%를 썼어요'
        });
      }
    }
    check('전체', before.total, after.total);
    Object.keys(after.categories).forEach(function (id) {
      check(categoryName(state, id), before.categories[id], after.categories[id]);
    });
    return msgs;
  }

  /* ---------- 예산 추천 (F-4.5) ---------- */

  var HISTORY_MONTHS = 3;
  var WEIGHTS = [0.5, 0.3, 0.2]; // 지난달 → 두 달 전 → 세 달 전 (최근 추이에 더 무게)
  var UNIT = 1000;               // 추천 금액은 1,000원 단위

  function ceilUnit(n) { return Math.ceil(n / UNIT) * UNIT; }
  function floorUnit(n) { return Math.floor(n / UNIT) * UNIT; }

  /** mk 이전의 완료된 달 중 지출이 있는 달 (최근 순, 최대 3개) */
  function historyMonths(state, mk) {
    var out = [];
    for (var i = 1; i <= HISTORY_MONTHS; i++) {
      var m = U.addMonths(mk, -i);
      var start = m + '-01', end = U.endOfMonth(start);
      var byCat = L.stats.byCategory(state.expenses, start, end);
      var total = L.stats.sum(state.expenses, start, end);
      if (total > 0) out.push({ month: m, byCategory: byCat, total: total, weight: WEIGHTS[i - 1] });
    }
    return out;
  }

  /** 그 달에 나갈 정기 납부(시작일 이후 회차) 카테고리별 합 */
  function fixedByCategory(state, mk) {
    var start = mk + '-01', end = U.endOfMonth(start);
    var map = {};
    state.recurring.forEach(function (it) {
      var from = it.startDate && it.startDate > start ? it.startDate : start;
      var n = L.recurring.occurrences(it, from, end).length;
      if (n) map[it.categoryId] = (map[it.categoryId] || 0) + n * it.amount;
    });
    return map;
  }

  /**
   * 지난 지출 추이로 예산 추천
   * - 카테고리별로 최근 3개월을 가중 평균(지난달 50% · 두 달 전 30% · 세 달 전 20%, 지출 있는 달만)
   * - 그 달 정기 납부(고정 지출)보다 적게 잡지 않는다
   * - target(목표 총액)을 주면 고정 지출은 그대로 두고 나머지를 비율대로 줄이거나 늘린다
   * @returns {{months, categories:[{categoryId, last, avg, fixed, amount, trend}], total, fixedTotal, target, warning}}
   */
  function recommend(state, mk, target) {
    var months = historyMonths(state, mk);
    var fixed = fixedByCategory(state, mk);
    var wsum = months.reduce(function (a, m) { return a + m.weight; }, 0);
    var lastMonth = U.addMonths(mk, -1);
    var cats = state.categories.map(function (c) {
      var avg = 0;
      months.forEach(function (m) { avg += (m.byCategory[c.id] || 0) * m.weight; });
      avg = wsum ? avg / wsum : 0;
      var last = 0;
      months.forEach(function (m) { if (m.month === lastMonth) last = m.byCategory[c.id] || 0; });
      // 추이: 지난달이 그 이전 달들의 평균보다 10% 넘게 많거나 적으면 표시
      var older = months.filter(function (m) { return m.month !== lastMonth; });
      var olderAvg = older.length ? older.reduce(function (a, m) { return a + (m.byCategory[c.id] || 0); }, 0) / older.length : null;
      var trend = olderAvg == null || (!olderAvg && !last) ? null
        : last > olderAvg * 1.1 ? 'up' : last < olderAvg * 0.9 ? 'down' : 'flat';
      var f = fixed[c.id] || 0;
      return { categoryId: c.id, last: last, avg: Math.round(avg), fixed: f, amount: ceilUnit(Math.max(avg, f)), trend: trend };
    }).filter(function (c) { return c.amount > 0; });

    var fixedTotal = cats.reduce(function (a, c) { return a + c.fixed; }, 0);
    var warning = null;
    if (target) {
      var flexible = target - ceilUnit(fixedTotal);
      var varSum = cats.reduce(function (a, c) { return a + (c.amount - c.fixed); }, 0);
      if (flexible < 0) {
        warning = '목표 금액이 이번 달 고정 지출(' + U.formatWon(fixedTotal) + ')보다 적어요. 고정 지출만 넣었어요.';
        cats.forEach(function (c) { c.amount = ceilUnit(c.fixed); });
      } else if (varSum > 0) {
        var ratio = flexible / varSum;
        cats.forEach(function (c) { c.amount = ceilUnit(c.fixed) + floorUnit((c.amount - c.fixed) * ratio); });
      }
      cats = cats.filter(function (c) { return c.amount > 0; });
    }
    var total = cats.reduce(function (a, c) { return a + c.amount; }, 0);
    return {
      months: months.map(function (m) { return m.month; }),
      categories: cats,
      total: target && !warning ? Math.max(target, total) : total,
      fixedTotal: fixedTotal,
      target: target || null,
      warning: warning
    };
  }

  /**
   * 비율로 나누기 (예: 음식 50%, 뷰티 20%, 나머지 30%)
   * @param percents { categoryId: 퍼센트 }
   * @param restMode 'keep' 나머지는 카테고리 없이 전체 예산에만 / 'history' 나머지를 지난 지출 비율대로 다른 카테고리에 나눔
   * @returns {{ok, error?, categories:[{categoryId, pct, amount, rest}], total, assigned, rest, restPct}}
   */
  function ratioPlan(state, mk, total, percents, restMode) {
    var pctSum = 0;
    var cats = [];
    Object.keys(percents).forEach(function (id) {
      var p = percents[id];
      if (!p) return;
      pctSum += p;
      cats.push({ categoryId: id, pct: p, amount: floorUnit(total * p / 100), rest: false });
    });
    if (pctSum > 100 + 1e-9) return { ok: false, error: '비율 합계가 ' + (Math.round(pctSum * 10) / 10) + '%예요. 100% 이하로 맞춰 주세요.' };
    var assigned = cats.reduce(function (a, c) { return a + c.amount; }, 0);
    var rest = total - assigned;
    if (restMode === 'history' && rest >= UNIT) {
      // 비율을 정하지 않은 카테고리에 지난 지출 비율대로
      var rec = recommend(state, mk, null);
      var others = rec.categories.filter(function (c) { return !percents[c.categoryId]; });
      var base = others.reduce(function (a, c) { return a + c.avg; }, 0);
      if (base > 0) {
        others.forEach(function (c) {
          var amt = floorUnit(rest * c.avg / base);
          if (amt > 0) cats.push({ categoryId: c.categoryId, pct: Math.round(amt / total * 1000) / 10, amount: amt, rest: true });
        });
        assigned = cats.reduce(function (a, c) { return a + c.amount; }, 0);
      }
    }
    // 카테고리 순서는 설정의 순서대로
    var order = state.categories.map(function (c) { return c.id; });
    cats.sort(function (a, b) { return order.indexOf(a.categoryId) - order.indexOf(b.categoryId); });
    return { ok: true, categories: cats, total: total, assigned: assigned, rest: total - assigned, restPct: Math.max(0, Math.round((100 - pctSum) * 10) / 10) };
  }

  L.budget = {
    recommend: recommend,
    ratioPlan: ratioPlan,
    fixedByCategory: fixedByCategory,
    level: level,
    getBudget: getBudget,
    monthStatus: monthStatus,
    levelsSnapshot: levelsSnapshot,
    warnings: warnings,
    levelUpMessages: levelUpMessages
  };
})(window.Ledger = window.Ledger || {});
