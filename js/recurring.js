/* 정기 납부 날짜 계산 (화면과 분리된 순수 함수, '오늘'은 인자로 받는다)
 * cycle: { type:'monthly', day } | { type:'weekly', weekday(0=일~6=토) } | { type:'yearly', month, day }
 * 회차 식별자(period): 월간 'YYYY-MM' / 주간 'YYYY-Www' / 연간 'YYYY'
 * 그 달에 없는 날짜(31일, 2월 29일 등)는 그 달의 마지막 날로 처리한다. */
(function (L) {
  'use strict';

  var U = L.utils;
  var LOOKBACK_DAYS = 366;  // 미납을 찾을 때 거슬러 올라가는 최대 기간
  var LOOKAHEAD_DAYS = 400; // 다음 납부일을 찾는 최대 기간

  function clampDay(year, month, day) {
    return Math.min(day, U.daysInMonth(year, month));
  }

  /** from~to(포함) 사이의 납부일 목록 [{date, period}] */
  function occurrences(item, from, to) {
    var out = [];
    if (from > to) return out;
    var c = item.cycle;
    if (c.type === 'monthly') {
      var mk = U.monthKey(from), last = U.monthKey(to);
      while (mk <= last) {
        var y = +mk.slice(0, 4), m = +mk.slice(5, 7);
        var date = mk + '-' + U.pad2(clampDay(y, m, c.day));
        if (date >= from && date <= to) out.push({ date: date, period: mk });
        mk = U.addMonths(mk, 1);
      }
    } else if (c.type === 'yearly') {
      for (var yr = +from.slice(0, 4); yr <= +to.slice(0, 4); yr++) {
        var d = yr + '-' + U.pad2(c.month) + '-' + U.pad2(clampDay(yr, c.month, c.day));
        if (d >= from && d <= to) out.push({ date: d, period: String(yr) });
      }
    } else if (c.type === 'weekly') {
      var cur = U.addDays(from, (c.weekday - U.weekday(from) + 7) % 7);
      while (cur <= to) {
        out.push({ date: cur, period: U.isoWeekKey(cur) });
        cur = U.addDays(cur, 7);
      }
    }
    return out;
  }

  function isPaid(item, period) { return item.paidPeriods.indexOf(period) >= 0; }

  /** 아직 납부하지 않은 가장 이른 회차 (미납 포함). 없으면 null */
  function nextPending(item, today) {
    var from = item.startDate > U.addDays(today, -LOOKBACK_DAYS) ? item.startDate : U.addDays(today, -LOOKBACK_DAYS);
    var list = occurrences(item, from, U.addDays(today, LOOKAHEAD_DAYS));
    for (var i = 0; i < list.length; i++) {
      if (!isPaid(item, list[i].period)) return list[i];
    }
    return null;
  }

  /** 미납 회차 수 */
  function overdueCount(item, today) {
    var from = item.startDate > U.addDays(today, -LOOKBACK_DAYS) ? item.startDate : U.addDays(today, -LOOKBACK_DAYS);
    return occurrences(item, from, U.addDays(today, -1)).filter(function (o) { return !isPaid(item, o.period); }).length;
  }

  /**
   * 항목 상태
   * status: 'overdue'(미납) | 'today'(오늘) | 'soon'(알림 기간) | 'scheduled'(예정) | 'none'
   */
  function status(item, today) {
    var next = nextPending(item, today);
    if (!next) return { item: item, next: null, diff: null, status: 'none', overdue: 0 };
    var diff = U.diffDays(today, next.date);
    var st = diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff <= item.remindDaysBefore ? 'soon' : 'scheduled';
    return { item: item, next: next, diff: diff, status: st, overdue: overdueCount(item, today) };
  }

  /** 홈 알림 대상: 미납 + 오늘 + 알림 기간 안 (납부일 순) */
  function alerts(state, today) {
    return state.recurring.map(function (it) { return status(it, today); })
      .filter(function (s) { return s.status === 'overdue' || s.status === 'today' || s.status === 'soon'; })
      .sort(function (a, b) { return a.next.date.localeCompare(b.next.date); });
  }

  /** 해당 월의 정기 납부 합계 (고정 지출). 시작일 이전 회차는 넣지 않는다. */
  function monthlyFixedTotal(state, mk) {
    var start = mk + '-01', end = U.endOfMonth(start);
    return state.recurring.reduce(function (acc, it) {
      var from = it.startDate && it.startDate > start ? it.startDate : start;
      return acc + occurrences(it, from, end).length * it.amount;
    }, 0);
  }

  function ddayLabel(diff) {
    if (diff == null) return '';
    if (diff === 0) return '오늘';
    if (diff > 0) return 'D-' + diff;
    return '미납 ' + (-diff) + '일';
  }

  function cycleText(cycle) {
    if (cycle.type === 'monthly') return '매월 ' + cycle.day + '일';
    if (cycle.type === 'weekly') return '매주 ' + U.WEEKDAY_KO[cycle.weekday] + '요일';
    if (cycle.type === 'yearly') return '매년 ' + cycle.month + '월 ' + cycle.day + '일';
    return '';
  }

  function periodText(item, occ) {
    if (item.cycle.type === 'monthly') return U.formatMonth(occ.period) + '분';
    if (item.cycle.type === 'yearly') return occ.period + '년분';
    return U.formatDateKo(occ.date) + ' 회차';
  }

  L.recurring = {
    occurrences: occurrences,
    nextPending: nextPending,
    overdueCount: overdueCount,
    status: status,
    alerts: alerts,
    monthlyFixedTotal: monthlyFixedTotal,
    ddayLabel: ddayLabel,
    cycleText: cycleText,
    periodText: periodText
  };
})(window.Ledger = window.Ledger || {});
