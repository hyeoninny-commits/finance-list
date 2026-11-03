/* 앱 상태 보관. 변경 함수를 부르면 즉시 localStorage에 저장하고 구독자에게 알린다. */
(function (L) {
  'use strict';

  var U = L.utils;
  var state = null;
  var listeners = [];
  var errorListeners = [];

  function init() {
    var result = L.storage.load();
    state = result.data;
    if (result.isNew && !result.error) persist(); // 처음 실행 시 기본 데이터 저장
    if (result.error) emitError(result.error);
    return result;
  }

  function getState() { return state; }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function onError(fn) { errorListeners.push(fn); }

  function emitError(msg) {
    errorListeners.forEach(function (fn) { fn(msg); });
  }

  function persist() {
    var res = L.storage.save(state);
    if (!res.ok) emitError(res.error);
    return res.ok;
  }

  /** 상태를 바꾸는 공통 함수: mutator 실행 → 저장 → 알림 */
  /**
   * @param opts.silent true면 저장만 하고 화면을 다시 그리지 않는다
   *   (주식 시세 캐시처럼 자주 바뀌는 값 때문에 입력 중인 다른 화면이 초기화되지 않게)
   */
  function update(mutator, opts) {
    var result = mutator(state);
    var saved = persist();
    if (!(opts && opts.silent)) listeners.forEach(function (fn) { fn(state); });
    return { saved: saved, result: result };
  }

  function fail(errors) { return { ok: false, errors: errors }; }

  function toAmount(v) { return typeof v === 'number' ? v : U.parseAmount(v); }

  /** 새로 입력하는 금액: 1원 ~ 10억 원 정수 */
  function isPositiveInt(n) { return Number.isSafeInteger(n) && n > 0 && n <= U.MAX_AMOUNT; }

  function amountError(raw) {
    return U.isAmountTooLarge(raw)
      ? '금액은 ' + U.formatWon(U.MAX_AMOUNT) + '까지 입력할 수 있어요.'
      : '금액은 1원 이상의 정수로 입력해 주세요.';
  }

  function hasCategory(id) { return state.categories.some(function (c) { return c.id === id; }); }

  function isPayment(id) { return L.storage.PAYMENT_METHODS.some(function (p) { return p.id === id; }); }

  function getCategory(id) {
    return state.categories.find(function (c) { return c.id === id; }) ||
      state.categories.find(function (c) { return c.id === 'etc'; });
  }

  function paymentName(id) {
    var p = L.storage.PAYMENT_METHODS.find(function (x) { return x.id === id; });
    return p ? p.name : '';
  }

  /* ---------- 지출 ---------- */

  function validateExpense(input) {
    var errors = {};
    var amount = toAmount(input.amount);
    if (!isPositiveInt(amount)) errors.amount = amountError(input.amount);
    var place = String(input.place || '').trim();
    if (!place) errors.place = '사용처를 입력해 주세요.';
    else if (place.length > 50) errors.place = '사용처는 50자까지 입력할 수 있어요.';
    if (!U.isValidDateStr(input.date)) errors.date = '날짜를 확인해 주세요.';
    if (input.payment && !isPayment(input.payment)) errors.payment = '결제수단을 다시 선택해 주세요.';
    return { ok: Object.keys(errors).length === 0, errors: errors, amount: amount, place: place };
  }

  function buildExpense(input, v) {
    return {
      id: U.uuid(),
      date: input.date,
      amount: v.amount,
      place: v.place,
      categoryId: hasCategory(input.categoryId) ? input.categoryId : 'etc',
      memo: String(input.memo || '').trim(),
      payment: input.payment || null,
      recurringId: input.recurringId || null,
      recurringPeriod: input.recurringPeriod || null,
      installment: null,
      createdAt: U.nowIso()
    };
  }

  /* ---------- 할부 ---------- */

  /**
   * 할부 회차 나누기: 결제한 달부터 매달 같은 날(없으면 말일)에 기록.
   * 원 단위로 나누어떨어지지 않는 나머지는 1회차에 더한다. (예: 100,000원 3개월 → 33,334 / 33,333 / 33,333)
   */
  function splitInstallment(total, count, firstDate) {
    var base = Math.floor(total / count);
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push({ index: i + 1, date: U.addMonthsToDate(firstDate, i), amount: base + (i === 0 ? total - base * count : 0) });
    }
    return out;
  }

  function installmentGroup(groupId) {
    return state.expenses.filter(function (e) { return e.installment && e.installment.groupId === groupId; })
      .sort(function (a, b) { return a.installment.index - b.installment.index; });
  }

  /**
   * 지출 저장 (추가·수정 공통, 할부 포함)
   * @param editingId 수정할 지출 id (없으면 추가). 할부 회차를 수정하면 묶음 전체를 다시 만든다.
   * @param input { date(결제일), amount(총액), place, categoryId, memo, payment }
   * @param months 할부 개월 수 (1 = 일시불). 신용카드가 아니면 무시한다.
   * @returns {{ok, errors?, expenses?}}
   */
  function saveExpense(editingId, input, months) {
    var n = input.payment === 'credit' ? Number(months) || 1 : 1;
    var errors = {};
    if (!Number.isInteger(n) || n < 1 || n > L.storage.MAX_INSTALLMENT) errors.months = '할부는 2~' + L.storage.MAX_INSTALLMENT + '개월 중에서 골라 주세요.';
    var v = validateExpense(input);
    Object.assign(errors, v.errors);
    if (!errors.amount && n > 1 && v.amount < n) errors.amount = n + '개월 할부는 ' + U.formatWon(n) + ' 이상부터 나눌 수 있어요.';
    if (Object.keys(errors).length) return fail(errors);

    var editing = editingId ? state.expenses.find(function (e) { return e.id === editingId; }) : null;
    if (editingId && !editing) return fail({ id: '내역을 찾을 수 없어요.' });
    var oldGroup = editing && editing.installment ? editing.installment.groupId : null;

    // 할부가 아닌 지출을 그대로 수정: id·정기 납부 연결을 유지한다
    if (editing && !oldGroup && n === 1) return updateExpense(editingId, input);

    var groupId = oldGroup || U.uuid();
    var createdAt = editing ? editing.createdAt : U.nowIso();
    var built;
    if (n === 1) {
      built = [Object.assign(buildExpense(input, v), { createdAt: createdAt })];
    } else {
      built = splitInstallment(v.amount, n, input.date).map(function (part) {
        var e = buildExpense(Object.assign({}, input, { date: part.date }), { amount: part.amount, place: v.place });
        e.installment = { groupId: groupId, index: part.index, count: n, total: v.amount };
        e.createdAt = createdAt;
        return e;
      });
    }
    update(function (s) {
      if (editing) {
        s.expenses = s.expenses.filter(function (e) {
          return oldGroup ? !(e.installment && e.installment.groupId === oldGroup) : e.id !== editing.id;
        });
      }
      Array.prototype.push.apply(s.expenses, built);
    });
    return { ok: true, expenses: built };
  }

  function deleteInstallmentGroup(groupId) {
    var n = installmentGroup(groupId).length;
    update(function (s) {
      s.expenses = s.expenses.filter(function (e) { return !(e.installment && e.installment.groupId === groupId); });
    });
    return { ok: true, count: n };
  }

  function addExpense(input) {
    var v = validateExpense(input);
    if (!v.ok) return fail(v.errors);
    var expense = buildExpense(input, v);
    var r = update(function (s) { s.expenses.push(expense); });
    return { ok: true, saved: r.saved, expense: expense };
  }

  function updateExpense(id, patch) {
    var target = state.expenses.find(function (e) { return e.id === id; });
    if (!target) return fail({ id: '내역을 찾을 수 없어요.' });
    var merged = Object.assign({}, target, patch);
    var v = validateExpense(merged);
    if (!v.ok) return fail(v.errors);
    merged.amount = v.amount;
    merged.place = v.place;
    merged.memo = String(merged.memo || '').trim();
    merged.payment = merged.payment || null;
    if (!hasCategory(merged.categoryId)) merged.categoryId = 'etc';
    var r = update(function () { Object.assign(target, merged); });
    return { ok: true, saved: r.saved, expense: target };
  }

  /** 지출 삭제. 정기 납부로 기록된 지출이면 해당 회차를 다시 '미납부' 상태로 돌린다. */
  function deleteExpense(id) {
    var target = state.expenses.find(function (e) { return e.id === id; });
    if (!target) return { ok: false };
    if (target.installment) return deleteInstallmentGroup(target.installment.groupId); // 할부는 묶음 전체 삭제
    var r = update(function (s) {
      s.expenses = s.expenses.filter(function (e) { return e.id !== id; });
      if (target.recurringId && target.recurringPeriod) {
        var stillPaid = s.expenses.some(function (e) {
          return e.recurringId === target.recurringId && e.recurringPeriod === target.recurringPeriod;
        });
        var item = s.recurring.find(function (x) { return x.id === target.recurringId; });
        if (item && !stillPaid) {
          item.paidPeriods = item.paidPeriods.filter(function (p) { return p !== target.recurringPeriod; });
        }
      }
    });
    return { ok: true, saved: r.saved };
  }

  /* ---------- 자동 분류 학습 ---------- */

  /** 사용자가 고른 카테고리를 학습. 키워드 분류와 같으면 규칙을 지운다. */
  function learnPlace(place, categoryId) {
    var key = L.classifier.normalizePlace(place);
    if (!key) return;
    var byKeyword = L.classifier.classifyByKeyword(place, state).categoryId;
    var current = state.placeRules[key];
    if (categoryId === byKeyword) {
      if (current !== undefined) update(function (s) { delete s.placeRules[key]; });
    } else if (current !== categoryId) {
      update(function (s) { s.placeRules[key] = categoryId; });
    }
  }

  function deletePlaceRule(key) {
    update(function (s) { delete s.placeRules[key]; });
  }

  /* ---------- 예산 ---------- */

  /** budget: { total: number|null, byCategory: {id: number} } — 빈 값은 저장하지 않음 */
  function setBudget(mk, budget) {
    var byCategory = {};
    Object.keys(budget.byCategory || {}).forEach(function (id) {
      var n = budget.byCategory[id];
      if (isPositiveInt(n) && hasCategory(id)) byCategory[id] = n;
    });
    var total = isPositiveInt(budget.total) ? budget.total : null;
    update(function (s) {
      if (!total && !Object.keys(byCategory).length) delete s.budgets[mk];
      else s.budgets[mk] = { total: total, byCategory: byCategory };
    });
  }

  function copyBudget(fromMk, toMk) {
    var src = state.budgets[fromMk];
    if (!src) return false;
    update(function (s) { s.budgets[toMk] = JSON.parse(JSON.stringify(src)); });
    return true;
  }

  /* ---------- 정기 납부 ---------- */

  function validateRecurring(input) {
    var errors = {};
    var name = String(input.name || '').trim();
    if (!name) errors.name = '이름을 입력해 주세요.';
    var amount = toAmount(input.amount);
    if (!isPositiveInt(amount)) errors.amount = amountError(input.amount);
    var c = input.cycle || {};
    var cycle = null;
    if (c.type === 'monthly') {
      var md = +c.day;
      if (Number.isInteger(md) && md >= 1 && md <= 31) cycle = { type: 'monthly', day: md };
      else errors.cycle = '날짜는 1~31일 중에서 골라 주세요.';
    } else if (c.type === 'weekly') {
      var wd = +c.weekday;
      if (Number.isInteger(wd) && wd >= 0 && wd <= 6) cycle = { type: 'weekly', weekday: wd };
      else errors.cycle = '요일을 골라 주세요.';
    } else if (c.type === 'yearly') {
      var ym = +c.month, yd = +c.day;
      if (Number.isInteger(ym) && ym >= 1 && ym <= 12 && Number.isInteger(yd) && yd >= 1 && yd <= U.daysInMonth(2024, ym)) {
        cycle = { type: 'yearly', month: ym, day: yd };
      } else errors.cycle = '월과 날짜를 확인해 주세요.';
    } else {
      errors.cycle = '주기를 골라 주세요.';
    }
    // 빈칸은 0일로 바뀌지 않도록 따로 막는다 ('' → 0 변환 방지)
    var rawRemind = String(input.remindDaysBefore == null ? '' : input.remindDaysBefore).trim();
    var remind = rawRemind === '' ? NaN : Number(rawRemind);
    if (!Number.isInteger(remind) || remind < 0 || remind > 30) errors.remindDaysBefore = '며칠 전부터 알릴지 0~30 사이 숫자로 입력해 주세요.';
    if (!U.isValidDateStr(input.startDate)) errors.startDate = '시작일을 확인해 주세요.';
    return {
      ok: Object.keys(errors).length === 0,
      errors: errors,
      value: {
        name: name,
        amount: amount,
        categoryId: hasCategory(input.categoryId) ? input.categoryId : 'utility',
        cycle: cycle,
        remindDaysBefore: remind,
        startDate: input.startDate,
        memo: String(input.memo || '').trim()
      }
    };
  }

  function addRecurring(input) {
    var v = validateRecurring(input);
    if (!v.ok) return fail(v.errors);
    var item = Object.assign({ id: U.uuid(), paidPeriods: [], createdAt: U.nowIso() }, v.value);
    if (!hasCategory(item.categoryId)) item.categoryId = 'etc';
    update(function (s) { s.recurring.push(item); });
    return { ok: true, item: item };
  }

  function updateRecurring(id, input) {
    var item = state.recurring.find(function (x) { return x.id === id; });
    if (!item) return fail({ id: '항목을 찾을 수 없어요.' });
    var v = validateRecurring(input);
    if (!v.ok) return fail(v.errors);
    var cycleChanged = JSON.stringify(item.cycle) !== JSON.stringify(v.value.cycle);
    update(function () {
      Object.assign(item, v.value);
      if (!hasCategory(item.categoryId)) item.categoryId = 'etc';
      // 주기 종류가 바뀌면 회차 식별자 형식이 달라지므로 납부 기록을 다시 시작
      if (cycleChanged && item.paidPeriods.length && !samePeriodFormat(item.paidPeriods[0], item.cycle.type)) item.paidPeriods = [];
    });
    return { ok: true, item: item };
  }

  function samePeriodFormat(period, type) {
    if (type === 'monthly') return /^\d{4}-\d{2}$/.test(period);
    if (type === 'weekly') return /^\d{4}-W\d{2}$/.test(period);
    return /^\d{4}$/.test(period);
  }

  /** 정기 납부 항목 삭제 (이미 기록된 지출은 남겨 둔다) */
  function deleteRecurring(id) {
    update(function (s) { s.recurring = s.recurring.filter(function (x) { return x.id !== id; }); });
  }

  /** 납부 완료: 지출로 기록하고 회차를 납부 처리 */
  function payRecurring(id, period, input) {
    var item = state.recurring.find(function (x) { return x.id === id; });
    if (!item) return fail({ id: '항목을 찾을 수 없어요.' });
    if (item.paidPeriods.indexOf(period) >= 0) return fail({ period: '이미 납부 처리된 회차예요.' });
    var expInput = {
      date: input.date,
      amount: input.amount,
      place: item.name,
      categoryId: item.categoryId,
      memo: input.memo || '',
      payment: input.payment || null,
      recurringId: item.id,
      recurringPeriod: period
    };
    var v = validateExpense(expInput);
    if (!v.ok) return fail(v.errors);
    var expense = buildExpense(expInput, v);
    update(function (s) {
      s.expenses.push(expense);
      item.paidPeriods.push(period);
    });
    return { ok: true, expense: expense };
  }

  /* ---------- 카테고리 ---------- */

  function cleanKeywords(list) {
    var seen = {};
    return (list || []).map(function (k) { return String(k).trim(); })
      .filter(function (k) { if (!k || seen[k.toLowerCase()]) return false; seen[k.toLowerCase()] = true; return true; });
  }

  function validateCategory(input, selfId) {
    var errors = {};
    var name = String(input.name || '').trim();
    if (!name) errors.name = '이름을 입력해 주세요.';
    else if (state.categories.some(function (c) { return c.id !== selfId && c.name === name; })) errors.name = '같은 이름의 카테고리가 있어요.';
    var color = /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : '#9CA3AF';
    return {
      ok: !Object.keys(errors).length,
      errors: errors,
      value: { name: name, emoji: String(input.emoji || '').trim() || '🏷️', color: color, keywords: cleanKeywords(input.keywords) }
    };
  }

  function addCategory(input) {
    var v = validateCategory(input, null);
    if (!v.ok) return fail(v.errors);
    var cat = Object.assign({ id: 'c-' + U.uuid().slice(0, 8) }, v.value);
    update(function (s) {
      // '기타'는 항상 마지막에 둔다
      var idx = s.categories.findIndex(function (c) { return c.id === 'etc'; });
      if (idx >= 0) s.categories.splice(idx, 0, cat); else s.categories.push(cat);
    });
    return { ok: true, category: cat };
  }

  function updateCategory(id, input) {
    var cat = state.categories.find(function (c) { return c.id === id; });
    if (!cat) return fail({ id: '카테고리를 찾을 수 없어요.' });
    var v = validateCategory(input, id);
    if (!v.ok) return fail(v.errors);
    update(function () { Object.assign(cat, v.value); });
    return { ok: true, category: cat };
  }

  /** 카테고리 삭제: 지출·정기 납부는 '기타'로, 예산·학습 규칙은 정리 */
  function deleteCategory(id) {
    if (id === 'etc') return fail({ id: '기타 카테고리는 삭제할 수 없어요.' });
    var moved = 0;
    update(function (s) {
      s.categories = s.categories.filter(function (c) { return c.id !== id; });
      s.expenses.forEach(function (e) { if (e.categoryId === id) { e.categoryId = 'etc'; moved++; } });
      s.recurring.forEach(function (r) { if (r.categoryId === id) r.categoryId = 'etc'; });
      Object.keys(s.budgets).forEach(function (mk) {
        var b = s.budgets[mk];
        if (b && b.byCategory) delete b.byCategory[id];
      });
      Object.keys(s.placeRules).forEach(function (k) { if (s.placeRules[k] === id) delete s.placeRules[k]; });
    });
    return { ok: true, moved: moved };
  }

  /* ---------- 주식 ---------- */

  /** 종목 코드 형식: 한국 6자리(숫자, 일부 영문 포함), 미국 티커(영문으로 시작, 영문·숫자·점·하이픈 1~10자) */
  function isValidCode(market, code) {
    return market === 'US' ? /^[A-Z][A-Z0-9.\-]{0,9}$/.test(code) : /^[0-9A-Z]{6}$/.test(code);
  }

  function validateStock(input, selfId) {
    var errors = {};
    var market = input.market;
    if (L.storage.MARKETS.indexOf(market) < 0) errors.market = '시장을 골라 주세요.';
    var code = String(input.code || '').trim().toUpperCase();
    if (!code) errors.code = '종목 코드를 입력해 주세요.';
    else if (!errors.market && !isValidCode(market, code)) {
      errors.code = market === 'US' ? '미국 주식은 티커(예: AAPL)로 입력해 주세요.' : '한국 주식은 6자리 종목 코드(예: 005930)로 입력해 주세요.';
    } else if (state.stocks.some(function (x) { return x.id !== selfId && x.market === market && x.code === code; })) {
      errors.code = '이미 추가한 종목이에요. 수량은 기존 종목에서 수정해 주세요.';
    }
    var decimals = market === 'US' ? 2 : 0;
    var quantity = U.parseDecimal(input.quantity, 4);
    if (isNaN(quantity)) errors.quantity = '보유 수량을 0보다 큰 숫자로 입력해 주세요. (소수 4자리까지)';
    function optPrice(raw, key, label) {
      if (String(raw == null ? '' : raw).trim() === '') return null;
      var n = U.parseDecimal(raw, decimals);
      if (isNaN(n)) errors[key] = label + '는 0보다 큰 ' + (decimals ? '숫자(소수 2자리까지)' : '정수') + '로 입력하거나 비워 두세요.';
      return n;
    }
    var avgPrice = optPrice(input.avgPrice, 'avgPrice', '평균 매입가');
    var manualPrice = optPrice(input.manualPrice, 'manualPrice', '직접 입력 현재가');
    return {
      ok: !Object.keys(errors).length,
      errors: errors,
      value: {
        market: market, code: code, name: String(input.name || '').trim().slice(0, 40),
        quantity: quantity, avgPrice: avgPrice, manualPrice: manualPrice, memo: String(input.memo || '').trim().slice(0, 100)
      }
    };
  }

  function addStock(input) {
    var v = validateStock(input, null);
    if (!v.ok) return fail(v.errors);
    var item = Object.assign({ id: U.uuid(), createdAt: U.nowIso() }, v.value);
    update(function (s) { s.stocks.push(item); });
    return { ok: true, item: item };
  }

  function updateStock(id, input) {
    var item = state.stocks.find(function (x) { return x.id === id; });
    if (!item) return fail({ id: '종목을 찾을 수 없어요.' });
    var v = validateStock(input, id);
    if (!v.ok) return fail(v.errors);
    update(function () { Object.assign(item, v.value); });
    return { ok: true, item: item };
  }

  function deleteStock(id) {
    update(function (s) { s.stocks = s.stocks.filter(function (x) { return x.id !== id; }); });
  }

  /**
   * 받은 시세를 저장한다 (화면은 다시 그리지 않음 — 주식 화면이 직접 갱신).
   * @param quotes { 'KS:005930': quote, ... }
   * @param usdkrw { rate, time } | null
   */
  function setMarket(quotes, usdkrw) {
    update(function (s) {
      Object.keys(quotes || {}).forEach(function (k) { s.market.quotes[k] = quotes[k]; });
      if (usdkrw && usdkrw.rate > 0) s.market.usdkrw = usdkrw;
      // 더 이상 보유하지 않는 종목의 캐시는 정리
      var keep = {};
      s.stocks.forEach(function (x) { keep[x.market + ':' + x.code] = true; });
      Object.keys(s.market.quotes).forEach(function (k) { if (!keep[k]) delete s.market.quotes[k]; });
    }, { silent: true });
  }

  /* ---------- 설정·데이터 ---------- */

  function updateSettings(patch) {
    update(function (s) { Object.assign(s.settings, patch); });
  }

  function markBackup(date) {
    update(function (s) { s.settings.lastBackupAt = date; });
  }

  /** 마지막 백업(없으면 가장 오래된 지출) 후 30일이 지났는지 */
  function needsBackup(today) {
    if (!state.expenses.length) return false;
    var base = state.settings.lastBackupAt;
    if (!base) {
      base = state.expenses.reduce(function (min, e) {
        var d = String(e.createdAt || e.date).slice(0, 10);
        return d < min ? d : min;
      }, today);
    }
    return U.diffDays(base, today) >= 30;
  }

  /**
   * 가져온 데이터를 검사하고 현재 형식으로 변환한다. (상태는 바꾸지 않음)
   * 고칠 수 없는 항목은 빼고, 몇 건을 뺐는지 알려 준다.
   * @returns {{error: string|null, data?: object, dropped?: {expenses:number, recurring:number, categories:number}}}
   */
  function prepareBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: '가계부 백업 파일이 아니에요.' };
    if (!Array.isArray(raw.expenses) || !Array.isArray(raw.categories)) return { error: '가계부 백업 파일이 아니에요. (지출·카테고리 정보 없음)' };
    var report = {};
    try {
      var data = L.storage.migrate(JSON.parse(JSON.stringify(raw)), report);
      return { error: null, data: data, dropped: { expenses: report.expenses || 0, recurring: report.recurring || 0, categories: report.categories || 0, stocks: report.stocks || 0 } };
    } catch (e) {
      return { error: e.message };
    }
  }

  /** 예전 이름 호환: 오류 문구만 돌려준다 */
  function validateBackup(raw) { return prepareBackup(raw).error; }

  /** 전체 데이터 교체 (가져오기용). prepareBackup을 거친 데이터든 원본이든 다시 검사한다. */
  function replaceAll(data) {
    var next = L.storage.migrate(JSON.parse(JSON.stringify(data)));
    return update(function () { state = next; });
  }

  function resetAll() {
    return update(function () { state = L.storage.createDefault(); });
  }

  L.store = {
    init: init,
    getState: getState,
    subscribe: subscribe,
    onError: onError,
    update: update,
    getCategory: getCategory,
    paymentName: paymentName,
    validateExpense: validateExpense,
    addExpense: addExpense,
    saveExpense: saveExpense,
    splitInstallment: splitInstallment,
    installmentGroup: installmentGroup,
    deleteInstallmentGroup: deleteInstallmentGroup,
    validateStock: validateStock,
    addStock: addStock,
    updateStock: updateStock,
    deleteStock: deleteStock,
    setMarket: setMarket,
    updateExpense: updateExpense,
    deleteExpense: deleteExpense,
    learnPlace: learnPlace,
    deletePlaceRule: deletePlaceRule,
    setBudget: setBudget,
    copyBudget: copyBudget,
    validateRecurring: validateRecurring,
    addRecurring: addRecurring,
    updateRecurring: updateRecurring,
    deleteRecurring: deleteRecurring,
    payRecurring: payRecurring,
    addCategory: addCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,
    updateSettings: updateSettings,
    markBackup: markBackup,
    needsBackup: needsBackup,
    validateBackup: validateBackup,
    prepareBackup: prepareBackup,
    replaceAll: replaceAll,
    resetAll: resetAll
  };
})(window.Ledger = window.Ledger || {});
