/* 설정: 경고 기준, 카테고리·키워드 관리, 학습된 사용처, 백업·복원, 초기화 */
(function (L) {
  'use strict';

  var U = L.utils;

  function openCategoryForm(cat) {
    var html =
      '<form class="form" novalidate>' +
        '<div class="field-row">' +
          '<label class="field field-emoji"><span>이모지</span><input type="text" name="emoji" maxlength="4" value="' + U.escapeHtml(cat ? cat.emoji : '🏷️') + '"></label>' +
          '<label class="field"><span>이름</span><input type="text" name="name" maxlength="12" value="' + U.escapeHtml(cat ? cat.name : '') + '"></label>' +
          '<label class="field field-color"><span>색상</span><input type="color" name="color" value="' + U.escapeHtml(cat ? cat.color : '#7C8DB5') + '"></label>' +
        '</div>' +
        '<p class="field-error" data-error-for="name"></p>' +
        '<label class="field"><span>키워드 (쉼표로 구분)</span>' +
          '<textarea name="keywords" rows="4" placeholder="예: 스타벅스, 카페, 커피">' + U.escapeHtml(cat ? cat.keywords.join(', ') : '') + '</textarea></label>' +
        '<p class="hint muted">사용처 이름에 키워드가 들어 있으면 이 카테고리로 추천해요. 여러 키워드가 걸리면 더 긴 키워드가 우선이에요.</p>' +
        '<div class="modal-actions"><span class="spacer"></span>' +
          '<button type="button" class="btn" data-close>취소</button>' +
          '<button type="submit" class="btn btn-primary">' + (cat ? '수정' : '추가') + '</button>' +
        '</div>' +
      '</form>';
    L.ui.openModal({
      title: cat ? '카테고리 수정' : '카테고리 추가',
      html: html,
      onMount: function (dlg, close) {
        var form = dlg.querySelector('form');
        form.name.focus();
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = {
            name: form.name.value, emoji: form.emoji.value, color: form.color.value,
            keywords: form.keywords.value.split(/[,\n]/)
          };
          var res = cat ? L.store.updateCategory(cat.id, input) : L.store.addCategory(input);
          if (!res.ok) { L.ui.showErrors(form, res.errors); return; }
          close();
          L.ui.toast(cat ? '카테고리를 수정했어요' : '카테고리를 추가했어요', 'ok');
        });
      }
    });
  }

  function exportJson() {
    var s = L.store.getState();
    var today = U.today();
    var data = JSON.parse(JSON.stringify(s));
    data.settings.lastBackupAt = today;
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '가계부-백업-' + today + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    L.store.markBackup(today);
    L.ui.toast('백업 파일을 내려받았어요', 'ok');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = async function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) {
        L.ui.toast('🚨 JSON 파일을 읽지 못했어요. 가계부 백업 파일인지 확인해 주세요.', 'over');
        return;
      }
      // 형식 검사 + 변환. 고칠 수 없는 항목은 빼고 몇 건인지 미리 알려 준다
      var prep = L.store.prepareBackup(data);
      if (prep.error) { L.ui.toast('🚨 ' + prep.error, 'over'); return; }
      var d = prep.dropped;
      var skipped = [];
      if (d.expenses) skipped.push('지출 ' + d.expenses + '건');
      if (d.recurring) skipped.push('정기 납부 ' + d.recurring + '건');
      if (d.categories) skipped.push('카테고리 ' + d.categories + '개');
      if (d.stocks) skipped.push('주식 ' + d.stocks + '개');
      var cur = L.store.getState();
      var ok = await L.ui.confirm(
        '현재 데이터(지출 ' + cur.expenses.length + '건)를 백업 파일의 데이터(지출 ' + prep.data.expenses.length + '건)로 바꿀까요?\n현재 데이터는 사라져요.' +
          (skipped.length ? '\n\n형식이 잘못된 ' + skipped.join(', ') + '은 빼고 가져와요.' : ''),
        { title: '백업 가져오기', okText: '가져오기', danger: true });
      if (!ok) return;
      try {
        L.store.replaceAll(prep.data);
        L.ui.toast('백업을 가져왔어요' + (skipped.length ? ' · ' + skipped.join(', ') + ' 제외' : ''), 'ok');
      } catch (e) {
        L.ui.toast('🚨 가져오지 못했어요: ' + e.message, 'over');
      }
    };
    reader.onerror = function () { L.ui.toast('🚨 파일을 읽지 못했어요.', 'over'); };
    reader.readAsText(file);
  }

  function render(el) {
    var s = L.store.getState();
    var st = s.settings;
    var rules = Object.keys(s.placeRules).sort();

    var theme = st.theme || 'system';
    el.innerHTML =
      '<h2 class="view-title">설정</h2>' +

      '<section class="card">' +
        '<div class="row-between"><h3 class="card-title" id="theme-label">화면 모드</h3>' +
          '<div class="segmented" role="group" aria-labelledby="theme-label">' +
            [['system', '시스템'], ['light', '라이트'], ['dark', '다크']].map(function (t) {
              return '<button type="button" data-theme-opt="' + t[0] + '" aria-pressed="' + (theme === t[0]) + '">' + t[1] + '</button>';
            }).join('') +
          '</div></div>' +
      '</section>' +

      '<form class="card" id="warn-form" novalidate>' +
        '<h3 class="card-title">경고 기준</h3>' +
        '<div class="field-row">' +
          '<label class="field"><span>예산 주의 기준 (%)</span><input type="number" name="warnPercent" min="1" max="99" value="' + st.warnPercent + '"></label>' +
          '<label class="field"><span>고액 지출 확인 (원)</span><input type="text" inputmode="numeric" name="largeExpenseAmount" value="' + (st.largeExpenseAmount ? st.largeExpenseAmount.toLocaleString('ko-KR') : '') + '" placeholder="비우면 확인 안 함"></label>' +
          '<label class="field"><span>하루 지출 한도 (원)</span><input type="text" inputmode="numeric" name="dailyLimit" value="' + (st.dailyLimit ? st.dailyLimit.toLocaleString('ko-KR') : '') + '" placeholder="비우면 사용 안 함"></label>' +
        '</div>' +
        '<p class="hint muted">예산의 기준 % 이상을 쓰면 주의, 100% 이상이면 초과 경고가 떠요. 고액 기준 이상을 한 번에 입력하면 저장 전에 한 번 더 확인해요.</p>' +
        '<p class="field-error" data-error-for="warnPercent"></p>' +
        '<p class="field-error" data-error-for="largeExpenseAmount"></p>' +
        '<p class="field-error" data-error-for="dailyLimit"></p>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">저장</button></div>' +
      '</form>' +

      '<form class="card" id="stock-form" novalidate>' +
        '<h3 class="card-title">주식 시세</h3>' +
        '<p class="hint">실시간 시세는 아래 둘 중 하나로 받아요. 둘 다 없으면 종목에 직접 입력한 가격으로 계산해요.<br>' +
          '① <strong>PC 서버로 열기</strong>: tests 폴더에서 <code>node serve.js</code> 실행 → 나오는 주소로 접속 (한국·미국 주식, 키 필요 없음)<br>' +
          '② <strong>Twelve Data API 키</strong>: twelvedata.com에서 무료 키를 받아 아래에 넣기 (무료 등급은 주로 미국 주식)<br>' +
          '시세를 받을 때는 종목 코드만 외부로 보내고, 보유 수량·금액은 보내지 않아요.</p>' +
        '<div class="field-row">' +
          '<label class="field"><span>Twelve Data API 키 (선택)</span><input type="password" name="stockApiKey" autocomplete="off" spellcheck="false" value="' + U.escapeHtml(st.stockApiKey || '') + '" placeholder="비우면 사용 안 함"></label>' +
          '<label class="field"><span>자동 갱신</span><select name="stockRefreshSec">' +
            L.storage.REFRESH_OPTIONS.map(function (sec) {
              return '<option value="' + sec + '"' + (st.stockRefreshSec === sec ? ' selected' : '') + '>' + (sec ? (sec / 60) + '분마다' : '끄기 (들어갈 때만)') + '</option>';
            }).join('') +
          '</select></label>' +
        '</div>' +
        '<p class="hint">API 키를 쓰면 무료 등급 한도(분당 8회) 때문에 5분 이상 간격을 권해요.</p>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">저장</button></div>' +
      '</form>' +

      '<section class="card">' +
        '<div class="row-between"><h3 class="card-title">카테고리 · 키워드</h3><button type="button" class="btn btn-small" data-cat-add>카테고리 추가</button></div>' +
        '<ul class="setting-list">' + s.categories.map(function (c) {
          return '<li class="setting-row">' +
            '<span class="cat-dot" style="background:' + U.escapeHtml(c.color) + '" aria-hidden="true"></span>' +
            '<span class="setting-main"><strong>' + U.escapeHtml(c.emoji + ' ' + c.name) + '</strong>' +
              '<small class="muted">' + (c.keywords.length ? U.escapeHtml(c.keywords.slice(0, 8).join(', ')) + (c.keywords.length > 8 ? ' 외 ' + (c.keywords.length - 8) + '개' : '') : '키워드 없음') + '</small></span>' +
            '<button type="button" class="btn btn-small" data-cat-edit="' + U.escapeHtml(c.id) + '">수정</button>' +
            (c.id === 'etc' ? '' : '<button type="button" class="btn btn-small btn-danger-ghost" data-cat-del="' + U.escapeHtml(c.id) + '">삭제</button>') +
          '</li>';
        }).join('') + '</ul>' +
      '</section>' +

      '<section class="card">' +
        '<h3 class="card-title">학습된 사용처 <small class="muted">' + rules.length + '개</small></h3>' +
        (rules.length
          ? '<ul class="setting-list">' + rules.map(function (k) {
              var c = L.store.getCategory(s.placeRules[k]);
              return '<li class="setting-row"><span class="setting-main"><strong>' + U.escapeHtml(k) + '</strong>' +
                '<small class="muted">→ ' + U.escapeHtml(c.emoji + ' ' + c.name) + '</small></span>' +
                '<button type="button" class="btn btn-small btn-danger-ghost" data-rule-del="' + U.escapeHtml(k) + '">삭제</button></li>';
            }).join('') + '</ul>'
          : '<p class="empty">지출을 입력할 때 추천과 다른 카테고리를 고르면 여기에 기억해 둬요.</p>') +
      '</section>' +

      '<section class="card">' +
        '<h3 class="card-title">데이터</h3>' +
        '<p class="muted">데이터는 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니 가끔 백업해 두세요.' +
          (st.lastBackupAt ? '<br>마지막 백업: ' + U.formatDate(st.lastBackupAt) : '<br>아직 백업한 적이 없어요.') + '</p>' +
        '<div class="button-row">' +
          '<button type="button" class="btn" data-export>💾 백업 내보내기 (JSON)</button>' +
          '<label class="btn" for="import-file">📂 백업 가져오기</label>' +
          '<input type="file" id="import-file" accept="application/json,.json" class="visually-hidden">' +
        '</div>' +
        '<hr class="divider">' +
        '<button type="button" class="btn btn-danger-ghost" data-reset>전체 데이터 초기화</button>' +
      '</section>';

    // 경고 기준 저장
    var wf = el.querySelector('#warn-form');
    wf.addEventListener('submit', function (e) {
      e.preventDefault();
      var errors = {};
      var pct = Number(wf.warnPercent.value);
      if (!Number.isInteger(pct) || pct < 1 || pct > 99) errors.warnPercent = '주의 기준은 1~99% 사이의 정수로 입력해 주세요.';
      function opt(name, label) {
        var raw = wf[name].value.trim();
        if (!raw) return null;
        var n = U.parseAmount(raw);
        if (isNaN(n)) { errors[name] = label + '은(는) 1원~' + U.formatWon(U.MAX_AMOUNT) + ' 사이의 정수로 입력하거나 비워 두세요.'; return null; }
        return n;
      }
      var large = opt('largeExpenseAmount', '고액 지출 기준');
      var daily = opt('dailyLimit', '하루 지출 한도');
      L.ui.showErrors(wf, errors);
      if (Object.keys(errors).length) return;
      L.store.updateSettings({ warnPercent: pct, largeExpenseAmount: large, dailyLimit: daily });
      L.ui.toast('경고 기준을 저장했어요', 'ok');
    });

    var sf = el.querySelector('#stock-form');
    sf.addEventListener('submit', function (e) {
      e.preventDefault();
      L.store.updateSettings({ stockApiKey: sf.stockApiKey.value.trim(), stockRefreshSec: Number(sf.stockRefreshSec.value) });
      L.ui.toast('주식 시세 설정을 저장했어요', 'ok');
    });

    el.querySelectorAll('[data-theme-opt]').forEach(function (b) {
      b.addEventListener('click', function () { L.store.updateSettings({ theme: b.getAttribute('data-theme-opt') }); });
    });
    el.querySelector('[data-cat-add]').addEventListener('click', function () { openCategoryForm(null); });
    el.querySelector('[data-export]').addEventListener('click', exportJson);
    el.querySelector('#import-file').addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (f) importJson(f);
    });

    el.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-cat-edit],[data-cat-del],[data-rule-del],[data-reset]');
      if (!b) return;
      var s2 = L.store.getState();
      if (b.hasAttribute('data-cat-edit')) {
        openCategoryForm(s2.categories.find(function (c) { return c.id === b.getAttribute('data-cat-edit'); }));
      } else if (b.hasAttribute('data-cat-del')) {
        var id = b.getAttribute('data-cat-del');
        var cat = L.store.getCategory(id);
        var count = s2.expenses.filter(function (x) { return x.categoryId === id; }).length;
        if (await L.ui.confirm(cat.name + ' 카테고리를 삭제할까요?' + (count ? '\n이 카테고리의 지출 ' + count + '건은 "기타"로 옮겨져요.' : ''), { title: '카테고리 삭제', okText: '삭제', danger: true })) {
          L.store.deleteCategory(id);
          L.ui.toast('삭제했어요' + (count ? ' · ' + count + '건을 기타로 옮겼어요' : ''));
        }
      } else if (b.hasAttribute('data-rule-del')) {
        L.store.deletePlaceRule(b.getAttribute('data-rule-del'));
      } else if (b.hasAttribute('data-reset')) {
        if (!(await L.ui.confirm('모든 지출, 예산, 정기 납부, 설정을 지울까요?', { title: '전체 초기화', okText: '다음', danger: true }))) return;
        if (!(await L.ui.confirm('정말 지울까요? 되돌릴 수 없어요.\n필요하면 먼저 백업을 내보내 주세요.', { title: '마지막 확인', okText: '모두 지우기', danger: true }))) return;
        L.store.resetAll();
        L.ui.toast('모든 데이터를 지웠어요');
      }
    });
  }

  L.views = L.views || {};
  L.views.settings = { title: '설정', render: render };
})(window.Ledger = window.Ledger || {});
