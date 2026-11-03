/* localStorage 저장/불러오기, 스키마 버전 관리, 기본 데이터 생성 */
(function (L) {
  'use strict';

  var STORAGE_KEY = 'household-ledger';
  var SCHEMA_VERSION = 3;
  var MAX_INSTALLMENT = 36; // 할부 최대 개월 수
  var REFRESH_OPTIONS = [0, 60, 300, 600]; // 주식 자동 갱신 주기(초). 0 = 끄기

  var DEFAULT_CATEGORIES = [
    { id: 'food', name: '음식', emoji: '🍚', color: '#E0703A',
      keywords: ['배달의민족', '배민', '쿠팡이츠', '요기요', '식당', '김밥', '치킨', '피자', '버거', '분식', '국밥', '롯데마트', '하나로마트', '노브랜드', '코스트코', '편의점', 'GS25', 'CU', '세븐일레븐', '이마트', '홈플러스', '반찬', '베이커리', '빵집', '파리바게뜨', '뚜레쥬르'] },
    { id: 'coffee', name: '커피', emoji: '☕', color: '#8B5E3C',
      keywords: ['스타벅스', '메가커피', '이디야', '투썸', '빽다방', '컴포즈', '폴바셋', '할리스', '커피빈', '블루보틀', '카페', '커피'] },
    { id: 'beauty', name: '뷰티', emoji: '💄', color: '#D9568A',
      keywords: ['올리브영', '시코르', '헤어', '미용실', '네일', '왁싱', '피부과', '에스테틱', '화장품', '아리따움', '이니스프리'] },
    { id: 'fitness', name: '운동', emoji: '🏃', color: '#2E9E6B',
      keywords: ['헬스', '필라테스', '요가', '피트니스', 'GYM', '수영', '클라이밍', '테니스', '골프', '크로스핏', '볼링'] },
    { id: 'meetup', name: '약속', emoji: '🥂', color: '#9B59B6',
      keywords: ['술집', '이자카야', '포차', '호프', '와인바', '칵테일바', '노래방', '모임', '회식'] },
    { id: 'transport', name: '교통', emoji: '🚌', color: '#3A7BD5',
      keywords: ['버스', '지하철', '택시', '카카오T', 'KTX', 'SRT', '코레일', '주유', '주차', '톨게이트', '티머니', '쏘카'] },
    { id: 'shopping', name: '쇼핑', emoji: '🛍️', color: '#E5A823',
      keywords: ['쿠팡', '무신사', '지그재그', '에이블리', '29CM', '네이버페이', '11번가', 'G마켓', '다이소', '백화점', '아울렛', '유니클로', '자라'] },
    { id: 'living', name: '생활', emoji: '🏠', color: '#5D8A8C',
      keywords: ['세탁', '이케아', '생활용품', '철물', '꽃집', '플라워', '택배', '우체국', '수선'] },
    { id: 'medical', name: '의료', emoji: '💊', color: '#E05656',
      keywords: ['병원', '의원', '약국', '치과', '한의원', '안과', '정형외과', '내과', '검진'] },
    { id: 'culture', name: '문화/여가', emoji: '🎬', color: '#4A5CC9',
      keywords: ['CGV', '메가박스', '롯데시네마', '영화', '넷플릭스', '유튜브', '멜론', '스포티파이', '티빙', '왓챠', '디즈니', '서점', '교보문고', '예스24', '전시', '공연', '여행', '호텔', '숙박'] },
    { id: 'utility', name: '공과금', emoji: '🧾', color: '#6B7280',
      keywords: ['관리비', '전기요금', '한국전력', '한전', '가스요금', '도시가스', '수도요금', '통신비', 'SKT', 'KT', 'LG유플러스', '인터넷', '월세', '보험'] },
    { id: 'saving', name: '저축', emoji: '🐷', color: '#14A3A3',
      keywords: ['적금', '예금', '저축', '청약', '투자', '펀드'] },
    { id: 'etc', name: '기타', emoji: '📦', color: '#9CA3AF', keywords: [] }
  ];

  var PAYMENT_METHODS = [
    { id: 'cash', name: '현금' },
    { id: 'debit', name: '체크카드' },
    { id: 'credit', name: '신용카드' },
    { id: 'kakaopay', name: '카카오페이' },
    { id: 'naverpay', name: '네이버페이' },
    { id: 'etc', name: '기타' }
  ];

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function createDefault() {
    return {
      schemaVersion: SCHEMA_VERSION,
      expenses: [],
      categories: clone(DEFAULT_CATEGORIES),
      placeRules: {},
      budgets: {},
      recurring: [],
      stocks: [],
      // 마지막으로 받은 시세 (화면을 열자마자 보여 주기 위한 캐시)
      market: { quotes: {}, usdkrw: null },
      settings: {
        warnPercent: 80,
        largeExpenseAmount: 100000,
        dailyLimit: null,
        weekStartsOn: 1,
        theme: 'system',
        lastBackupAt: null,
        stockApiKey: '',
        stockRefreshSec: 60
      }
    };
  }

  /* ---------- 항목 단위 검사·보정 ----------
   * 손으로 고친 백업, 오래된 데이터, 일부가 깨진 데이터를 만나도 화면이 멈추지 않도록
   * 고칠 수 있는 값은 기본값으로 고치고, 고칠 수 없는 항목(날짜·금액이 없는 지출 등)만 뺀다.
   * 이미 올바른 값은 건드리지 않고 알 수 없는 필드도 그대로 둔다 (백업 → 복원 시 데이터가 같아야 함). */

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function isStr(x) { return typeof x === 'string'; }
  function isDate(x) { return isStr(x) && L.utils.isValidDateStr(x); }
  // 저장된 금액은 예전 데이터를 잃지 않도록 안전한 정수 범위까지 인정한다 (새 입력은 10억 원 상한)
  function isAmount(n) { return Number.isSafeInteger(n) && n > 0; }
  function optAmount(n) { return isAmount(n) ? n : null; }
  function isPayment(id) { return PAYMENT_METHODS.some(function (p) { return p.id === id; }); }

  /** 정기 납부 주기가 올바른지 */
  function isValidCycle(c) {
    if (!isObj(c)) return false;
    function int(v, min, max) { return Number.isInteger(v) && v >= min && v <= max; }
    if (c.type === 'monthly') return int(c.day, 1, 31);
    if (c.type === 'weekly') return int(c.weekday, 0, 6);
    if (c.type === 'yearly') return int(c.month, 1, 12) && int(c.day, 1, L.utils.daysInMonth(2024, c.month));
    return false;
  }

  function fixExpense(e) {
    if (!isObj(e) || !isDate(e.date) || !isAmount(e.amount)) return null;
    var place = isStr(e.place) && e.place.trim() ? e.place : '(사용처 없음)';
    return Object.assign({}, e, {
      id: isStr(e.id) && e.id ? e.id : L.utils.uuid(),
      place: place,
      categoryId: isStr(e.categoryId) ? e.categoryId : 'etc',
      memo: isStr(e.memo) ? e.memo : '',
      payment: isPayment(e.payment) ? e.payment : null,
      recurringId: isStr(e.recurringId) ? e.recurringId : null,
      recurringPeriod: isStr(e.recurringPeriod) ? e.recurringPeriod : null,
      installment: fixInstallment(e.installment),
      createdAt: isStr(e.createdAt) ? e.createdAt : e.date + 'T00:00:00+09:00'
    });
  }

  /** 할부 정보: { groupId, index(1~count), count(2~36), total } — 형식이 틀리면 일반 지출로 본다 */
  function fixInstallment(i) {
    if (!isObj(i) || !isStr(i.groupId) || !i.groupId) return null;
    var count = i.count, index = i.index;
    if (!Number.isInteger(count) || count < 2 || count > MAX_INSTALLMENT) return null;
    if (!Number.isInteger(index) || index < 1 || index > count) return null;
    if (!isAmount(i.total)) return null;
    return { groupId: i.groupId, index: index, count: count, total: i.total };
  }

  var MARKETS = ['KS', 'KQ', 'US'];
  function isNum(n, min) { return typeof n === 'number' && isFinite(n) && n > (min == null ? 0 : min); }

  /** 보유 주식: { id, market('KS' 코스피 | 'KQ' 코스닥 | 'US' 미국), code, name, quantity, avgPrice, manualPrice, memo } */
  function fixStock(st) {
    if (!isObj(st) || MARKETS.indexOf(st.market) < 0 || !isStr(st.code) || !st.code.trim() || !isNum(st.quantity)) return null;
    return Object.assign({}, st, {
      id: isStr(st.id) && st.id ? st.id : L.utils.uuid(),
      code: st.code.trim().toUpperCase(),
      name: isStr(st.name) ? st.name : '',
      avgPrice: isNum(st.avgPrice) ? st.avgPrice : null,
      manualPrice: isNum(st.manualPrice) ? st.manualPrice : null,
      memo: isStr(st.memo) ? st.memo : ''
    });
  }

  function fixQuote(q) {
    if (!isObj(q) || !isNum(q.price)) return null;
    return {
      price: q.price,
      prevClose: isNum(q.prevClose) ? q.prevClose : null,
      prevMonthClose: isNum(q.prevMonthClose) ? q.prevMonthClose : null,
      currency: isStr(q.currency) ? q.currency : null,
      name: isStr(q.name) ? q.name : '',
      time: isStr(q.time) ? q.time : null,
      source: isStr(q.source) ? q.source : null
    };
  }

  function fixMarket(m) {
    var out = { quotes: {}, usdkrw: null };
    if (!isObj(m)) return out;
    if (isObj(m.quotes)) {
      Object.keys(m.quotes).forEach(function (k) { var q = fixQuote(m.quotes[k]); if (q) out.quotes[k] = q; });
    }
    if (isObj(m.usdkrw) && isNum(m.usdkrw.rate)) out.usdkrw = { rate: m.usdkrw.rate, time: isStr(m.usdkrw.time) ? m.usdkrw.time : null };
    return out;
  }

  function fixCategory(c) {
    if (!isObj(c) || !isStr(c.id) || !c.id) return null;
    return Object.assign({}, c, {
      name: isStr(c.name) && c.name.trim() ? c.name : c.id,
      emoji: isStr(c.emoji) && c.emoji ? c.emoji : '🏷️',
      color: isStr(c.color) && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#9CA3AF',
      keywords: Array.isArray(c.keywords) ? c.keywords.filter(function (k) { return isStr(k) && k.trim(); }) : []
    });
  }

  function fixRecurring(r) {
    if (!isObj(r) || !isStr(r.name) || !r.name.trim() || !isAmount(r.amount) || !isValidCycle(r.cycle)) return null;
    var remind = Number.isInteger(r.remindDaysBefore) && r.remindDaysBefore >= 0 && r.remindDaysBefore <= 30 ? r.remindDaysBefore : 3;
    var start = isDate(r.startDate) ? r.startDate
      : isStr(r.createdAt) && isDate(r.createdAt.slice(0, 10)) ? r.createdAt.slice(0, 10) : L.utils.today();
    return Object.assign({}, r, {
      id: isStr(r.id) && r.id ? r.id : L.utils.uuid(),
      categoryId: isStr(r.categoryId) ? r.categoryId : 'utility',
      remindDaysBefore: remind,
      startDate: start,
      paidPeriods: Array.isArray(r.paidPeriods) ? r.paidPeriods.filter(isStr) : [],
      memo: isStr(r.memo) ? r.memo : ''
    });
  }

  function fixBudgets(b) {
    var out = {};
    if (!isObj(b)) return out;
    Object.keys(b).forEach(function (mk) {
      var v = b[mk];
      if (!/^\d{4}-\d{2}$/.test(mk) || !isObj(v)) return;
      var byCategory = {};
      if (isObj(v.byCategory)) {
        Object.keys(v.byCategory).forEach(function (id) { if (isAmount(v.byCategory[id])) byCategory[id] = v.byCategory[id]; });
      }
      var total = optAmount(v.total);
      if (total || Object.keys(byCategory).length) out[mk] = { total: total, byCategory: byCategory };
    });
    return out;
  }

  function fixPlaceRules(p) {
    var out = {};
    if (!isObj(p)) return out;
    Object.keys(p).forEach(function (k) { if (k && isStr(p[k])) out[k] = p[k]; });
    return out;
  }

  function fixSettings(s, def) {
    var out = Object.assign({}, def, isObj(s) ? s : {});
    if (!(Number.isInteger(out.warnPercent) && out.warnPercent >= 1 && out.warnPercent <= 99)) out.warnPercent = def.warnPercent;
    out.largeExpenseAmount = out.largeExpenseAmount === null ? null : (optAmount(out.largeExpenseAmount) || def.largeExpenseAmount);
    out.dailyLimit = optAmount(out.dailyLimit);
    if (!(Number.isInteger(out.weekStartsOn) && out.weekStartsOn >= 0 && out.weekStartsOn <= 6)) out.weekStartsOn = def.weekStartsOn;
    if (['system', 'light', 'dark'].indexOf(out.theme) < 0) out.theme = 'system';
    if (!isDate(out.lastBackupAt)) out.lastBackupAt = null;
    out.stockApiKey = isStr(out.stockApiKey) ? out.stockApiKey.trim() : '';
    if (REFRESH_OPTIONS.indexOf(out.stockRefreshSec) < 0) out.stockRefreshSec = def.stockRefreshSec;
    return out;
  }

  /** 목록을 고치고, 뺀 항목 수를 report에 기록 */
  function fixList(list, fn, report, key) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      var fixed = fn(item);
      if (fixed && !seen[fixed.id]) { seen[fixed.id] = true; out.push(fixed); }
      else if (report) report[key] = (report[key] || 0) + 1;
    });
    return out;
  }

  /**
   * 빠지거나 잘못된 값을 고친다 (깨지거나 오래된 데이터 대비)
   * @param report 선택. { expenses, categories, recurring } 에 뺀 항목 수가 기록된다.
   */
  function normalize(data, report) {
    var def = createDefault();
    var categories = fixList(data.categories, fixCategory, report, 'categories');
    var out = {
      schemaVersion: SCHEMA_VERSION,
      expenses: fixList(data.expenses, fixExpense, report, 'expenses'),
      categories: categories.length ? categories : def.categories,
      placeRules: fixPlaceRules(data.placeRules),
      budgets: fixBudgets(data.budgets),
      recurring: fixList(data.recurring, fixRecurring, report, 'recurring'),
      stocks: fixList(data.stocks, fixStock, report, 'stocks'),
      market: fixMarket(data.market),
      settings: fixSettings(data.settings, def.settings)
    };
    dropBrokenInstallments(out.expenses);
    // '기타' 카테고리는 항상 있어야 한다 (분류 실패 시 기본값)
    if (!out.categories.some(function (c) { return c.id === 'etc'; })) {
      out.categories.push(clone(DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]));
    }
    return out;
  }

  /** 할부 묶음이 일부만 남아 있으면(회차 수가 맞지 않으면) 각 회차를 일반 지출로 돌린다 */
  function dropBrokenInstallments(expenses) {
    var groups = {};
    expenses.forEach(function (e) {
      if (!e.installment) return;
      var g = groups[e.installment.groupId] || (groups[e.installment.groupId] = []);
      g.push(e);
    });
    Object.keys(groups).forEach(function (id) {
      var g = groups[id], count = g[0].installment.count;
      var ok = g.length === count && g.every(function (e) { return e.installment.count === count; });
      if (!ok) g.forEach(function (e) { e.installment = null; });
    });
  }

  /** v1 → v2: 다른 단어 안에서 잘못 걸리던 짧은 기본 키워드를 구체적인 키워드로 바꾼다.
   * 사용자가 직접 넣은 키워드는 그대로 둔다. (예: '스마트폰'이 '마트'에 걸려 음식으로 분류되던 문제) */
  var KEYWORD_FIXES_V2 = {
    food: { '마트': ['롯데마트', '하나로마트', '노브랜드', '코스트코'], '빵': ['빵집', '파리바게뜨', '뚜레쥬르'] },
    living: { '꽃': ['꽃집', '플라워'] },
    utility: { '전기': ['전기요금', '한국전력', '한전'], '가스': ['가스요금', '도시가스'], '수도': ['수도요금'] }
  };

  function migrateKeywordsV2(data) {
    if (!Array.isArray(data.categories)) return;
    data.categories.forEach(function (c) {
      var fixes = isObj(c) && KEYWORD_FIXES_V2[c.id];
      if (!fixes || !Array.isArray(c.keywords)) return;
      var next = [];
      c.keywords.forEach(function (k) {
        (fixes[k] || [k]).forEach(function (n) { if (next.indexOf(n) < 0) next.push(n); });
      });
      c.keywords = next;
    });
  }

  /**
   * 이전 스키마 데이터를 현재 버전으로 변환한다. 버전이 올라가면 단계별 변환을 추가한다.
   * @param report 선택. normalize에서 뺀 항목 수를 기록
   */
  function migrate(data, report) {
    if (!isObj(data)) throw new Error('가계부 데이터 형식이 아니에요.');
    var v = Number(data.schemaVersion) || 0;
    if (v > SCHEMA_VERSION) {
      throw new Error('이 앱보다 새로운 버전에서 만든 데이터입니다 (v' + v + ').');
    }
    // v0(버전 정보 없음) → v1: 구조는 같다고 보고 normalize로 보정
    if (v < 2) migrateKeywordsV2(data);
    // v2 → v3: 할부(expense.installment), 주식(stocks, market), 주식 설정 추가 — normalize가 기본값을 채운다
    data.schemaVersion = SCHEMA_VERSION;
    return normalize(data, report);
  }

  /**
   * 데이터를 불러온다.
   * @returns {{data: object, error: string|null, isNew: boolean}}
   */
  function load() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return { data: createDefault(), error: '브라우저 저장소를 사용할 수 없어요. 시크릿 모드이거나 사이트 데이터가 차단되어 있으면 입력한 내용이 저장되지 않습니다.', isNew: true };
    }
    if (raw == null) return { data: createDefault(), error: null, isNew: true };
    try {
      var report = {};
      var data = migrate(JSON.parse(raw), report);
      var dropped = (report.expenses || 0) + (report.recurring || 0) + (report.categories || 0) + (report.stocks || 0);
      if (!dropped) return { data: data, error: null, isNew: false };
      // 일부 항목을 뺐으면 원본을 따로 보관하고 알린다
      try { window.localStorage.setItem(STORAGE_KEY + '-corrupted-' + Date.now(), raw); } catch (ignore) {}
      return { data: data, error: '저장된 데이터 중 형식이 잘못된 항목 ' + dropped + '건을 빼고 불러왔어요. 원본은 따로 보관해 두었어요.', isNew: false };
    } catch (e) {
      // 깨진 데이터는 덮어쓰기 전에 따로 보관해 둔다
      try { window.localStorage.setItem(STORAGE_KEY + '-corrupted-' + Date.now(), raw); } catch (ignore) {}
      return { data: createDefault(), error: '저장된 데이터를 읽지 못해 새로 시작합니다. 기존 데이터는 별도로 보관해 두었어요. (' + e.message + ')', isNew: true };
    }
  }

  /**
   * 데이터를 저장한다.
   * @returns {{ok: boolean, error: string|null}}
   */
  function save(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { ok: true, error: null };
    } catch (e) {
      var quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
      return {
        ok: false,
        error: quota
          ? '저장 공간이 가득 차서 저장하지 못했어요. 설정에서 데이터를 백업한 뒤 오래된 내역을 정리해 주세요.'
          : '저장하지 못했어요. 시크릿 모드에서는 데이터가 유지되지 않습니다.'
      };
    }
  }

  function clear() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (ignore) {}
  }

  L.storage = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    PAYMENT_METHODS: PAYMENT_METHODS,
    createDefault: createDefault,
    isValidCycle: isValidCycle,
    MAX_INSTALLMENT: MAX_INSTALLMENT,
    REFRESH_OPTIONS: REFRESH_OPTIONS,
    MARKETS: MARKETS,
    migrate: migrate,
    load: load,
    save: save,
    clear: clear
  };
})(window.Ledger = window.Ledger || {});
