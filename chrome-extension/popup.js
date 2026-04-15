// N인플 키워드 분석 - Popup Settings
(function () {
  var optKeyword = document.getElementById('opt-keyword');
  var optRelated = document.getElementById('opt-related');
  var optCharWidget = document.getElementById('opt-charwidget');

  // 설정 로드
  chrome.storage.local.get(['ninflKeyword', 'ninflRelated', 'ninflCharWidget'], function (r) {
    optKeyword.checked = r.ninflKeyword !== false;
    optRelated.checked = r.ninflRelated !== false;
    optCharWidget.checked = r.ninflCharWidget !== false;
  });

  // 변경 저장
  optKeyword.addEventListener('change', function () {
    chrome.storage.local.set({ ninflKeyword: optKeyword.checked });
  });
  optRelated.addEventListener('change', function () {
    chrome.storage.local.set({ ninflRelated: optRelated.checked });
  });
  optCharWidget.addEventListener('change', function () {
    chrome.storage.local.set({ ninflCharWidget: optCharWidget.checked });
  });
})();
