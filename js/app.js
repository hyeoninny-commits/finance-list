/* 앱 초기화 */
(function (L) {
  'use strict';

  function showAlert(msg) {
    var el = document.getElementById('app-alert');
    if (!el) return;
    el.textContent = '⚠️ ' + msg;
    el.hidden = false;
  }

  /** 설정의 테마(system/light/dark)를 <html data-theme>에 반영 */
  function applyTheme() {
    var theme = L.store.getState().settings.theme;
    var root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }

  function boot() {
    L.store.onError(showAlert);
    L.store.init();
    applyTheme();
    // 데이터가 바뀌면 지금 보고 있는 화면을 다시 그린다
    L.store.subscribe(function () { applyTheme(); L.router.render(); });
    // 어느 화면에서든 [data-add-expense] 버튼은 지출 추가 창을 연다
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-add-expense]')) { L.forms.openExpenseForm(); return; }
      // 앱 안의 화면 이동 링크(#home 등)는 직접 처리한다.
      // 아이폰 Safari(WebKit)에서 탭이 빠르게 이어질 때 링크의 기본 이동이 가끔 실행되지 않는 문제를 막는다.
      var a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var route = a.getAttribute('href').slice(1);
      if (L.router.ROUTES.indexOf(route) < 0) return; // '본문으로 건너뛰기' 같은 다른 링크는 그대로
      e.preventDefault();
      if (L.router.current() === route && window.location.hash === '#' + route) return;
      L.router.go(route);
    });
    L.router.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Ledger = window.Ledger || {});
