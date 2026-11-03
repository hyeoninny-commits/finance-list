/* URL 해시(#home, #list ...)로 화면을 전환한다. 새로고침해도 보던 탭이 유지된다. */
(function (L) {
  'use strict';

  var ROUTES = ['home', 'list', 'stats', 'budget', 'recurring', 'stocks', 'settings'];
  var DEFAULT_ROUTE = 'home';
  var current = null;

  function parseHash() {
    var name = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.indexOf(name) >= 0 ? name : null;
  }

  function render() {
    var name = parseHash();
    if (!name) {
      // 잘못되었거나 빈 해시는 홈으로 (히스토리를 쌓지 않음)
      window.history.replaceState(null, '', '#' + DEFAULT_ROUTE);
      name = DEFAULT_ROUTE;
    }
    var changed = name !== current;
    current = name;

    var container = document.getElementById('view');
    var view = L.views && L.views[name];
    function draw() {
      // 화면마다 새 요소를 만들어 렌더한다 (이전 화면의 이벤트 리스너가 쌓이지 않게)
      var root = document.createElement('div');
      // 전환 애니메이션은 탭이 바뀔 때만 (저장 후 다시 그릴 때는 생략)
      root.className = 'view-root' + (changed ? '' : ' no-anim');
      container.replaceChildren(root);
      container.dataset.route = name;
      if (view && typeof view.render === 'function') {
        try {
          view.render(root);
        } catch (e) {
          // 한 화면의 오류가 앱 전체를 비우지 않도록, 안내와 다른 화면으로 가는 길을 남긴다
          if (window.console) console.error(e);
          root.innerHTML = '<div class="card"><div class="empty">' +
            '<p>이 화면을 그리는 중 문제가 생겼어요. 저장된 데이터 일부가 손상되었을 수 있어요.</p>' +
            '<p class="muted">설정에서 백업을 내보낸 뒤, 문제가 계속되면 데이터를 초기화해 주세요.</p>' +
            (name === 'settings' ? '' : '<a class="btn btn-small" href="#settings">설정으로 가기</a>') +
            '</div></div>';
        }
      }
    }
    // 같은 화면을 다시 그릴 때는 키보드 포커스를 같은 버튼으로 되돌린다
    if (changed) draw();
    else L.ui.preserveFocus(container, draw);
    document.title = (view && view.title ? view.title + ' · ' : '') + '가계부';

    document.querySelectorAll('.tab').forEach(function (tab) {
      var active = tab.dataset.route === name;
      tab.classList.toggle('is-active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });

    if (changed) {
      window.scrollTo(0, 0);
      container.focus({ preventScroll: true });
    }
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  /** 화면 이동: 주소에 기록(뒤로 가기 지원)하고 바로 그린다. 뒤로/앞으로 가기는 hashchange로 처리된다. */
  function go(name) {
    if (window.location.hash === '#' + name) { render(); return; }
    try {
      window.history.pushState(null, '', '#' + name);
    } catch (e) {
      window.location.hash = '#' + name; // pushState를 못 쓰는 환경(일부 file:// 등)
      return;
    }
    render();
  }

  L.router = {
    ROUTES: ROUTES,
    start: start,
    render: render,
    go: go,
    current: function () { return current; }
  };
})(window.Ledger = window.Ledger || {});
