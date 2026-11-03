/* 지출 추가/수정 모달, 정기 납부 완료 모달 */
(function (L) {
  'use strict';

  var U = L.utils;

  function placeSuggestions(state) {
    var seen = {}, out = [];
    L.ui.sortExpenses(state.expenses).forEach(function (e) {
      if (out.length < 50 && !seen[e.place]) { seen[e.place] = true; out.push(e.place); }
    });
    return out.map(function (p) { return '<option value="' + U.escapeHtml(p) + '">'; }).join('');
  }

  /** 저장 후 예산 단계 변화·하루 한도 초과를 토스트로 알림 */
  function notifyAfterSave(beforeLevels, beforeDayTotal, date) {
    var s = L.store.getState();
    var after = L.budget.levelsSnapshot(s, beforeLevels.month);
    L.budget.levelUpMessages(s, beforeLevels, after).forEach(function (m) { L.ui.toast(m.text, m.level); });
    var limit = s.settings.dailyLimit;
    if (limit && date === U.today()) {
      var dayTotal = L.stats.sum(s.expenses, date, date);
      if (dayTotal > limit && beforeDayTotal <= limit) {
        L.ui.toast('🚨 오늘 하루 한도 ' + U.formatWon(limit) + '을 ' + U.formatWon(dayTotal - limit) + ' 넘었어요', 'over');
      }
    }
  }

  /**
   * 지출 추가/수정 모달
   * @param {{expense?: object, date?: string}} opts
   */
  function openExpenseForm(opts) {
    opts = opts || {};
    var s = L.store.getState();
    var editing = opts.expense || null;
    var init = editing || { date: opts.date || U.today(), amount: '', place: '', categoryId: null, memo: '', payment: null };
    // 할부 회차를 고치면 묶음 전체(결제일·총액·개월 수)를 수정한다
    var group = editing && editing.installment ? L.store.installmentGroup(editing.installment.groupId) : null;
    var initMonths = 1;
    if (group && group.length) {
      init = Object.assign({}, editing, { date: group[0].date, amount: editing.installment.total });
      initMonths = editing.installment.count;
    }
    var monthOptions = '<option value="1"' + (initMonths === 1 ? ' selected' : '') + '>일시불</option>';
    for (var mo = 2; mo <= L.storage.MAX_INSTALLMENT; mo++) {
      monthOptions += '<option value="' + mo + '"' + (initMonths === mo ? ' selected' : '') + '>' + mo + '개월</option>';
    }
    var hasMeetup = s.categories.some(function (c) { return c.id === 'meetup'; });

    var chips = s.categories.map(function (c) {
      return '<button type="button" class="chip" role="radio" aria-checked="false" data-cat="' + U.escapeHtml(c.id) + '" style="--cat:' + U.escapeHtml(c.color) + '">' +
        '<span aria-hidden="true">' + U.escapeHtml(c.emoji) + '</span> ' + U.escapeHtml(c.name) + '<span class="chip-suggest" aria-hidden="true">추천</span></button>';
    }).join('');

    var html =
      '<form class="form expense-form" novalidate>' +
        '<label class="field field-amount"><span>금액</span>' +
          '<input type="text" name="amount" inputmode="numeric" autocomplete="off" placeholder="0" value="' + (init.amount ? init.amount.toLocaleString('ko-KR') : '') + '" required></label>' +
        '<p class="field-error" data-error-for="amount"></p>' +
        '<label class="field"><span>사용처</span>' +
          '<input type="text" name="place" list="place-suggestions" autocomplete="off" maxlength="50" placeholder="예: 스타벅스, 올리브영" value="' + U.escapeHtml(init.place) + '" required></label>' +
        '<datalist id="place-suggestions">' + placeSuggestions(s) + '</datalist>' +
        '<p class="field-error" data-error-for="place"></p>' +
        '<div class="field"><span id="cat-label">카테고리 <small class="muted" data-suggest-note></small></span>' +
          '<div class="chips" role="radiogroup" aria-labelledby="cat-label">' + chips + '</div></div>' +
        (hasMeetup ? '<label class="toggle"><input type="checkbox" name="meetup"' + (init.categoryId === 'meetup' ? ' checked' : '') + '> 🥂 약속(만남)에서 쓴 돈이에요</label>' : '') +
        '<div class="field-row">' +
          '<label class="field"><span>날짜</span><input type="date" name="date" value="' + init.date + '" required></label>' +
          '<label class="field"><span>결제수단</span><select name="payment">' + L.ui.paymentOptions(init.payment) + '</select></label>' +
        '</div>' +
        '<p class="field-error" data-error-for="date"></p>' +
        '<div class="installment" data-installment hidden>' +
          '<label class="field"><span>할부</span><select name="months">' + monthOptions + '</select></label>' +
          '<p class="hint installment-hint" data-installment-hint aria-live="polite"></p>' +
          '<p class="field-error" data-error-for="months"></p>' +
        '</div>' +
        '<label class="field"><span>메모 (선택)</span><input type="text" name="memo" maxlength="200" autocomplete="off" value="' + U.escapeHtml(init.memo) + '"></label>' +
        '<div class="modal-actions">' +
          (editing ? '<button type="button" class="btn btn-danger-ghost" data-delete>삭제</button>' : '') +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>취소</button>' +
          '<button type="submit" class="btn btn-primary">' + (editing ? '수정' : '저장') + '</button>' +
        '</div>' +
      '</form>';

    L.ui.openModal({
      title: group ? '할부 지출 수정' : editing ? '지출 수정' : '지출 추가',
      html: html,
      onMount: function (dlg, close) {
        var form = dlg.querySelector('form');
        var meetup = form.elements.meetup;
        var note = form.querySelector('[data-suggest-note]');
        var selected = editing ? editing.categoryId : null;
        var userPicked = false;
        var pickedBeforeMeetup = null;
        var suggestion = null;
        var saving = false;

        function select(id) {
          selected = id;
          form.querySelectorAll('.chip').forEach(function (ch) {
            ch.setAttribute('aria-checked', String(ch.getAttribute('data-cat') === id));
          });
        }

        function refreshSuggestion() {
          var r = L.classifier.classify(form.place.value, L.store.getState());
          suggestion = r.categoryId;
          form.querySelectorAll('.chip').forEach(function (ch) {
            ch.classList.toggle('is-suggested', !!suggestion && r.source !== 'default' && ch.getAttribute('data-cat') === suggestion);
          });
          note.textContent = r.source === 'rule' ? '· 전에 고른 카테고리로 추천했어요'
            : r.source === 'keyword' ? '· "' + r.keyword + '" 보고 추천했어요' : '';
          if (!editing && !userPicked && !(meetup && meetup.checked)) select(suggestion);
        }

        form.place.addEventListener('input', refreshSuggestion);

        form.querySelector('.chips').addEventListener('click', function (e) {
          var ch = e.target.closest('.chip');
          if (!ch) return;
          var id = ch.getAttribute('data-cat');
          userPicked = true;
          select(id);
          if (meetup) meetup.checked = id === 'meetup';
        });

        if (meetup) {
          meetup.addEventListener('change', function () {
            if (meetup.checked) { pickedBeforeMeetup = selected; select('meetup'); }
            else select(pickedBeforeMeetup && pickedBeforeMeetup !== 'meetup' ? pickedBeforeMeetup : suggestion);
          });
        }

        // 할부: 신용카드일 때만 보이고, 회차별 금액·기간을 미리 보여 준다
        var instBox = form.querySelector('[data-installment]');
        var instHint = form.querySelector('[data-installment-hint]');
        function refreshInstallment() {
          var credit = form.payment.value === 'credit';
          instBox.hidden = !credit;
          var n = credit ? +form.months.value : 1;
          var total = U.parseAmount(form.amount.value);
          if (!credit || n < 2) { instHint.textContent = credit ? '결제한 날에 한 번에 기록해요.' : ''; return; }
          if (isNaN(total) || total < n || !U.isValidDateStr(form.date.value)) {
            instHint.textContent = '결제한 달부터 ' + n + '개월 동안 매달 나눠 기록해요.';
            return;
          }
          var parts = L.store.splitInstallment(total, n, form.date.value);
          var last = parts[parts.length - 1];
          instHint.textContent = U.formatMonth(U.monthKey(parts[0].date)) + '~' + U.formatMonth(U.monthKey(last.date)) +
            ' 매달 ' + U.formatWon(parts[1].amount) + (parts[0].amount !== parts[1].amount ? ' (첫 달 ' + U.formatWon(parts[0].amount) + ')' : '') + '씩 기록해요.';
        }
        ['payment', 'months', 'amount', 'date'].forEach(function (name) {
          form[name].addEventListener(name === 'amount' ? 'input' : 'change', refreshInstallment);
        });
        form.date.addEventListener('input', refreshInstallment);
        refreshInstallment();

        select(selected);
        refreshSuggestion();
        form.amount.focus();

        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          if (saving) return;
          var st = L.store.getState();
          var categoryId = selected || suggestion || 'etc';
          var input = {
            date: form.date.value,
            amount: form.amount.value,
            place: form.place.value,
            categoryId: categoryId,
            memo: form.memo.value,
            payment: form.payment.value || null
          };
          var months = input.payment === 'credit' ? +form.months.value : 1;
          var v = L.store.validateExpense(input);
          L.ui.showErrors(form, v.errors);
          if (!v.ok) return;

          // F-5.2 고액 지출 확인 (할부는 총액 기준)
          var large = st.settings.largeExpenseAmount;
          var prevAmount = editing ? (editing.installment ? editing.installment.total : editing.amount) : null;
          if (large && v.amount >= large && prevAmount !== v.amount) {
            saving = true;
            var ok = await L.ui.confirm(U.formatWon(v.amount) + (months > 1 ? '을 ' + months + '개월 할부로 결제하셨네요.' : '을 한 번에 쓰셨네요.') + '\n이대로 저장할까요?', { title: '고액 지출 확인', okText: '저장' });
            saving = false;
            if (!ok) return;
          }

          var beforeLevels = L.budget.levelsSnapshot(st, U.monthKey(input.date));
          var beforeDay = L.stats.sum(st.expenses, input.date, input.date);
          var isMeetup = meetup && meetup.checked;
          var shouldLearn = !isMeetup && (editing ? categoryId !== editing.categoryId : userPicked);

          var res = L.store.saveExpense(editing ? editing.id : null, input, months);
          if (!res.ok) { L.ui.showErrors(form, res.errors); return; }
          if (shouldLearn) L.store.learnPlace(v.place, categoryId);
          close();
          var instText = months > 1 ? ' (' + months + '개월 할부, 매달 ' + U.formatWon(res.expenses[1].amount) + ')' : '';
          L.ui.toast((editing ? '수정했어요' : '저장했어요 · ' + L.store.getCategory(categoryId).name + ' ' + U.formatWon(v.amount)) + instText, 'ok');
          notifyAfterSave(beforeLevels, beforeDay, input.date);
        });

        var del = form.querySelector('[data-delete]');
        if (del) {
          del.addEventListener('click', async function () {
            var msg = group
              ? editing.place + ' 할부 ' + group.length + '회(총 ' + U.formatWon(editing.installment.total) + ')를 모두 삭제할까요?'
              : editing.place + ' ' + U.formatWon(editing.amount) + ' 내역을 삭제할까요?' +
                (editing.recurringId ? '\n정기 납부로 기록된 내역이라, 삭제하면 해당 회차가 다시 납부 전 상태가 돼요.' : '');
            if (await L.ui.confirm(msg, { title: '삭제 확인', okText: '삭제', danger: true })) {
              L.store.deleteExpense(editing.id);
              close();
              L.ui.toast('삭제했어요');
            }
          });
        }
      }
    });
  }

  /** 정기 납부 완료 모달: 금액·날짜를 확인하고 지출로 기록 */
  function openPayForm(item, occ) {
    var html =
      '<form class="form" novalidate>' +
        '<p class="muted">' + U.escapeHtml(L.recurring.periodText(item, occ)) + ' · 납부일 ' + U.formatDateKo(occ.date) + '</p>' +
        '<label class="field field-amount"><span>실제 납부 금액</span>' +
          '<input type="text" name="amount" inputmode="numeric" autocomplete="off" value="' + item.amount.toLocaleString('ko-KR') + '"></label>' +
        '<p class="field-error" data-error-for="amount"></p>' +
        '<div class="field-row">' +
          '<label class="field"><span>납부한 날</span><input type="date" name="date" value="' + U.today() + '"></label>' +
          '<label class="field"><span>결제수단</span><select name="payment">' + L.ui.paymentOptions(null) + '</select></label>' +
        '</div>' +
        '<p class="field-error" data-error-for="date"></p>' +
        '<p class="field-error" data-error-for="period"></p>' +
        '<div class="modal-actions"><span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>취소</button>' +
          '<button type="submit" class="btn btn-primary">납부 완료</button>' +
        '</div>' +
      '</form>';
    L.ui.openModal({
      title: item.name + ' 납부 완료',
      html: html,
      onMount: function (dlg, close) {
        var form = dlg.querySelector('form');
        form.amount.focus();
        form.amount.select();
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var st = L.store.getState();
          var date = form.date.value;
          var beforeLevels = U.isValidDateStr(date) ? L.budget.levelsSnapshot(st, U.monthKey(date)) : null;
          var beforeDay = U.isValidDateStr(date) ? L.stats.sum(st.expenses, date, date) : 0;
          var res = L.store.payRecurring(item.id, occ.period, { amount: form.amount.value, date: date, payment: form.payment.value || null });
          if (!res.ok) { L.ui.showErrors(form, res.errors); return; }
          close();
          L.ui.toast('✅ ' + item.name + ' 납부 완료 · 지출에 ' + U.formatWon(res.expense.amount) + ' 기록했어요', 'ok');
          if (beforeLevels) notifyAfterSave(beforeLevels, beforeDay, date);
        });
      }
    });
  }

  L.forms = { openExpenseForm: openExpenseForm, openPayForm: openPayForm };
})(window.Ledger = window.Ledger || {});
