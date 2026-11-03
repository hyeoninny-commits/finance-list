/* 예산: 월 선택, 전체·카테고리별 예산 입력, 진행 막대, 고정 지출, 하루 권장 지출, 지난달 복사 */
(function (L) {
  'use strict';

  var U = L.utils;
  var month = null;

  function amountValue(n) { return n ? n.toLocaleString('ko-KR') : ''; }

  var TREND_TEXT = { up: '▲ 늘어나는 중', down: '▼ 줄어드는 중', flat: '비슷함' };

  /**
   * 예산 추천 창 (F-4.5)
   * - 지난 지출로 추천: 최근 3개월 추이로 카테고리별 금액 제안 (목표 총액을 넣으면 그 안에서 나눔)
   * - 비율로 나누기: 예) 음식 50%, 뷰티 20%, 나머지 30%
   * 결과는 바로 저장하지 않고 예산 입력 칸에 채워 넣는다. 사용자가 확인한 뒤 [예산 저장]을 누른다.
   */
  function openRecommend(el, mk) {
    var s = L.store.getState();
    var cur = L.budget.getBudget(s, mk);
    var base = L.budget.recommend(s, mk, null);
    var mode = 'auto';
    var html =
      '<div class="segmented rec-tabs" role="tablist" aria-label="추천 방식">' +
        '<button type="button" role="tab" data-mode="auto" aria-selected="true">지난 지출로 추천</button>' +
        '<button type="button" role="tab" data-mode="ratio" aria-selected="false">비율로 나누기</button>' +
      '</div>' +
      '<form class="form rec-form" novalidate>' +
        '<label class="field field-amount"><span data-total-label>목표 총액 (선택)</span>' +
          '<input type="text" name="target" inputmode="numeric" autocomplete="off" placeholder="비우면 지난 지출만큼" value="' + amountValue(cur.total) + '"></label>' +
        '<p class="field-error" data-error-for="target"></p>' +
        '<div data-rec-body></div>' +
        '<div class="modal-actions"><span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>취소</button>' +
          '<button type="submit" class="btn btn-primary" data-apply>예산 칸에 넣기</button>' +
        '</div>' +
      '</form>';

    L.ui.openModal({
      title: U.formatMonth(mk) + ' 예산 추천',
      html: html,
      className: 'modal-wide',
      onMount: function (dlg, close) {
        var form = dlg.querySelector('form');
        var body = dlg.querySelector('[data-rec-body]');
        var applyBtn = dlg.querySelector('[data-apply]');
        var pct = {}; // 비율 모드 입력값 보관 (모드를 바꿔도 유지)
        var restHistory = true;
        var plan = null; // { total, categories:[{categoryId, amount}] }

        function target() {
          var raw = form.target.value.trim();
          if (!raw) return null;
          var n = U.parseAmount(raw);
          return isNaN(n) ? NaN : n;
        }

        function catLabel(id) {
          var c = L.store.getCategory(id);
          return '<span aria-hidden="true">' + U.escapeHtml(c.emoji) + '</span> ' + U.escapeHtml(c.name);
        }

        function renderAuto() {
          var t = target();
          form.querySelector('[data-total-label]').textContent = '목표 총액 (선택)';
          form.target.placeholder = '비우면 지난 지출만큼';
          if (Number.isNaN(t)) { body.innerHTML = ''; plan = null; applyBtn.disabled = true; return; }
          if (!base.months.length) {
            body.innerHTML = '<p class="empty">지난 3개월 지출 기록이 없어서 추천할 수 없어요.<br>[비율로 나누기]로 직접 정해 보세요.</p>';
            plan = null; applyBtn.disabled = true; return;
          }
          var r = L.budget.recommend(L.store.getState(), mk, t);
          plan = r;
          applyBtn.disabled = !r.categories.length;
          var monthsText = r.months.slice().reverse().map(function (m) { return (+m.slice(5, 7)) + '월'; }).join('·');
          body.innerHTML =
            '<p class="hint">' + monthsText + ' 지출 기준이에요. 최근 달일수록 더 크게 반영하고, 정기 납부(고정 지출)보다 적게 잡지 않아요.</p>' +
            (r.warning ? '<p class="banner banner-warn" role="status">⚠️ ' + U.escapeHtml(r.warning) + '</p>' : '') +
            '<div class="rec-table" role="table" aria-label="카테고리별 추천 예산">' +
              '<div class="rec-row rec-head" role="row"><span role="columnheader">카테고리</span><span role="columnheader">지난달</span><span role="columnheader">평균</span><span role="columnheader">추천</span></div>' +
              r.categories.map(function (c) {
                return '<div class="rec-row" role="row">' +
                  '<span role="cell" class="rec-cat">' + catLabel(c.categoryId) +
                    (c.trend && c.trend !== 'flat' ? ' <small class="trend trend-' + c.trend + '">' + TREND_TEXT[c.trend] + '</small>' : '') +
                    (c.fixed ? ' <small class="muted">고정 ' + U.formatWon(c.fixed) + '</small>' : '') + '</span>' +
                  '<span role="cell" class="num muted">' + U.formatWon(c.last) + '</span>' +
                  '<span role="cell" class="num muted">' + U.formatWon(c.avg) + '</span>' +
                  '<strong role="cell" class="num">' + U.formatWon(c.amount) + '</strong>' +
                '</div>';
              }).join('') +
              '<div class="rec-row rec-total" role="row"><span role="cell">전체 예산</span><span role="cell"></span><span role="cell"></span><strong role="cell" class="num">' + U.formatWon(r.total) + '</strong></div>' +
            '</div>';
        }

        function renderRatio() {
          var t = target();
          form.querySelector('[data-total-label]').textContent = '전체 예산';
          form.target.placeholder = base.total ? '예: ' + base.total.toLocaleString('ko-KR') : '예: 1,500,000';
          var st = L.store.getState();
          var rows = st.categories.map(function (c) {
            return '<label class="ratio-row"><span class="rec-cat">' + catLabel(c.id) + '</span>' +
              '<span class="ratio-input"><input type="text" inputmode="decimal" autocomplete="off" name="pct:' + U.escapeHtml(c.id) + '" value="' + (pct[c.id] || '') + '" placeholder="0" aria-label="' + U.escapeHtml(c.name) + ' 비율"><span aria-hidden="true">%</span></span>' +
              '<span class="num muted" data-amt="' + U.escapeHtml(c.id) + '"></span></label>';
          }).join('');
          body.innerHTML =
            '<p class="hint">원하는 카테고리에만 비율을 넣으세요. 예) 음식 50, 뷰티 20 → 나머지 30%</p>' +
            '<div class="ratio-list">' + rows + '</div>' +
            '<label class="toggle"><input type="checkbox" name="restHistory"' + (restHistory ? ' checked' : '') + '> 나머지는 지난 지출 비율대로 다른 카테고리에 나누기</label>' +
            '<p class="ratio-summary" data-ratio-summary aria-live="polite"></p>' +
            '<p class="field-error" data-error-for="pct"></p>';
          body.querySelectorAll('input[name^="pct:"]').forEach(function (inp) {
            inp.addEventListener('input', function () { pct[inp.name.slice(4)] = inp.value.trim(); updateRatio(); });
          });
          body.querySelector('[name=restHistory]').addEventListener('change', function (e) { restHistory = e.target.checked; updateRatio(); });
          updateRatio();
        }

        function updateRatio() {
          var t = target();
          var err = body.querySelector('[data-error-for="pct"]');
          var summary = body.querySelector('[data-ratio-summary]');
          var percents = {};
          var bad = false;
          Object.keys(pct).forEach(function (id) {
            if (!pct[id]) return;
            var n = Number(pct[id]);
            if (!isFinite(n) || n < 0 || n > 100 || !/^\d+(\.\d)?$/.test(pct[id])) bad = true; else if (n > 0) percents[id] = n;
          });
          body.querySelectorAll('[data-amt]').forEach(function (s2) { s2.textContent = ''; });
          plan = null; applyBtn.disabled = true;
          if (bad) { err.textContent = '비율은 0~100 사이 숫자(소수 1자리까지)로 넣어 주세요.'; summary.textContent = ''; return; }
          if (!t || Number.isNaN(t)) { err.textContent = ''; summary.textContent = '위에 전체 예산을 넣으면 금액으로 바꿔 보여 드려요.'; return; }
          var r = L.budget.ratioPlan(L.store.getState(), mk, t, percents, restHistory ? 'history' : 'keep');
          if (!r.ok) { err.textContent = r.error; summary.textContent = ''; return; }
          err.textContent = '';
          r.categories.forEach(function (c) {
            var cell = body.querySelector('[data-amt="' + c.categoryId + '"]');
            if (cell) cell.textContent = U.formatWon(c.amount) + (c.rest ? ' (나머지)' : '');
          });
          summary.innerHTML = '나머지 <strong>' + r.restPct + '%</strong>' +
            (r.rest > 0 ? ' · 카테고리 없이 전체 예산에만 <strong>' + U.formatWon(r.rest) + '</strong>' : ' · 모두 카테고리에 나눴어요');
          plan = { total: t, categories: r.categories };
          applyBtn.disabled = !r.categories.length && !t;
        }

        function renderMode() {
          dlg.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === mode)); });
          if (mode === 'auto') renderAuto(); else renderRatio();
        }

        dlg.querySelectorAll('[data-mode]').forEach(function (b) {
          b.addEventListener('click', function () { mode = b.getAttribute('data-mode'); renderMode(); });
        });
        form.target.addEventListener('input', function () {
          var t = target();
          L.ui.showErrors(form, Number.isNaN(t) ? { target: '금액은 1원~' + U.formatWon(U.MAX_AMOUNT) + ' 사이의 정수로 입력해 주세요.' } : {});
          if (Number.isNaN(t)) form.target.focus();
          if (mode === 'auto') renderAuto(); else updateRatio();
        });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!plan) return;
          close(); // 먼저 닫아야 포커스가 추천 버튼으로 돌아간 뒤 저장 버튼으로 옮겨진다
          applyPlan(el, plan);
          L.ui.toast('추천 예산을 넣었어요. 확인한 뒤 [예산 저장]을 눌러 주세요.', 'info');
        });
        renderMode();
        form.target.focus();
      }
    });
  }

  /** 추천 결과를 예산 입력 칸에 채운다 (저장은 사용자가) */
  function applyPlan(el, plan) {
    var form = el.querySelector('#budget-form');
    if (!form) return;
    var map = {};
    plan.categories.forEach(function (c) { map[c.categoryId] = c.amount; });
    form.total.value = amountValue(plan.total);
    form.total.classList.add('is-filled');
    form.querySelectorAll('.budget-input').forEach(function (inp) {
      var id = inp.name.slice(4);
      inp.value = amountValue(map[id]);
      inp.classList.toggle('is-filled', !!map[id]);
    });
    form.classList.add('is-recommended');
    form.querySelector('button[type=submit]').focus();
  }

  function statusLine(it) {
    if (!it.limit) return '<span class="muted">사용 ' + U.formatWon(it.spent) + '</span>';
    var rest = it.remaining >= 0 ? '남음 ' + U.formatWon(it.remaining) : '<strong class="text-over">' + U.formatWon(-it.remaining) + ' 초과</strong>';
    return '<span>' + U.formatWon(it.spent) + ' / ' + U.formatWon(it.limit) + ' · ' + Math.floor(it.pct) + '% · ' + rest + '</span>';
  }

  function render(el) {
    var s = L.store.getState();
    var today = U.today();
    month = month || U.monthKey(today);
    var st = L.budget.monthStatus(s, month, today);
    var budget = L.budget.getBudget(s, month);
    var fixed = L.recurring.monthlyFixedTotal(s, month);
    var prevMk = U.addMonths(month, -1);
    var hasPrev = !!s.budgets[prevMk];
    var t = st.total;

    var rows = st.categories.map(function (c) {
      var cat = L.store.getCategory(c.categoryId);
      return '<li class="budget-row budget-' + (c.level || 'none') + '">' +
        '<div class="budget-row-head">' +
          '<label for="b-' + U.escapeHtml(cat.id) + '" class="budget-name"><span aria-hidden="true">' + U.escapeHtml(cat.emoji) + '</span> ' + U.escapeHtml(cat.name) + ' ' + L.ui.levelBadge(c.level) + '</label>' +
          '<input id="b-' + U.escapeHtml(cat.id) + '" class="budget-input" type="text" inputmode="numeric" autocomplete="off" name="cat:' + U.escapeHtml(cat.id) + '" placeholder="예산 없음" value="' + amountValue(budget.byCategory[cat.id]) + '">' +
        '</div>' +
        L.ui.progressBar(c, cat.name + ' 예산 사용률') +
        '<div class="budget-row-status">' + statusLine(c) + '</div>' +
      '</li>';
    }).join('');

    el.innerHTML =
      '<h2 class="view-title">예산</h2>' +
      '<div class="period-nav">' +
        '<button type="button" class="icon-btn" data-shift="-1" aria-label="이전 달">‹</button>' +
        '<strong class="period-label">' + U.formatMonth(month) + '</strong>' +
        '<button type="button" class="icon-btn" data-shift="1" aria-label="다음 달">›</button>' +
        (month === U.monthKey(today) ? '' : '<button type="button" class="btn btn-small" data-this-month>이번 달</button>') +
      '</div>' +

      '<section class="card hero' + (t.level ? ' hero-' + t.level : '') + '">' +
        '<p class="hero-label">전체 예산 ' + L.ui.levelBadge(t.level) + '</p>' +
        (t.limit
          ? '<p class="hero-value">' + (t.remaining >= 0 ? U.formatWon(t.remaining) + ' 남음' : U.formatWon(-t.remaining) + ' 초과') + '</p>' +
            L.ui.progressBar(t, '전체 예산 사용률') +
            '<p class="muted">' + U.formatWon(t.spent) + ' / ' + U.formatWon(t.limit) + ' 사용 (' + Math.floor(t.pct) + '%)</p>'
          : '<p class="hero-value">' + U.formatWon(t.spent) + ' 사용</p><p class="muted">아래에서 전체 예산을 정해 주세요.</p>') +
        (st.daily ? '<p class="hero-daily">' + (st.daily.over ? '예산을 넘었어요. 하루 권장 지출 0원' : '하루 권장 지출 <strong>' + U.formatWon(st.daily.amount) + '</strong> · 오늘 포함 ' + st.daily.daysLeft + '일 남음') + '</p>' : '') +
        '<p class="fixed-line">📌 이번 달 고정 지출(정기 납부) <strong>' + U.formatWon(fixed) + '</strong>' +
          (t.limit && fixed ? ' · 예산의 ' + Math.round(fixed / t.limit * 100) + '%' : '') + '</p>' +
      '</section>' +

      '<form class="card" id="budget-form" novalidate>' +
        '<div class="row-between"><h3 class="card-title">예산 설정</h3>' +
          '<div class="button-row">' +
            '<button type="button" class="btn btn-small" data-recommend>예산 추천</button>' +
            '<button type="button" class="btn btn-small" data-copy' + (hasPrev ? '' : ' disabled title="지난달 예산이 없어요"') + '>지난달 예산 복사</button>' +
          '</div></div>' +
        '<label class="field"><span>전체 예산 (원)</span>' +
          '<input type="text" inputmode="numeric" autocomplete="off" name="total" placeholder="예: 1,500,000" value="' + amountValue(budget.total) + '"></label>' +
        '<p class="field-error" data-error-for="total"></p>' +
        '<h4 class="sub-title">카테고리별 예산 <small class="muted">비워 두면 예산 없음</small></h4>' +
        '<ul class="budget-list">' + rows + '</ul>' +
        '<p class="field-error" data-error-for="cats"></p>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">예산 저장</button></div>' +
      '</form>';

    el.querySelectorAll('[data-shift]').forEach(function (b) {
      b.addEventListener('click', function () { month = U.addMonths(month, +b.getAttribute('data-shift')); L.ui.preserveFocus(el, function () { render(el); }); });
    });
    var tm = el.querySelector('[data-this-month]');
    if (tm) tm.addEventListener('click', function () { month = U.monthKey(U.today()); L.ui.preserveFocus(el, function () { render(el); }); });

    el.querySelector('[data-recommend]').addEventListener('click', function () { openRecommend(el, month); });
    el.querySelector('[data-copy]').addEventListener('click', async function () {
      if (s.budgets[month] && !(await L.ui.confirm(U.formatMonth(month) + ' 예산을 지난달 예산으로 덮어쓸까요?', { okText: '덮어쓰기' }))) return;
      if (L.store.copyBudget(prevMk, month)) L.ui.toast('지난달 예산을 복사했어요', 'ok');
    });

    var form = el.querySelector('#budget-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errors = {};
      function read(input) {
        var raw = input.value.trim();
        if (!raw) return null;
        var n = U.parseAmount(raw);
        if (isNaN(n)) { input.setAttribute('aria-invalid', 'true'); return NaN; }
        input.removeAttribute('aria-invalid');
        return n;
      }
      var total = read(form.total);
      if (Number.isNaN(total)) errors.total = '전체 예산은 1원~' + U.formatWon(U.MAX_AMOUNT) + ' 사이의 정수로 입력해 주세요.';
      var byCategory = {};
      var badCat = false;
      Array.prototype.forEach.call(form.querySelectorAll('.budget-input'), function (inp) {
        var n = read(inp);
        if (Number.isNaN(n)) badCat = true;
        else if (n) byCategory[inp.name.slice(4)] = n;
      });
      if (badCat) errors.cats = '카테고리 예산은 1원~' + U.formatWon(U.MAX_AMOUNT) + ' 사이의 정수로 입력해 주세요. (빨간 칸 확인)';
      if (Object.keys(errors).length) { L.ui.showErrors(form, errors); return; }
      var catSum = Object.keys(byCategory).reduce(function (a, k) { return a + byCategory[k]; }, 0);
      L.store.setBudget(month, { total: total, byCategory: byCategory });
      L.ui.toast(U.formatMonth(month) + ' 예산을 저장했어요', 'ok');
      if (total && catSum > total) L.ui.toast('⚠️ 카테고리 예산 합계(' + U.formatWon(catSum) + ')가 전체 예산보다 커요', 'warn');
    });
  }

  L.views = L.views || {};
  L.views.budget = { title: '예산', render: render };
})(window.Ledger = window.Ledger || {});
