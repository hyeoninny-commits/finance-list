/* 주식: 보유 종목(직접 추가), 실시간 시세, 전일·지난달 말 대비 변동, 평가손익 */
(function (L) {
  'use strict';

  var U = L.utils;
  var S = null; // L.stocks (로드 순서 때문에 render 때 가져온다)
  var timer = null;
  var lastResult = null;   // 마지막 갱신 결과 { source, errors, message, at }
  var loading = false;

  function el() { return document.querySelector('#view[data-route="stocks"] .view-root'); }

  function dirClass(c) { return c ? 'chg chg-' + c.dir : 'chg'; }
  function chgHtml(c, label) {
    if (!c) return '<span class="chg muted">' + label + ' -</span>';
    return '<span class="' + dirClass(c) + '"><span class="chg-label">' + label + '</span> ' + U.escapeHtml(c.text) + '</span>';
  }

  function sourceBadge(r) {
    if (r.source === 'manual') return '<span class="badge">직접 입력 가격</span>';
    if (!r.source) return '<span class="badge badge-warn">가격 없음</span>';
    return '';
  }

  function timeText(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var kst = new Date(d.getTime() + 9 * 3600000);
    var date = kst.toISOString().slice(0, 10), hm = kst.toISOString().slice(11, 16);
    return (date === U.today() ? '' : U.formatDate(date) + ' ') + hm;
  }

  /* ---------- 종목 추가·수정 창 ---------- */
  function openStockForm(item) {
    var s = L.store.getState();
    var market = item ? item.market : 'KS';
    var html =
      '<form class="form" novalidate>' +
        '<div class="field-row">' +
          '<label class="field"><span>시장</span><select name="market">' +
            ['KS', 'KQ', 'US'].map(function (m) { return '<option value="' + m + '"' + (m === market ? ' selected' : '') + '>' + S.MARKET_NAME[m] + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="field"><span>종목 코드</span><input type="text" name="code" autocomplete="off" autocapitalize="characters" maxlength="10" value="' + U.escapeHtml(item ? item.code : '') + '" placeholder="예: 005930"></label>' +
        '</div>' +
        '<p class="field-error" data-error-for="market"></p>' +
        '<p class="field-error" data-error-for="code"></p>' +
        '<div class="stock-check"><button type="button" class="btn btn-small" data-check>시세 확인</button><span class="hint" data-check-result aria-live="polite"></span></div>' +
        '<label class="field"><span>이름 (비우면 시세에서 가져와요)</span><input type="text" name="name" maxlength="40" autocomplete="off" value="' + U.escapeHtml(item ? item.name : '') + '" placeholder="예: 삼성전자"></label>' +
        '<div class="field-row">' +
          '<label class="field"><span>보유 수량</span><input type="text" name="quantity" inputmode="decimal" autocomplete="off" value="' + (item ? item.quantity : '') + '" placeholder="예: 10"></label>' +
          '<label class="field"><span data-price-label>평균 매입가</span><input type="text" name="avgPrice" inputmode="decimal" autocomplete="off" value="' + (item && item.avgPrice != null ? item.avgPrice.toLocaleString(item.market === 'US' ? 'en-US' : 'ko-KR') : '') + '" placeholder="선택"></label>' +
        '</div>' +
        '<p class="field-error" data-error-for="quantity"></p>' +
        '<p class="field-error" data-error-for="avgPrice"></p>' +
        '<label class="field"><span>직접 입력 현재가 (시세를 못 받을 때 사용)</span><input type="text" name="manualPrice" inputmode="decimal" autocomplete="off" value="' + (item && item.manualPrice != null ? item.manualPrice.toLocaleString(item.market === 'US' ? 'en-US' : 'ko-KR') : '') + '" placeholder="선택"></label>' +
        '<p class="field-error" data-error-for="manualPrice"></p>' +
        '<label class="field"><span>메모 (선택)</span><input type="text" name="memo" maxlength="100" value="' + U.escapeHtml(item ? item.memo : '') + '"></label>' +
        '<div class="modal-actions"><span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>취소</button>' +
          '<button type="submit" class="btn btn-primary">' + (item ? '수정' : '추가') + '</button>' +
        '</div>' +
      '</form>';

    L.ui.openModal({
      title: item ? '종목 수정' : '종목 추가',
      html: html,
      onMount: function (dlg, close) {
        var form = dlg.querySelector('form');
        var result = form.querySelector('[data-check-result]');
        function syncMarket() {
          var us = form.market.value === 'US';
          form.code.placeholder = us ? '예: AAPL' : '예: 005930';
          form.code.inputMode = us ? 'text' : 'numeric';
          form.querySelector('[data-price-label]').textContent = '평균 매입가 (' + (us ? '달러' : '원') + ')';
        }
        form.market.addEventListener('change', syncMarket);
        syncMarket();

        form.querySelector('[data-check]').addEventListener('click', function () {
          var st = { market: form.market.value, code: form.code.value.trim().toUpperCase(), quantity: 1 };
          if (!st.code) { result.textContent = '종목 코드를 먼저 입력해 주세요.'; return; }
          result.textContent = '확인 중…';
          L.stocks.refresh(L.store.getState(), [st]).then(function (r) {
            var q = r.quotes && r.quotes[S.key(st)];
            if (q) {
              result.textContent = (q.name ? q.name + ' · ' : '') + '현재가 ' + S.formatPrice(q.price, S.currencyOf(st));
              if (!form.name.value.trim() && q.name) form.name.value = q.name;
            } else if (r.source) {
              result.textContent = '시세를 찾지 못했어요. 시장과 종목 코드를 확인해 주세요.';
            } else {
              result.textContent = '지금은 시세를 받을 수 없어요. (PC 서버로 열거나 설정에 API 키를 넣어 주세요)';
            }
          });
        });

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = {
            market: form.market.value, code: form.code.value, name: form.name.value, quantity: form.quantity.value,
            avgPrice: form.avgPrice.value, manualPrice: form.manualPrice.value, memo: form.memo.value
          };
          var res = item ? L.store.updateStock(item.id, input) : L.store.addStock(input);
          if (!res.ok) { L.ui.showErrors(form, res.errors); return; }
          close();
          L.ui.toast(item ? '종목을 수정했어요' : (res.item.name || res.item.code) + ' 종목을 추가했어요', 'ok');
          refreshNow();
        });
        form.code.focus();
      }
    });
  }

  /* ---------- 시세 갱신 ---------- */
  function refreshNow() {
    var s = L.store.getState();
    if (loading || !s.stocks.length) { paint(); return Promise.resolve(); }
    loading = true;
    paint();
    return L.stocks.refresh(s).then(function (r) {
      lastResult = Object.assign({ at: new Date().toISOString() }, r);
      loading = false;
      paint();
    });
  }

  /** 주식 화면이 열려 있고 브라우저 탭이 보일 때만 주기적으로 갱신 */
  var timerSec = null;
  function schedule() {
    clearInterval(timer);
    timer = null;
    var sec = timerSec = L.store.getState().settings.stockRefreshSec;
    if (!sec) return;
    timer = setInterval(function () {
      if (L.router.current() !== 'stocks') { clearInterval(timer); timer = null; return; }
      if (!document.hidden) refreshNow();
    }, sec * 1000);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && L.router && L.router.current() === 'stocks') refreshNow();
  });

  /* ---------- 화면 ---------- */
  function statusLine(s) {
    var src = L.stocks.sourceText(s);
    var sec = s.settings.stockRefreshSec;
    if (loading) return '<span class="spinner" aria-hidden="true"></span> 시세를 받는 중…';
    if (lastResult && lastResult.source) {
      var errs = Object.keys(lastResult.errors || {}).length;
      return '시세: ' + (lastResult.source === 'server' ? 'PC 서버(야후 파이낸스)' : 'Twelve Data') + ' · ' + timeText(lastResult.at) + ' 기준' +
        (sec ? ' · ' + (sec >= 60 ? sec / 60 + '분' : sec + '초') + '마다 자동 갱신' : '') +
        (errs ? ' · <span class="text-over">' + errs + '개 종목은 시세를 못 받았어요</span>' : '');
    }
    if (lastResult && lastResult.message) return '<span class="text-over">시세를 받지 못했어요 (' + U.escapeHtml(lastResult.message) + ')</span>. 마지막으로 받은 가격으로 보여 드려요.';
    if (!src) return '실시간 시세를 받을 수 없어요. 마지막으로 받은 가격이나 직접 입력한 가격으로 계산해요. <a href="#settings">설정에서 시세 받는 방법 보기</a>';
    return '시세: ' + src;
  }

  function summaryCard(sum) {
    var t = sum.total;
    return '<section class="card stock-summary" aria-label="보유 주식 합계">' +
      '<p class="hero-label">평가금액' + (sum.rate ? ' <small class="muted">· 환율 1달러 = ' + Math.round(sum.rate).toLocaleString('ko-KR') + '원</small>' : '') + '</p>' +
      '<p class="hero-value" id="stock-total">' + U.formatWon(t.value) + '</p>' +
      '<div class="stock-chgs">' +
        chgHtml(sum.day, '전일 대비') +
        chgHtml(sum.month, '지난달 말 대비') +
        (sum.profit ? chgHtml(sum.profit, '평가손익') : '') +
      '</div>' +
      (t.missingFx ? '<p class="hint">미국 주식 ' + t.missingFx + '개는 환율을 아직 못 받아서 합계에서 뺐어요.</p>' : '') +
      (t.missingPrice ? '<p class="hint">가격이 없는 종목 ' + t.missingPrice + '개는 합계에서 뺐어요. 종목을 눌러 현재가를 직접 넣을 수 있어요.</p>' : '') +
    '</section>';
  }

  function row(r) {
    var st = r.stock;
    var err = lastResult && lastResult.errors && lastResult.errors[S.key(st)];
    return '<li class="card stock-item">' +
      '<div class="stock-head">' +
        '<div class="stock-name"><strong>' + U.escapeHtml(r.name) + '</strong>' +
          '<small class="muted">' + S.MARKET_NAME[st.market] + ' · ' + U.escapeHtml(st.code) + '</small></div>' +
        '<div class="stock-price"><strong>' + S.formatPrice(r.price, r.currency) + '</strong>' + sourceBadge(r) + '</div>' +
      '</div>' +
      '<div class="stock-chgs">' + chgHtml(r.day, '전일 대비') + chgHtml(r.month, '지난달 말 대비') + '</div>' +
      '<dl class="stock-meta">' +
        '<div><dt>보유</dt><dd>' + st.quantity.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) + '주' +
          (st.avgPrice != null ? ' · 평균 ' + S.formatPrice(st.avgPrice, r.currency) : '') + '</dd></div>' +
        '<div><dt>평가금액</dt><dd>' + S.formatPrice(r.value, r.currency) + '</dd></div>' +
        (r.profit ? '<div><dt>평가손익</dt><dd class="' + dirClass(r.profit) + '">' + U.escapeHtml(r.profit.text) + '</dd></div>' : '') +
      '</dl>' +
      (err ? '<p class="hint text-over">시세를 못 받았어요: ' + U.escapeHtml(err) + (r.quote ? ' (마지막 가격 ' + timeText(r.quote.time) + ')' : '') + '</p>'
        : r.quote && r.quote.time ? '<p class="hint">' + timeText(r.quote.time) + ' 기준 가격</p>' : '') +
      (st.memo ? '<p class="muted">' + U.escapeHtml(st.memo) + '</p>' : '') +
      '<div class="rec-actions">' +
        '<button type="button" class="btn btn-small" data-edit="' + U.escapeHtml(st.id) + '">수정</button>' +
        '<button type="button" class="btn btn-small btn-danger-ghost" data-del="' + U.escapeHtml(st.id) + '">삭제</button>' +
      '</div>' +
    '</li>';
  }

  /** 시세가 바뀌었을 때 화면만 다시 그리기 (포커스 유지) */
  function paint() {
    var root = el();
    if (!root) return;
    L.ui.preserveFocus(root, function () { draw(root); });
  }

  function draw(root) {
    var s = L.store.getState();
    var sum = L.stocks.summary(s);
    root.innerHTML =
      '<div class="view-head"><h2 class="view-title">주식</h2>' +
        '<div class="button-row">' +
          (s.stocks.length ? '<button type="button" class="btn btn-small" data-refresh' + (loading ? ' disabled' : '') + '>지금 갱신</button>' : '') +
          '<button type="button" class="btn btn-primary btn-small" data-add>종목 추가</button>' +
        '</div></div>' +
      '<p class="view-sub" data-status aria-live="polite">' + (s.stocks.length ? statusLine(s) : '') + '</p>' +
      (s.stocks.length
        ? summaryCard(sum) + '<ul class="stock-list">' + sum.rows.map(row).join('') + '</ul>' +
          '<p class="hint">상승은 빨간색 ▲, 하락은 파란색 ▼로 표시해요. 시세는 거래소 사정에 따라 몇 분~15분 늦을 수 있어요.</p>'
        : '<div class="card"><div class="empty"><p>가지고 있는 주식을 추가하면 실시간 가격과<br>전일·지난달 말 대비 변동을 보여 드려요.</p>' +
            '<button type="button" class="btn btn-primary btn-small" data-add>첫 종목 추가</button></div></div>');
  }

  function render(root) {
    S = L.stocks;
    draw(root);
    root.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-add],[data-edit],[data-del],[data-refresh]');
      if (!b) return;
      if (b.hasAttribute('data-add')) { openStockForm(null); return; }
      if (b.hasAttribute('data-refresh')) { refreshNow(); return; }
      var id = b.getAttribute('data-edit') || b.getAttribute('data-del');
      var item = L.store.getState().stocks.find(function (x) { return x.id === id; });
      if (!item) return;
      if (b.hasAttribute('data-edit')) openStockForm(item);
      else if (await L.ui.confirm((item.name || item.code) + ' 종목을 삭제할까요?', { title: '삭제 확인', okText: '삭제', danger: true })) {
        L.store.deleteStock(item.id);
        L.ui.toast('삭제했어요');
      }
    });
    // 화면에 들어올 때 30초보다 오래된 시세면 새로 받고, 이후 설정한 주기로 갱신
    var stale = !lastResult || Date.now() - new Date(lastResult.at).getTime() > 30000;
    if (stale && !loading) refreshNow();
    if (!timer || timerSec !== L.store.getState().settings.stockRefreshSec) schedule();
  }

  L.views = L.views || {};
  L.views.stocks = { title: '주식', render: render, reschedule: schedule };
})(window.Ledger = window.Ledger || {});
