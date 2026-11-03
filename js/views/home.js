/* 홈: 경고·납부 배너, 이번 달 예산 요약, 기간 합계, 다가오는 납부, 최근 지출 */
(function (L) {
  'use strict';

  var U = L.utils;

  function banner(level, text, action) {
    return '<div class="banner banner-' + level + '" role="' + (level === 'over' ? 'alert' : 'status') + '">' +
      '<span>' + U.escapeHtml(text) + '</span>' + (action || '') + '</div>';
  }

  function buildBanners(s, today) {
    var out = [];
    var alerts = L.recurring.alerts(s, today);
    var overdue = alerts.filter(function (a) { return a.status === 'overdue'; });
    var dueToday = alerts.filter(function (a) { return a.status === 'today'; });
    var soon = alerts.filter(function (a) { return a.status === 'soon'; });
    if (overdue.length) {
      out.push(banner('over', '🚨 납부일이 지난 정기 납부가 ' + overdue.length + '건 있어요: ' +
        overdue.map(function (a) { return a.item.name; }).join(', '), '<a class="banner-link" href="#recurring">확인</a>'));
    }
    if (dueToday.length) {
      out.push(banner('info', '📅 오늘 납부: ' + dueToday.map(function (a) {
        return a.item.name + ' ' + U.formatWon(a.item.amount);
      }).join(', ')));
    } else if (soon.length) {
      out.push(banner('info', '📅 곧 납부할 항목이 ' + soon.length + '건 있어요 (가장 빠른 날: ' +
        soon[0].item.name + ' ' + L.recurring.ddayLabel(soon[0].diff) + ')'));
    }

    L.budget.warnings(s, today).forEach(function (w) { out.push(banner(w.level, w.text, '<a class="banner-link" href="#budget">예산</a>')); });

    var limit = s.settings.dailyLimit;
    if (limit) {
      var todayTotal = L.stats.sum(s.expenses, today, today);
      if (todayTotal > limit) out.push(banner('over', '🚨 오늘 하루 한도 ' + U.formatWon(limit) + '을 ' + U.formatWon(todayTotal - limit) + ' 넘었어요.'));
    }

    if (L.store.needsBackup(today)) {
      out.push(banner('info', '💾 마지막 백업 후 30일이 지났어요. 브라우저 데이터가 지워지면 기록이 사라질 수 있어요.', '<a class="banner-link" href="#settings">백업하기</a>'));
    }
    return out.join('');
  }

  function budgetCard(s, today) {
    var mk = U.monthKey(today);
    var st = L.budget.monthStatus(s, mk, today);
    var t = st.total;
    var monthName = (+mk.slice(5, 7)) + '월';
    if (!t.limit) {
      return '<section class="cover" aria-label="이번 달 요약">' +
        '<p class="cover-label">' + monthName + '에 쓴 돈</p>' +
        '<p class="cover-value">' + won(t.spent) + '</p>' +
        '<p class="cover-meta">전체 예산을 정하면 남은 금액과 하루에 써도 되는 금액을 알려 드려요.</p>' +
        '<a class="cover-cta" href="#budget">' + monthName + ' 예산 정하기</a>' +
      '</section>';
    }
    var over = t.remaining < 0;
    // 오늘까지 지난 날의 비율 = 계획대로라면 써도 되는 비율
    var dim = U.daysInMonth(+mk.slice(0, 4), +mk.slice(5, 7));
    var todayPct = (+today.slice(8, 10)) / dim * 100;
    var spentPct = Math.min(100, t.pct);
    var gap = t.pct - todayPct;
    var note = over
      ? '예산을 넘었어요. 남은 ' + st.daily.daysLeft + '일은 꼭 필요한 곳에만 써 보세요.'
      : gap > 5 ? '계획보다 빠르게 쓰고 있어요. 하루 <strong>' + U.formatWon(st.daily.amount) + '</strong> 안에서 쓰면 예산을 지킬 수 있어요.'
      : '계획 안에서 쓰고 있어요. 하루 <strong>' + U.formatWon(st.daily.amount) + '</strong>까지 써도 괜찮아요.';

    return '<section class="cover' + (over ? ' cover-over' : '') + '" aria-label="이번 달 예산">' +
      '<p class="cover-label">' + (over ? monthName + ' 예산 초과' : monthName + ' 남은 예산') + ' ' + L.ui.levelBadge(t.level) + '</p>' +
      '<p class="cover-value">' + won(Math.abs(t.remaining)) + '</p>' +
      '<div class="pace pace-' + t.level + '" style="--spent:' + spentPct.toFixed(1) + '%;--today:' + todayPct.toFixed(1) + '%" ' +
        'role="img" aria-label="예산의 ' + Math.floor(t.pct) + '% 사용, 오늘 기준 ' + Math.round(todayPct) + '%">' +
        '<div class="pace-track"><span class="pace-fill"></span><span class="pace-mark"></span></div>' +
        '<div class="pace-legend"><span>' + U.formatWon(t.spent) + ' 사용 (' + Math.floor(t.pct) + '%)</span>' +
          '<span class="mark-key">오늘 기준 ' + Math.round(todayPct) + '%</span></div>' +
      '</div>' +
      '<p class="cover-meta">예산 ' + U.formatWon(t.limit) + ' · 오늘 포함 ' + st.daily.daysLeft + '일 남음</p>' +
      '<p class="pace-note">' + note + '</p>' +
    '</section>';
  }

  /** 989900 → '989,900<span class="unit">원</span>' */
  function won(n) {
    return Math.round(n).toLocaleString('ko-KR') + '<span class="unit">원</span>';
  }

  function totalsCard(s, today) {
    var ws = s.settings.weekStartsOn;
    var week = L.stats.range('week', today, ws);
    var month = L.stats.range('month', today, ws);
    function cell(label, amount, href) {
      return '<a class="stat-cell" href="' + href + '"><span class="muted">' + label + '</span><strong>' + U.formatWon(amount) + '</strong></a>';
    }
    return '<section class="stat-grid">' +
      cell('오늘', L.stats.sum(s.expenses, today, today), '#stats') +
      cell('이번 주', L.stats.sum(s.expenses, week.start, week.end), '#stats') +
      cell('이번 달', L.stats.sum(s.expenses, month.start, month.end), '#stats') +
    '</section>';
  }

  function upcomingCard(s, today) {
    var alerts = L.recurring.alerts(s, today);
    var body;
    if (!s.recurring.length) {
      body = '<div class="empty"><p>관리비, 통신비, 적금처럼 날짜가 정해진 돈을 등록하면 납부일 전에 여기서 알려 드려요.</p>' +
        '<a class="btn btn-small" href="#recurring">정기 납부 등록</a></div>';
    } else if (!alerts.length) {
      var next = s.recurring.map(function (it) { return L.recurring.status(it, today); })
        .filter(function (x) { return x.next; })
        .sort(function (a, b) { return a.next.date.localeCompare(b.next.date); })[0];
      body = '<p class="empty">곧 납부할 항목이 없어요.' +
        (next ? '<br>다음 납부는 ' + U.escapeHtml(next.item.name) + ', ' + U.formatDateKo(next.next.date) + ' (' + L.recurring.ddayLabel(next.diff) + ')' : '') + '</p>';
    } else {
      body = '<ul class="due-list">' + alerts.map(function (a) {
        return '<li class="due-item due-' + a.status + '">' +
          '<span class="dday dday-' + a.status + '">' + L.recurring.ddayLabel(a.diff) + '</span>' +
          '<span class="due-main"><strong>' + U.escapeHtml(a.item.name) + '</strong>' +
            '<small class="muted">' + U.formatDateKo(a.next.date) + (a.overdue > 1 ? ' · 미납 ' + a.overdue + '회' : '') + '</small></span>' +
          '<span class="due-amount">' + U.formatWon(a.item.amount) + '</span>' +
          '<button type="button" class="btn btn-small" data-pay="' + U.escapeHtml(a.item.id) + '">납부 완료</button>' +
        '</li>';
      }).join('') + '</ul>';
    }
    return '<section class="card"><div class="row-between"><h3 class="card-title">다가오는 납부</h3><a href="#recurring" class="link-small">전체 보기</a></div>' + body + '</section>';
  }

  function recentCard(s, today) {
    // 앞으로 나갈 할부 회차(미래 날짜)는 최근 지출에서 뺀다
    var recent = L.ui.sortExpenses(s.expenses.filter(function (e) { return e.date <= today; })).slice(0, 5);
    var body = recent.length
      ? '<ul class="expense-list">' + recent.map(function (x) { return L.ui.expenseRow(x, { showDate: true }); }).join('') + '</ul>'
      : '<div class="empty"><p>아직 지출이 없어요. 첫 지출을 기록해 보세요.</p>' +
          '<button type="button" class="btn btn-primary btn-small" data-add-expense>지출 기록하기</button></div>';
    return '<section class="card"><div class="row-between"><h3 class="card-title">최근 지출</h3>' +
      (recent.length ? '<a href="#list" class="link-small">전체 보기</a>' : '') + '</div>' + body + '</section>';
  }

  function render(el) {
    var s = L.store.getState();
    var today = U.today();
    el.innerHTML =
      '<h2 class="view-title">홈 <small>' + U.formatDateKo(today) + '</small></h2>' +
      '<div class="banners">' + buildBanners(s, today) + '</div>' +
      budgetCard(s, today) +
      totalsCard(s, today) +
      '<div class="home-grid">' + upcomingCard(s, today) + recentCard(s, today) + '</div>' +
      L.ui.fabHtml();

    L.ui.bindExpenseClicks(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pay]');
      if (!b) return;
      var item = L.store.getState().recurring.find(function (x) { return x.id === b.getAttribute('data-pay'); });
      var st = item && L.recurring.status(item, U.today());
      if (st && st.next) L.forms.openPayForm(item, st.next);
    });
  }

  L.views = L.views || {};
  L.views.home = { title: '홈', render: render };
})(window.Ledger = window.Ledger || {});
