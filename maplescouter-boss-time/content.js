(() => {
  'use strict';

  // 사이트의 '적용중인 보스 시간'도 20분으로 설정해야 계산이 일치합니다.
  const BASE_MINUTES = 20;
  const ATTRIBUTE = 'data-ms-boss-minutes';
  const PERCENT = /^\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*%\s*$/;
  const SOLO_PATH = /^\/ko\/result\/?$/;
  const PARTY_PATH = /^\/ko\/multi-result\/?$/;
  const STORAGE_KEY = 'ms-boss-time-selected-basis';
  const CONTROL_ID = 'ms-boss-time-control';

  // 각 기준 배율에서 예상 클리어 시간이 정확히 20분이 되도록 계산합니다.
  // 예) 표시 배율 250% -> 100% 기준 8분, 130% 기준 10분 24초.
  const LEVELS = [
    { percent: 100, label: '최소컷' },
    { percent: 110, label: '기본컷' },
    { percent: 130, label: '메청년' },
    { percent: 150, label: '메린이' },
    { percent: 200, label: '메애기' }
  ];

  // 기본 100%, 다른 20분 기준을 선택 가능. 'all'이면 네 기준을 함께 표시.
  const availableBasis = new Set(LEVELS.map(level => String(level.percent)));
  availableBasis.add('all');
  let selectedBasis = '100';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (availableBasis.has(stored)) selectedBasis = stored;
  } catch (_) { /* 브라우저 저장소가 차단되어도 기본값 사용 */ }

  if (!document.getElementById('ms-boss-time-style')) {
    const style = document.createElement('style');
    style.id = 'ms-boss-time-style';
    style.textContent = `
      [${ATTRIBUTE}] {
        text-align: center;
      }
      #${CONTROL_ID} {
        position: fixed;
        right: 96px;
        bottom: 18px;
        z-index: 2147483640;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        color: #222;
        background: #fff;
        border: 1px solid #dadde2;
        border-radius: 10px;
        box-shadow: 0 3px 14px rgba(0, 0, 0, .15);
        font-family: system-ui, sans-serif;
        font-size: 12px;
        line-height: 1.3;
      }
      #${CONTROL_ID} select {
        min-width: 135px;
        max-width: 180px;
        padding: 5px;
        border: 1px solid #bbb;
        border-radius: 6px;
        background: #fff;
        color: #222;
        font: inherit;
      }
      [${ATTRIBUTE}]::after {
        content: attr(${ATTRIBUTE});
        display: block;
        white-space: pre-line;
        overflow-wrap: anywhere;
        margin-top: 3px;
        line-height: 1.55;
        font-size: 0.9em;
        font-weight: inherit;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isPercentLeaf(element) {
    return element.children.length === 0 && PERCENT.test(element.textContent);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '계산 불가';
    return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
  }

  function addTime(element, active) {
    const match = element.textContent.match(PERCENT);
    if (!match) return;

    // 사이트가 표시하는 현재 보스 배율(%).
    const bossPercent = Number(match[1].replace(/,/g, ''));

    // 핵심: 각 목표 배율 자체가 '20분 클리어' 기준입니다.
    // 예상 시간(초) = 20분 * 60초 * 목표 배율 / 현재 배율
    // 따라서 현재 배율 == 목표 배율이면 항상 20분입니다.
    const levelsToShow = selectedBasis === 'all'
      ? LEVELS
      : LEVELS.filter(({ percent }) => String(percent) === selectedBasis);
    const lines = levelsToShow.map(({ percent, label }) => {
      const totalSeconds = bossPercent > 0
        ? Math.round(BASE_MINUTES * 60 * percent / bossPercent)
        : NaN;
      return `${percent}% [${label}]\n(${formatTime(totalSeconds)})`;
    });

    active.add(element);
    const text = lines.join('\n');
    if (element.getAttribute(ATTRIBUTE) !== text) {
      element.setAttribute(ATTRIBUTE, text);
    }
  }

  // 일반 보스컷: 보스 카드에 표시된 배율을 찾습니다.
  function updateSolo(active) {
    for (const image of document.querySelectorAll('img[alt="boss"]')) {
      const button = image.closest('button');
      const card = button?.parentElement;
      if (!card) continue;

      for (const element of card.querySelectorAll('div')) {
        if (isPercentLeaf(element)) addTime(element, active);
      }
    }
  }

  // 파티 보스컷: '파티배율' 근처에 퍼센트가 하나 있는 구역만 처리합니다.
  function updateParty(active) {
    const labels = Array.from(document.querySelectorAll('body *')).filter(element =>
      element.children.length === 0 &&
      /^(파티\s*배율|Party\s*(?:Ratio|Multiplier))$/i.test(element.textContent.trim())
    );

    for (const label of labels) {
      let section = label.parentElement;
      for (let level = 0; section && level < 5; level++, section = section.parentElement) {
        const matches = Array.from(section.querySelectorAll('*')).filter(isPercentLeaf);
        if (matches.length === 1) {
          addTime(matches[0], active);
          break;
        }
        if (matches.length > 1) break;
      }
    }
  }

  // 페이지 우하단에 기준 배율 선택기를 표시합니다.
  function updateControl() {
    const supported = SOLO_PATH.test(location.pathname) || PARTY_PATH.test(location.pathname);
    let control = document.getElementById(CONTROL_ID);
    if (!supported) {
      control?.remove();
      return;
    }
    if (control) return;

    control = document.createElement('div');
    control.id = CONTROL_ID;
    const label = document.createElement('label');
    label.textContent = '20분 기준 배율';
    const select = document.createElement('select');
    select.value = 110;
    select.setAttribute('aria-label', '20분 기준 배율 선택');
    for (const { percent, label: name } of LEVELS) {
      const option = document.createElement('option');
      option.value = String(percent);
      option.textContent = `${percent}% · ${name}`;
      select.appendChild(option);
    }
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '전체 보기 (5가지)';
    select.appendChild(allOption);
    select.value = selectedBasis;
    select.addEventListener('change', () => {
      selectedBasis = select.value;
      try { localStorage.setItem(STORAGE_KEY, selectedBasis); } catch (_) {}
      update();
    });
    label.appendChild(select);
    control.appendChild(label);
    document.body.appendChild(control);
  }

  function update() {
    updateControl();
    const active = new Set();
    if (SOLO_PATH.test(location.pathname)) updateSolo(active);
    if (PARTY_PATH.test(location.pathname)) updateParty(active);

    for (const element of document.querySelectorAll(`[${ATTRIBUTE}]`)) {
      if (!active.has(element)) element.removeAttribute(ATTRIBUTE);
    }
  }

  let timer;
  function scheduleUpdate() {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      update();
    }, 100);
  }

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.addEventListener('popstate', scheduleUpdate);
  window.addEventListener('hashchange', scheduleUpdate);
  update();
})();
