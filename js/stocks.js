/* 주식: 시세 받기(PC 서버 경유 → Twelve Data API 키 → 직접 입력 가격 순), 평가금액·변동 계산
 * 시세 출처
 *  1) PC 서버: tests/serve.js 로 앱을 열면 같은 주소의 /api/quote 가 야후 파이낸스 시세를 대신 받아 준다.
 *     (한국 코스피·코스닥, 미국 주식 모두. 키 필요 없음)
 *  2) Twelve Data: 설정에 무료 API 키를 넣으면 브라우저가 직접 받는다. (무료 등급은 주로 미국 주식)
 *  3) 둘 다 안 되면 종목에 직접 입력한 현재가로 계산한다.
 * 시세를 받을 때는 종목 코드만 외부로 보낸다. 보유 수량·금액 같은 가계부 데이터는 보내지 않는다. */
(function (L) {
  'use strict';

  var U = L.utils;
  var MARKET_NAME = { KS: '코스피', KQ: '코스닥', US: '미국' };
  var serverAvailable = null; // null: 아직 모름, true/false: 확인됨 (페이지를 다시 열 때까지 유지)

  function key(st) { return st.market + ':' + st.code; }
  function currencyOf(st) { return st.market === 'US' ? 'USD' : 'KRW'; }
  function yahooSymbol(st) { return st.market === 'US' ? st.code.replace('.', '-') : st.code + '.' + st.market; }
  function twelveSymbol(st) { return st.market === 'US' ? st.code : st.code + ':KRX'; }

  /** 가격 표시: 원화는 정수, 달러는 소수 2자리 */
  function formatPrice(n, currency) {
    if (n == null || !isFinite(n)) return '-';
    if (currency === 'USD') return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Math.round(n).toLocaleString('ko-KR') + '원';
  }

  /** 등락 표시용 { dir:'up'|'down'|'flat', text:'▲ 1,200원 (+0.55%)' } — 한국 관례대로 상승 빨강, 하락 파랑 */
  function change(now, before, currency) {
    if (now == null || before == null || !before) return null;
    var diff = now - before;
    var pct = diff / before * 100;
    var dir = Math.abs(pct) < 0.005 ? 'flat' : diff > 0 ? 'up' : 'down';
    var sign = dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '';
    var amt = currency === 'USD'
      ? '$' + Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : Math.round(Math.abs(diff)).toLocaleString('ko-KR') + '원';
    return { dir: dir, diff: diff, pct: pct, text: (dir === 'flat' ? '변동 없음 ' : sign + amt + ' ') + '(' + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%)' };
  }

  /** 종목 하나의 계산 결과 */
  function valuate(st, state) {
    var q = state.market.quotes[key(st)] || null;
    var currency = currencyOf(st);
    var price = q ? q.price : st.manualPrice;
    var source = q ? q.source : st.manualPrice ? 'manual' : null;
    var value = price != null ? price * st.quantity : null;
    var cost = st.avgPrice != null ? st.avgPrice * st.quantity : null;
    return {
      stock: st,
      quote: q,
      name: st.name || (q && q.name) || st.code,
      currency: currency,
      price: price,
      source: source,
      value: value,
      cost: cost,
      profit: value != null && cost != null ? change(value, cost, currency) : null,
      day: q ? change(q.price, q.prevClose, currency) : null,
      month: q ? change(q.price, q.prevMonthClose, currency) : null,
      dayDiffValue: q && q.prevClose ? (q.price - q.prevClose) * st.quantity : null,
      monthDiffValue: q && q.prevMonthClose ? (q.price - q.prevMonthClose) * st.quantity : null
    };
  }

  /** 전체 합계 (원화 기준. 미국 주식은 환율로 바꾸고, 환율이 없으면 따로 표시) */
  function summary(state) {
    var rate = state.market.usdkrw ? state.market.usdkrw.rate : null;
    var rows = state.stocks.map(function (st) { return valuate(st, state); });
    var t = { value: 0, cost: 0, day: 0, dayBase: 0, month: 0, monthBase: 0, missingPrice: 0, missingFx: 0, hasCost: false };
    rows.forEach(function (r) {
      var k = r.currency === 'USD' ? rate : 1;
      if (!k) { t.missingFx++; return; }
      if (r.value == null) { t.missingPrice++; return; }
      t.value += r.value * k;
      if (r.cost != null) { t.cost += r.cost * k; t.hasCost = true; }
      if (r.dayDiffValue != null) { t.day += r.dayDiffValue * k; t.dayBase += (r.value - r.dayDiffValue) * k; }
      if (r.monthDiffValue != null) { t.month += r.monthDiffValue * k; t.monthBase += (r.value - r.monthDiffValue) * k; }
    });
    return {
      rows: rows,
      rate: rate,
      total: t,
      profit: t.hasCost ? change(t.value, t.cost, 'KRW') : null,
      day: t.dayBase ? change(t.dayBase + t.day, t.dayBase, 'KRW') : null,
      month: t.monthBase ? change(t.monthBase + t.month, t.monthBase, 'KRW') : null
    };
  }

  /* ---------- 일별 종가로 전일·지난달 말 종가 계산 (서버와 같은 규칙) ----------
   * bars: [{ date:'YYYY-MM-DD', close }] 오래된 순. 마지막 막대가 오늘(또는 가장 최근 거래일).
   * prevClose: 마지막 막대 바로 전 거래일 종가
   * prevMonthClose: 마지막 막대가 속한 달보다 앞선 달의 마지막 거래일 종가 */
  function closesFromBars(bars) {
    var list = bars.filter(function (b) { return b && b.close != null && isFinite(b.close); });
    if (!list.length) return null;
    var last = list[list.length - 1];
    var prev = list.length > 1 ? list[list.length - 2] : null;
    var mk = last.date.slice(0, 7);
    var monthPrev = null;
    for (var i = list.length - 1; i >= 0; i--) { if (list[i].date.slice(0, 7) < mk) { monthPrev = list[i]; break; } }
    return { price: last.close, prevClose: prev ? prev.close : null, prevMonthClose: monthPrev ? monthPrev.close : null, date: last.date };
  }

  /* ---------- 시세 받기 ---------- */

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('시간 초과')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function serverPossible() { return /^https?:$/.test(window.location.protocol) && serverAvailable !== false; }

  /** 1) PC 서버 경유 (야후 파이낸스) */
  function fetchFromServer(stocks) {
    var symbols = stocks.map(yahooSymbol);
    var hasUS = stocks.some(function (s) { return s.market === 'US'; });
    var url = 'api/quote?symbols=' + encodeURIComponent(symbols.join(',')) + (hasUS ? '&fx=USDKRW' : '');
    return withTimeout(fetch(url, { cache: 'no-store' }), 15000).then(function (res) {
      if (res.status === 404 || !/json/.test(res.headers.get('content-type') || '')) { serverAvailable = false; throw new Error('no-server'); }
      if (!res.ok) throw new Error('서버 오류 ' + res.status);
      serverAvailable = true;
      return res.json();
    }).then(function (data) {
      var quotes = {}, errors = {};
      stocks.forEach(function (st) {
        var q = data.quotes && data.quotes[yahooSymbol(st)];
        if (q && q.price > 0) quotes[key(st)] = Object.assign({}, q, { source: 'server' });
        else errors[key(st)] = (q && q.error) || '시세 없음';
      });
      return { quotes: quotes, errors: errors, usdkrw: data.fx && data.fx.USDKRW ? data.fx.USDKRW : null, source: 'server' };
    });
  }

  /** 2) Twelve Data (API 키) — 일봉 45개로 현재가·전일·지난달 말 종가 계산 */
  function fetchFromTwelve(stocks, apiKey) {
    var symbols = stocks.map(twelveSymbol);
    var hasUS = stocks.some(function (s) { return s.market === 'US'; });
    if (hasUS) symbols.push('USD/KRW');
    var url = 'https://api.twelvedata.com/time_series?interval=1day&outputsize=45&symbol=' + encodeURIComponent(symbols.join(',')) + '&apikey=' + encodeURIComponent(apiKey);
    return withTimeout(fetch(url, { cache: 'no-store' }), 15000).then(function (res) {
      if (!res.ok) throw new Error('Twelve Data 오류 ' + res.status);
      return res.json();
    }).then(function (data) {
      if (data && data.status === 'error') throw new Error(data.message || 'Twelve Data 오류');
      // 한 종목만 요청하면 묶지 않은 형태로 온다
      var bySymbol = symbols.length === 1 ? (function () { var o = {}; o[symbols[0]] = data; return o; })() : data;
      function parse(entry) {
        if (!entry || entry.status !== 'ok' || !Array.isArray(entry.values)) return null;
        var bars = entry.values.map(function (v) { return { date: String(v.datetime).slice(0, 10), close: Number(v.close) }; }).reverse();
        return closesFromBars(bars);
      }
      var quotes = {}, errors = {};
      var now = new Date().toISOString();
      stocks.forEach(function (st) {
        var entry = bySymbol[twelveSymbol(st)];
        var c = parse(entry);
        if (c) quotes[key(st)] = { price: c.price, prevClose: c.prevClose, prevMonthClose: c.prevMonthClose, currency: currencyOf(st), name: '', time: now, source: 'twelvedata' };
        else errors[key(st)] = entry && entry.message ? entry.message : '이 API 키로는 받을 수 없는 종목이에요';
      });
      var fx = hasUS ? parse(bySymbol['USD/KRW']) : null;
      return { quotes: quotes, errors: errors, usdkrw: fx ? { rate: fx.price, time: now } : null, source: 'twelvedata' };
    });
  }

  /**
   * 보유 종목 시세를 받아 저장한다.
   * @returns Promise<{ source:'server'|'twelvedata'|null, errors:{key:msg}, message?:string }>
   */
  function refresh(state, stocks) {
    var list = stocks || state.stocks;
    if (!list.length) return Promise.resolve({ source: null, errors: {} });
    var apiKey = state.settings.stockApiKey;
    function viaKey(prevErr) {
      if (!apiKey) return Promise.reject(prevErr || new Error('no-source'));
      return fetchFromTwelve(list, apiKey);
    }
    var p = serverPossible() ? fetchFromServer(list).catch(viaKey) : viaKey();
    return p.then(function (r) {
      if (!stocks) L.store.setMarket(r.quotes, r.usdkrw); // 미리보기(종목 확인)는 저장하지 않음
      return r;
    }).catch(function (e) {
      return { source: null, errors: {}, quotes: {}, message: e && e.message === 'no-source' ? null : e && e.message };
    });
  }

  /** 지금 쓸 수 있는 시세 출처 설명 */
  function sourceText(state) {
    if (serverPossible() && serverAvailable !== false) return 'PC 서버(야후 파이낸스)';
    if (state.settings.stockApiKey) return 'Twelve Data (API 키)';
    return null;
  }

  L.stocks = {
    MARKET_NAME: MARKET_NAME,
    key: key,
    currencyOf: currencyOf,
    yahooSymbol: yahooSymbol,
    formatPrice: formatPrice,
    change: change,
    valuate: valuate,
    summary: summary,
    closesFromBars: closesFromBars,
    refresh: refresh,
    sourceText: sourceText,
    _reset: function () { serverAvailable = null; } // 테스트용
  };
})(window.Ledger = window.Ledger || {});
