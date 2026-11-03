/* 정기 납부: 목록(다음 납부일, D-day, 상태), 추가·수정·삭제, 납부 완료 */
(function (L) {
  'use strict';

  var U = L.utils;
  var STATUS_TEXT = { overdue: '미납', today: '오늘', soon: '곧 납부', scheduled: '예정', none: '-' };

  function openRecurringForm(item) {
    var s = L.store.getState();
    var c = item ? item.cycle : { type: 'monthly', day: +U.today().slice(8, 10) };
    var dayOptions = function (sel) {
      var o = '';
      for (var d = 1; d <= 31; d++) o += '<option value="' + d + '"' + (d === sel ? ' selected' : '') + '>' + d + '일</option>';
      return o;
    };
    var monthOptions = '';
    for (var m = 1; m <= 12; m++) monthOptions += '<option value="' + m + '"' + (c.type === 'yearly' && c.month === m ? ' selected' : '') + '>' + m + '월</option>';
    var weekOptions = U.WEEKDAY_KO.map(function (w, i) {
      return '<option value="' + i + '"' + (c.type === 'weekly' && c.weekday === i ? ' selected' : '') + '>' + w + '요일</option>';
    }).join('');

    var html =
      '<form class="form" novalidate>' +
        '<label class="field"><span>이름</span><input type="text" name="name" maxlength="30" placeholder="예: 관리비, 통신비, 적금" value="' + U.escapeHtml(item ? item.name : '') + '"></label>' +
        '<p class="field-error" data-error-for="name"></p>' +
        '<div class="field-row">' +
          '<label class="field"><span>금액 (변동 시 예상 금액)</span><input type="text" name="amount" inputmode="numeric" autocomplete="off" value="' + (item ? item.amount.toLocaleString('ko-KR') : '') + '"></label>' +
          '<label class="field"><span>카테고리</span><select name="categoryId">' + L.ui.categoryOptions(item ? item.categoryId : 'utility') + '</select></label>' +
        '</div>' +
        '<p class="field-error" data-error-for="amount"></p>' +
        '<div class="field-row">' +
          '<label class="field"><span>주기</span><select name="cycleType">' +
            '<option value="monthly"' + (c.type === 'monthly' ? ' selected' : '') + '>매월</option>' +
            '<option value="weekly"' + (c.type === 'weekly' ? ' selected' : '') + '>매주</option>' +
            '<option value="yearly"' + (c.type === 'yearly' ? ' selected' : '') + '>매년</option>' +
          '</select></label>' +
          '<label class="field" data-cycle="yearly"><span>월</span><select name="month">' + monthOptions + '</select></label>' +
          '<label class="field" data-cycle="monthly yearly"><span>날짜</span><select name="day">' + dayOptions(c.day || 1) + '</select></label>' +
          '<label class="field" data-cycle="weekly"><span>요일</span><select name="weekday">' + weekOptions + '</select></label>' +
        '</div>' +
        '<p class="hint muted" data-cycle="monthly yearly">그 달에 없는 날짜(예: 31일)는 그 달의 마지막 날로 알려 드려요.</p>' +
        '<p class="field-error" data-error-for="cycle"></p>' +
        '<div class="field-row">' +
          '<label class="field"><span>며칠 전부터 알림</span><input type="number" name="remindDaysBefore" min="0" max="30" value="' + (item ? item.remindDaysBefore : 3) + '"></label>' +
          '<label class="field"><span>시작일</span><input type="date" name="startDate" value="' + (item ? item.startDate : U.today()) + '"></label>' +
        '</div>' +
        '<p class="hint muted">시작일 이전 회차는 미납으로 보지 않아요.</p>' +
        '<p class="field-error" data-error-for="remindDaysBefore"></p>' +
        '<p class="field-error" data-error-for="startDate"></p>' +
        '<label class="field"><span>메모 (선택)</span><input type="text" name="memo" maxlength="100" value="' + U.escapeHtml(item ? item.memo : '') + '"></label>' +
        '<div class="modal-actions"><span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>취소</button>' +
          '<button type="submit" class="btn btn-primary">' + (item ? '수정' : '추가') + '</button>' +
        '</div>' +
      '</form>';

    L.ui.openModal({
      title: item ? '정기 납부 수정' : '정기 납부 추가',
      html: html,
      onMount: function (dlg, close) {
        var form = dlg.querySelector('form');
        function syncCycle() {
          var type = form.cycleType.value;
          form.querySelectorAll('[data-cycle]').forEach(function (n) {
            n.hidden = n.getAttribute('data-cycle').split(' ').indexOf(type) < 0;
          });
        }
        form.cycleType.addEventListener('change', syncCycle);
        syncCycle();
        // 새 항목: 카테고리를 직접 고르기 전까지는 이름으로 추천 (예: 적금 → 저축)
        var catTouched = !!item;
        form.categoryId.addEventListener('change', function () { catTouched = true; });
        form.name.addEventListener('input', function () {
          if (catTouched) return;
          var r = L.classifier.classifyByKeyword(form.name.value, L.store.getState());
          if (r.source === 'keyword') form.categoryId.value = r.categoryId;
        });
        form.name.focus();
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = {
            name: form.name.value,
            amount: form.amount.value,
            categoryId: form.categoryId.value,
            cycle: { type: form.cycleType.value, day: form.day.value, weekday: form.weekday.value, month: form.month.value },
            remindDaysBefore: form.remindDaysBefore.value,
            startDate: form.startDate.value,
            memo: form.memo.value
          };
          var res = item ? L.store.updateRecurring(item.id, input) : L.store.addRecurring(input);
          if (!res.ok) {
            var errs = Object.assign({}, res.errors);
            L.ui.showErrors(form, errs);
            return;
          }
          close();
          L.ui.toast(item ? '수정했어요' : res.item.name + ' 정기 납부를 추가했어요', 'ok');
        });
      }
    });
  }

  function render(el) {
    var s = L.store.getState();
    var today = U.today();
    var list = s.recurring.map(function (it) { return L.recurring.status(it, today); })
      .sort(function (a, b) {
        if (!a.next) return 1;
        if (!b.next) return -1;
        return a.next.date.localeCompare(b.next.date);
      });
    var fixed = L.recurring.monthlyFixedTotal(s, U.monthKey(today));

    var body = list.length
      ? '<ul class="recurring-list">' + list.map(function (x) {
          var it = x.item, cat = L.store.getCategory(it.categoryId);
          return '<li class="card recurring-item rec-' + x.status + '">' +
            '<div class="rec-head">' +
              '<span class="dday dday-' + x.status + '">' + (x.next ? L.recurring.ddayLabel(x.diff) : '-') + '</span>' +
              '<div class="rec-main"><strong>' + U.escapeHtml(it.name) + '</strong>' +
                '<small class="muted">' + U.escapeHtml(cat.emoji + ' ' + cat.name) + ' · ' + L.recurring.cycleText(it.cycle) + ' · ' + it.remindDaysBefore + '일 전 알림</small></div>' +
              '<span class="rec-amount">' + U.formatWon(it.amount) + '</span>' +
            '</div>' +
            '<p class="rec-next">' + (x.next
              ? (x.status === 'overdue' ? '🚨 ' : '') + STATUS_TEXT[x.status] + ' · ' + U.escapeHtml(L.recurring.periodText(it, x.next)) + ' · 납부일 ' + U.formatDateKo(x.next.date) +
                (x.overdue > 1 ? ' · 미납 ' + x.overdue + '회' : '')
              : '예정된 회차가 없어요') + '</p>' +
            (it.memo ? '<p class="muted rec-memo">' + U.escapeHtml(it.memo) + '</p>' : '') +
            '<div class="rec-actions">' +
              (x.next ? '<button type="button" class="btn btn-primary btn-small" data-pay="' + U.escapeHtml(it.id) + '">납부 완료</button>' : '') +
              '<button type="button" class="btn btn-small" data-edit="' + U.escapeHtml(it.id) + '">수정</button>' +
              '<button type="button" class="btn btn-small btn-danger-ghost" data-del="' + U.escapeHtml(it.id) + '">삭제</button>' +
            '</div>' +
          '</li>';
        }).join('') + '</ul>'
      : '<div class="card"><div class="empty"><p>관리비, 통신비, 적금처럼 정해진 날짜에 나가는 돈을 등록하면<br>납부일 전에 홈에서 알려 드려요.</p>' +
          '<button type="button" class="btn btn-primary btn-small" data-add>첫 정기 납부 등록</button></div></div>';

    el.innerHTML =
      '<div><div class="view-head"><h2 class="view-title">정기납부</h2>' +
        '<button type="button" class="btn btn-primary btn-small" data-add>정기 납부 추가</button></div>' +
      '<p class="view-sub">이번 달 고정 지출 <strong>' + U.formatWon(fixed) + '</strong></p></div>' +
      body;

    el.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { openRecurringForm(null); });
    });
    el.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-pay],[data-edit],[data-del]');
      if (!b) return;
      var id = b.getAttribute('data-pay') || b.getAttribute('data-edit') || b.getAttribute('data-del');
      var item = L.store.getState().recurring.find(function (x) { return x.id === id; });
      if (!item) return;
      if (b.hasAttribute('data-pay')) {
        var st = L.recurring.status(item, U.today());
        if (st.next) L.forms.openPayForm(item, st.next);
      } else if (b.hasAttribute('data-edit')) {
        openRecurringForm(item);
      } else if (await L.ui.confirm(item.name + ' 정기 납부를 삭제할까요?\n이미 기록된 지출 내역은 그대로 남아요.', { title: '삭제 확인', okText: '삭제', danger: true })) {
        L.store.deleteRecurring(item.id);
        L.ui.toast('삭제했어요');
      }
    });
  }

  L.views = L.views || {};
  L.views.recurring = { title: '정기납부', render: render };
})(window.Ledger = window.Ledger || {});
