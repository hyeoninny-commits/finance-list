/* 사용처 → 카테고리 자동 분류 (화면과 분리된 순수 함수)
 * 순서: ① placeRules(사용자가 직접 고친 사용처) → ② 카테고리 키워드 포함 여부 → ③ 기타
 * 키워드가 여러 개 걸리면 가장 긴 키워드를 택한다. (예: '쿠팡이츠'는 '쿠팡'보다 길어서 음식) */
(function (L) {
  'use strict';

  var FALLBACK = 'etc';

  /** 비교용 정규화: 앞뒤 공백 제거, 연속 공백 하나로, 소문자 */
  function normalizePlace(place) {
    return String(place == null ? '' : place).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function hasCategory(state, id) {
    return state.categories.some(function (c) { return c.id === id; });
  }

  var ASCII_WORD = /^[a-z0-9]+$/;
  var ASCII_CHAR = /[a-z]/; // 숫자는 붙어 있어도 됨 (예: GYM24, CU24)

  /**
   * 사용처(key)에 키워드(nk)가 들어 있는지.
   * 영문·숫자 키워드(CU, KT, GYM 등)는 앞뒤가 다른 영문자와 붙어 있으면 인정하지 않는다.
   * 예: 'CU'는 'CU 강남점'에는 걸리지만 'Cuckoo'에는 걸리지 않는다.
   */
  function containsKeyword(key, nk) {
    if (!ASCII_WORD.test(nk)) return key.indexOf(nk) >= 0;
    var from = 0, i;
    while ((i = key.indexOf(nk, from)) >= 0) {
      var before = key.charAt(i - 1), after = key.charAt(i + nk.length);
      if (!ASCII_CHAR.test(before) && !ASCII_CHAR.test(after)) return true;
      from = i + 1;
    }
    return false;
  }

  /** 키워드만으로 분류 (학습 규칙 무시) */
  function classifyByKeyword(place, state) {
    var key = normalizePlace(place);
    if (!key) return { categoryId: null, source: null, keyword: null };
    var best = null;
    state.categories.forEach(function (c) {
      (c.keywords || []).forEach(function (k) {
        var nk = normalizePlace(k);
        if (nk && containsKeyword(key, nk) && (!best || nk.length > best.keyword.length)) {
          best = { categoryId: c.id, keyword: k };
        }
      });
    });
    if (best) return { categoryId: best.categoryId, source: 'keyword', keyword: best.keyword };
    return { categoryId: FALLBACK, source: 'default', keyword: null };
  }

  /**
   * 사용처를 분류한다.
   * @returns {{categoryId: string|null, source: 'rule'|'keyword'|'default'|null, keyword: string|null}}
   */
  function classify(place, state) {
    var key = normalizePlace(place);
    if (!key) return { categoryId: null, source: null, keyword: null };
    var rule = state.placeRules[key];
    if (rule && hasCategory(state, rule)) return { categoryId: rule, source: 'rule', keyword: null };
    return classifyByKeyword(place, state);
  }

  L.classifier = {
    FALLBACK: FALLBACK,
    normalizePlace: normalizePlace,
    classify: classify,
    classifyByKeyword: classifyByKeyword
  };
})(window.Ledger = window.Ledger || {});
