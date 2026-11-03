/* 공통 유틸: 금액 포맷, 날짜 처리, id 생성
 * 날짜는 항상 한국 시간 기준 'YYYY-MM-DD' 문자열로 다룬다.
 * 계산은 UTC 자정 Date로 해서 시간대·서머타임 때문에 날짜가 밀리지 않게 한다. */
(function (L) {
  'use strict';

  var TIME_ZONE = 'Asia/Seoul';
  var dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  });

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 오늘 날짜(YYYY-MM-DD, 한국 시간). 앱 전체에서 '오늘'은 여기서만 가져온다. */
  function today() {
    return dateFormatter.format(new Date());
  }

  /** 'YYYY-MM-DD' → UTC 자정 Date */
  function parseDate(str) {
    var p = String(str).split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  /** UTC 자정 Date → 'YYYY-MM-DD' */
  function toDateStr(d) {
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function isValidDateStr(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    return toDateStr(parseDate(str)) === str;
  }

  function addDays(str, n) {
    var d = parseDate(str);
    d.setUTCDate(d.getUTCDate() + n);
    return toDateStr(d);
  }

  /** 두 날짜 사이 일수 (b - a) */
  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }

  /** 요일 0(일)~6(토) */
  function weekday(str) { return parseDate(str).getUTCDay(); }

  /** 주 시작일 (기본 월요일=1) */
  function startOfWeek(str, weekStartsOn) {
    var start = weekStartsOn == null ? 1 : weekStartsOn;
    var offset = (weekday(str) - start + 7) % 7;
    return addDays(str, -offset);
  }

  function daysInMonth(year, month /* 1~12 */) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /** 'YYYY-MM' */
  function monthKey(str) { return String(str).slice(0, 7); }

  function startOfMonth(str) { return monthKey(str) + '-01'; }

  function endOfMonth(str) {
    var y = +str.slice(0, 4), m = +str.slice(5, 7);
    return monthKey(str) + '-' + pad2(daysInMonth(y, m));
  }

  /** 'YYYY-MM' 기준 n개월 이동 */
  function addMonths(key, n) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad2(m + 1);
  }

  /** 12500 → '12,500원' */
  function formatWon(amount) {
    return Math.round(Number(amount) || 0).toLocaleString('ko-KR') + '원';
  }

  /** '2026-11-02' → '2026.11.02' */
  function formatDate(str) { return String(str).replace(/-/g, '.'); }

  var WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

  /** '2026-11-02' → '11월 2일 (월)' */
  function formatDateKo(str) {
    var d = parseDate(str);
    return (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일 (' + WEEKDAY_KO[d.getUTCDay()] + ')';
  }

  /** 한국 시간 ISO 문자열 (createdAt 용) */
  function nowIso() {
    var now = new Date();
    var kst = new Date(now.getTime() + 9 * 3600000);
    return kst.toISOString().slice(0, 19) + '+09:00';
  }

  /** ISO 주차 키 'YYYY-Www' (정기 납부 주간 회차 식별용) */
  function isoWeekKey(str) {
    var d = parseDate(str);
    var day = (d.getUTCDay() + 6) % 7; // 월=0
    d.setUTCDate(d.getUTCDate() - day + 3); // 그 주의 목요일
    var year = d.getUTCFullYear();
    var firstThursday = new Date(Date.UTC(year, 0, 4));
    firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
    var week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
    return year + '-W' + pad2(week);
  }

  /** '2026-11' → '2026년 11월' */
  function formatMonth(key) {
    return key.slice(0, 4) + '년 ' + (+key.slice(5, 7)) + '월';
  }

  /** '2026-11-02' → '11.2' */
  function formatShort(str) {
    var d = parseDate(str);
    return (d.getUTCMonth() + 1) + '.' + d.getUTCDate();
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /** HTML 이스케이프 (사용자 입력을 innerHTML에 넣을 때) */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 한 건(예산·한도 포함)에 입력할 수 있는 최대 금액: 10억 원.
   * 개인 가계부에서 이보다 큰 금액은 오타일 가능성이 높고, 합계 정밀도도 지킬 수 있다. */
  var MAX_AMOUNT = 1000000000;

  function amountDigits(input) {
    return String(input == null ? '' : input).replace(/[,\s원]/g, '');
  }

  /** '12,500' 같은 입력 → 12500. 1원~10억 원 정수가 아니면 NaN */
  function parseAmount(input) {
    var s = amountDigits(input);
    if (!/^\d+$/.test(s)) return NaN;
    var n = Number(s);
    return n > 0 && n <= MAX_AMOUNT ? n : NaN;
  }

  /** 'YYYY-MM-DD'를 n개월 뒤로. 그 달에 없는 날은 말일로 (예: 1월 31일 + 1개월 → 2월 28일) */
  function addMonthsToDate(str, n) {
    var mk = addMonths(monthKey(str), n);
    var y = +mk.slice(0, 4), m = +mk.slice(5, 7);
    return mk + '-' + pad2(Math.min(+str.slice(8, 10), daysInMonth(y, m)));
  }

  /** 소수 입력 ('1,234.5') → 1234.5. 양수가 아니거나 소수 자릿수가 넘치면 NaN */
  function parseDecimal(input, maxDecimals) {
    var s = String(input == null ? '' : input).replace(/[,\s원$]/g, '');
    var dec = maxDecimals == null ? 4 : maxDecimals;
    var re = dec > 0 ? new RegExp('^\\d+(\\.\\d{1,' + dec + '})?$') : /^\d+$/;
    if (!re.test(s)) return NaN;
    var n = Number(s);
    return n > 0 && n <= 1e12 ? n : NaN;
  }

  /** 숫자 형식은 맞지만 상한을 넘었는지 (오류 문구 구분용) */
  function isAmountTooLarge(input) {
    if (typeof input === 'number') return input > MAX_AMOUNT;
    var s = amountDigits(input);
    return /^\d+$/.test(s) && Number(s) > MAX_AMOUNT;
  }

  L.utils = {
    TIME_ZONE: TIME_ZONE,
    today: today,
    parseDate: parseDate,
    toDateStr: toDateStr,
    isValidDateStr: isValidDateStr,
    addDays: addDays,
    diffDays: diffDays,
    weekday: weekday,
    startOfWeek: startOfWeek,
    daysInMonth: daysInMonth,
    monthKey: monthKey,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    addMonths: addMonths,
    formatWon: formatWon,
    formatDate: formatDate,
    formatDateKo: formatDateKo,
    nowIso: nowIso,
    pad2: pad2,
    isoWeekKey: isoWeekKey,
    formatMonth: formatMonth,
    formatShort: formatShort,
    WEEKDAY_KO: WEEKDAY_KO,
    uuid: uuid,
    escapeHtml: escapeHtml,
    MAX_AMOUNT: MAX_AMOUNT,
    parseAmount: parseAmount,
    parseDecimal: parseDecimal,
    addMonthsToDate: addMonthsToDate,
    isAmountTooLarge: isAmountTooLarge
  };
})(window.Ledger = window.Ledger || {});
