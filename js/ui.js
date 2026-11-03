/* 공통 UI: 모달, 확인창, 토스트, 목록 행, 선택 옵션 */
(function (L) {
  'use strict';

  var U = L.utils;
  var modalSeq = 0;

  /**
   * 모달 열기. Esc·배경 클릭·[data-close] 버튼으로 닫힌다.
   * @param {{title:string, html:string, onMount?:function(dlg, close), onClose?:function, className?:string}} opts
   * @returns {function} close
   */
  function openModal(opts) {
    var id = 'modal-title-' + (++modalSeq);
    var dlg = document.createElement('dialog');
    dlg.className = 'modal' + (opts.className ? ' ' + opts.className : '');
    dlg.setAttribute('aria-labelledby', id);
    dlg.innerHTML =
      '<div class="modal-inner">' +
        '<header class="modal-header">' +
          '<h2 class="modal-title" id="' + id + '">' + U.escapeHtml(opts.title) + '</h2>' +
          '<button type="button" class="icon-btn" data-close aria-label="닫기">✕</button>' +
        '</header>' +
        '<div class="modal-body">' + opts.html + '</div>' +
      '</div>';
    document.body.appendChild(dlg);

    var opener = document.activeElement;
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      dlg.close();
      dlg.remove();
      // 저장으로 화면이 다시 그려져 원래 버튼이 사라졌으면 같은 id의 새 버튼으로 포커스를 돌린다
      var target = opener && document.contains(opener) ? opener : (opener && opener.id ? document.getElementById(opener.id) : null);
      if (target && typeof target.focus === 'function') target.focus();
      if (opts.onClose) opts.onClose();
    }
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) close();
    });
    dlg.showModal();
    if (opts.onMount) opts.onMount(dlg, close);
    return close;
  }

  /** 확인창 → Promise<boolean> */
  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ok = false;
      openModal({
        title: opts.title || '확인',
        className: 'modal-confirm',
        html:
          '<p class="confirm-message">' + U.escapeHtml(message) + '</p>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn" data-close>' + U.escapeHtml(opts.cancelText || '취소') + '</button>' +
            '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + U.escapeHtml(opts.okText || '확인') + '</button>' +
          '</div>',
        onMount: function (dlg, close) {
          var btn = dlg.querySelector('[data-ok]');
          btn.focus();
          btn.addEventListener('click', function () { ok = true; close(); });
        },
        onClose: function () { resolve(ok); }
      });
    });
  }

  /** 토스트 (몇 초 뒤 자동으로 사라짐) */
  function toast(message, level) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var t = document.createElement('div');
    t.className = 'toast toast-' + (level || 'info');
    t.textContent = message;
    region.appendChild(t);
    // 한꺼번에 너무 많이 쌓이지 않게 최근 3개만 보여 준다
    while (region.children.length > 3) region.firstElementChild.remove();
    setTimeout(function () { t.remove(); }, 4000);
  }

  /** 폼 필드 오류 표시: <p data-error-for="필드명"> 에 문구를 넣는다 */
  function showErrors(form, errors) {
    form.querySelectorAll('[data-error-for]').forEach(function (p) {
      var msg = errors[p.getAttribute('data-error-for')] || '';
      p.textContent = msg;
      var input = form.elements[p.getAttribute('data-error-for')];
      if (input && input.setAttribute) {
        if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      }
    });
    var firstKey = Object.keys(errors)[0];
    if (firstKey && form.elements[firstKey] && form.elements[firstKey].focus) form.elements[firstKey].focus();
  }

  function categoryOptions(selected, includeAll) {
    var s = L.store.getState();
    return (includeAll ? '<option value="">전체 카테고리</option>' : '') +
      s.categories.map(function (c) {
        return '<option value="' + U.escapeHtml(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' +
          U.escapeHtml(c.emoji + ' ' + c.name) + '</option>';
      }).join('');
  }

  function paymentOptions(selected, firstLabel) {
    return '<option value="">' + U.escapeHtml(firstLabel || '선택 안 함') + '</option>' +
      L.storage.PAYMENT_METHODS.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + p.name + '</option>';
      }).join('');
  }

  /** 지출 한 줄 (클릭하면 수정) */
  function expenseRow(x, opts) {
    opts = opts || {};
    var c = L.store.getCategory(x.categoryId);
    var meta = [];
    if (opts.showDate) meta.push(U.formatDate(x.date));
    meta.push(c.name);
    if (x.payment) meta.push(L.store.paymentName(x.payment));
    if (x.recurringId) meta.push('정기 납부');
    if (x.installment) meta.push('할부 ' + x.installment.index + '/' + x.installment.count);
    if (x.memo) meta.push(x.memo);
    return '<li>' +
      '<button type="button" class="expense-item" data-expense-id="' + U.escapeHtml(x.id) + '">' +
        '<span class="expense-emoji" style="--cat:' + U.escapeHtml(c.color) + '" aria-hidden="true">' + U.escapeHtml(c.emoji) + '</span>' +
        '<span class="expense-main"><strong>' + U.escapeHtml(x.place) + '</strong>' +
          '<small class="muted">' + U.escapeHtml(meta.join(' · ')) + '</small></span>' +
        '<span class="expense-amount">' + U.formatWon(x.amount) + '</span>' +
      '</button>' +
    '</li>';
  }

  /** 목록 안의 지출 행 클릭 → 수정 모달 */
  function bindExpenseClicks(container) {
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-expense-id]');
      if (!btn) return;
      var id = btn.getAttribute('data-expense-id');
      var exp = L.store.getState().expenses.find(function (x) { return x.id === id; });
      if (exp) L.forms.openExpenseForm({ expense: exp });
    });
  }

  function sortExpenses(list) {
    return list.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  /** 진행 막대 (상태 색 + 초과 표시) */
  function progressBar(item, label) {
    if (!item.limit) return '';
    var pct = Math.min(100, item.pct);
    var lv = item.level || 'ok';
    return '<div class="progress progress-' + lv + '" role="progressbar" aria-label="' + U.escapeHtml(label || '예산 사용률') + '" ' +
      'aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.floor(item.pct) + '">' +
      '<span class="progress-fill" style="width:' + pct.toFixed(1) + '%"></span></div>';
  }

  function levelBadge(level) {
    if (level === 'over') return '<span class="badge badge-over">🚨 초과</span>';
    if (level === 'warn') return '<span class="badge badge-warn">⚠️ 주의</span>';
    return '';
  }

  /** 떠 있는 지출 추가 버튼 (클릭은 app.js의 [data-add-expense] 공통 처리) */
  function fabHtml() {
    return '<button type="button" class="fab" id="fab-add" data-add-expense aria-label="지출 추가">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' +
      '<span class="fab-label" aria-hidden="true">지출 추가</span></button>';
  }

  /**
   * 차트 말풍선: [data-tip] 요소에 마우스를 올리거나 탭하면 금액을 보여 준다.
   * onFocus(el|null): 강조할 요소가 바뀔 때 호출 (도넛 가운데 글자 바꾸기 등)
   */
  function bindChartTips(container, onFocus) {
    var tip = document.getElementById('chart-tip');
    var current = null;
    function show(target, x, y) {
      if (current && current !== target) current.classList.remove('is-focus');
      current = target;
      target.classList.add('is-focus');
      var svg = target.closest('svg');
      if (svg) svg.classList.add('has-focus');
      tip.textContent = target.getAttribute('data-tip');
      tip.hidden = false;
      // 화면 가장자리(특히 휴대폰의 오른쪽 막대)에서도 말풍선이 잘리지 않게 위치를 화면 안으로 맞춘다
      var w = tip.offsetWidth, h = tip.offsetHeight, margin = 8;
      var vw = document.documentElement.clientWidth;
      x = Math.min(Math.max(x, w / 2 + margin), vw - w / 2 - margin);
      y = Math.max(y, h + 10 + margin);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      if (onFocus) onFocus(target);
    }
    function hide() {
      if (current) {
        current.classList.remove('is-focus');
        var svg = current.closest('svg');
        if (svg) svg.classList.remove('has-focus');
      }
      current = null;
      tip.hidden = true;
      if (onFocus) onFocus(null);
    }
    container.addEventListener('pointermove', function (e) {
      var t = e.target.closest('[data-tip]');
      if (t && container.contains(t)) show(t, e.clientX, e.clientY);
      else if (current && e.pointerType === 'mouse') hide();
    });
    container.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    container.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tip]');
      if (t) show(t, e.clientX, e.clientY);
      else hide();
    });
    // 키보드: 차트 요소에 포커스가 가면 말풍선 표시
    container.addEventListener('focusin', function (e) {
      var t = e.target.closest('[data-tip]');
      if (!t) return;
      var r = t.getBoundingClientRect();
      show(t, r.left + r.width / 2, r.top);
    });
    container.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { passive: true, once: true });
  }

  /* ---------- 다시 그릴 때 키보드 포커스 유지 ---------- */

  // 같은 역할의 버튼을 새로 그린 화면에서 다시 찾기 위한 속성 (앞에 있을수록 우선)
  var FOCUS_KEYS = ['data-type', 'data-shift', 'data-preset', 'data-theme-opt', 'data-this-month', 'data-today', 'data-copy',
    'data-expense-id', 'data-pay', 'data-edit', 'data-del', 'data-cat-edit', 'data-cat-del', 'data-rule-del', 'data-add', 'name'];

  function focusSelector(el) {
    if (!el || el === document.body) return null;
    if (el.id) return '#' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
    for (var i = 0; i < FOCUS_KEYS.length; i++) {
      var a = FOCUS_KEYS[i];
      if (el.hasAttribute(a)) {
        return el.tagName.toLowerCase() + '[' + a + '="' + String(el.getAttribute(a)).replace(/["\\]/g, '\\$&') + '"]';
      }
    }
    return null;
  }

  /**
   * scope 안을 다시 그리는 함수 fn을 실행하고, 그 전에 포커스가 있던 요소와 같은 요소로 포커스를 되돌린다.
   * 같은 요소가 사라졌으면(예: '오늘로' 버튼) 화면 영역(#view)에 포커스를 둔다. (body로 빠지지 않게)
   */
  function preserveFocus(scope, fn) {
    var active = document.activeElement;
    var had = scope && active && active !== scope && scope.contains(active);
    var sel = had ? focusSelector(active) : null;
    fn();
    if (!had || (document.activeElement && document.activeElement !== document.body && scope.contains(document.activeElement))) return;
    var target = null;
    try { target = sel ? scope.querySelector(sel) : null; } catch (e) { target = null; }
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    else {
      var view = document.getElementById('view');
      if (view) view.focus({ preventScroll: true });
    }
  }

  L.ui = {
    preserveFocus: preserveFocus,
    fabHtml: fabHtml,
    bindChartTips: bindChartTips,
    openModal: openModal,
    confirm: confirmDialog,
    toast: toast,
    showErrors: showErrors,
    categoryOptions: categoryOptions,
    paymentOptions: paymentOptions,
    expenseRow: expenseRow,
    bindExpenseClicks: bindExpenseClicks,
    sortExpenses: sortExpenses,
    progressBar: progressBar,
    levelBadge: levelBadge
  };
})(window.Ledger = window.Ledger || {});
