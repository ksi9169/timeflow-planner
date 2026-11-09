/* ==========================================================================
   타임플로우 (TimeFlow) — 일정 · 루티너리 · 타임트래커 · 월간 분석 및 목표 설계
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'TIMEFLOW_APP_STATE_V1';
  const SUPABASE_URL = 'https://buwyexbkjtnubjjzjgxa.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_9UEw3qlP8N6mss-ECjYrSA_lVs33DzY';

  // -------------------- 날짜·시간 유틸리티 --------------------
  function toDateStr(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getTodayStr() {
    return toDateStr(new Date());
  }

  function addDaysStr(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return toDateStr(dt);
  }

  function getNowTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function timeToMinutes(tStr) {
    if (!tStr || !tStr.includes(':')) return 0;
    const [h, m] = tStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function minutesToTime(totalMin) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMin)));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function durationMinutes(startTime, endTime) {
    const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
    return diff > 0 ? diff : 30;
  }

  function formatDurationKo(mins) {
    const rounded = Math.round(mins);
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    if (h === 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  }

  function formatDateHeadingKo(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    return `${m}월 ${d}일 ${weekdays[dt.getDay()]}`;
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // -------------------- 초기 기본 상태 생성 --------------------
  function createInitialState() {
    const today = getTodayStr();
    const tomorrow = addDaysStr(today, 1);
    const yesterday = addDaysStr(today, -1);

    return {
      settings: {
        ttsEnabled: true,
        syncCode: '',
        streakDays: 3
      },
      categories: [
        { id: 'cat_work', name: '업무 · 프로젝트', color: '#4F46E5' },
        { id: 'cat_study', name: '자기계발 · 학습', color: '#0D9488' },
        { id: 'cat_health', name: '운동 · 건강', color: '#10B981' },
        { id: 'cat_routine', name: '생활 루틴', color: '#F59E0B' },
        { id: 'cat_rest', name: '휴식 · 충전', color: '#8B5CF6' },
        { id: 'cat_etc', name: '기타 · 여유', color: '#64748B' }
      ],
      schedules: [
        {
          id: 'sch_1',
          title: '모닝 루틴 및 하루 계획 점검',
          date: today,
          startTime: '07:00',
          endTime: '07:30',
          categoryId: 'cat_routine',
          alarm: true,
          important: false,
          completed: true
        },
        {
          id: 'sch_2',
          title: '핵심 프로젝트 기획안 집중 작성',
          date: today,
          startTime: '09:00',
          endTime: '11:00',
          categoryId: 'cat_work',
          alarm: true,
          important: true,
          completed: true
        },
        {
          id: 'sch_3',
          title: '자료 리서치 및 오후 미팅 준비',
          date: today,
          startTime: '14:00',
          endTime: '15:30',
          categoryId: 'cat_work',
          alarm: true,
          important: true,
          completed: false
        },
        {
          id: 'sch_4',
          title: '저녁 유산소 운동 및 스트레칭',
          date: today,
          startTime: '19:00',
          endTime: '20:00',
          categoryId: 'cat_health',
          alarm: true,
          important: false,
          completed: false
        },
        {
          id: 'sch_5',
          title: '독서 및 개인 공부 1시간',
          date: today,
          startTime: '21:00',
          endTime: '22:00',
          categoryId: 'cat_study',
          alarm: true,
          important: true,
          completed: false
        },
        {
          id: 'sch_6',
          title: '주간 업무 점검 회의',
          date: tomorrow,
          startTime: '10:00',
          endTime: '11:30',
          categoryId: 'cat_work',
          alarm: true,
          important: true,
          completed: false
        }
      ],
      actualLogs: [
        {
          id: 'act_1',
          title: '모닝 개운 루틴 완주',
          date: today,
          startTime: '07:00',
          endTime: '07:25',
          categoryId: 'cat_routine'
        },
        {
          id: 'act_2',
          title: '핵심 프로젝트 기획안 집중 작성',
          date: today,
          startTime: '09:00',
          endTime: '11:20',
          categoryId: 'cat_work'
        },
        {
          id: 'act_3',
          title: '점심 식사 및 산책 휴식',
          date: today,
          startTime: '12:00',
          endTime: '13:00',
          categoryId: 'cat_rest'
        },
        {
          id: 'act_y1',
          title: '업무 문서 정리 및 이메일 회신',
          date: yesterday,
          startTime: '09:30',
          endTime: '12:00',
          categoryId: 'cat_work'
        },
        {
          id: 'act_y2',
          title: '온라인 강의 수강 및 노트 정리',
          date: yesterday,
          startTime: '20:00',
          endTime: '21:30',
          categoryId: 'cat_study'
        }
      ],
      todos: [
        {
          id: 'todo_1',
          title: '이번 달 타임트래커 점검 및 예산 확인',
          dueDate: today,
          categoryId: 'cat_study',
          estimatedMinutes: 30,
          important: true,
          completed: false
        },
        {
          id: 'todo_2',
          title: '운동화 세탁 맡기기',
          dueDate: today,
          categoryId: 'cat_routine',
          estimatedMinutes: 20,
          important: false,
          completed: false
        },
        {
          id: 'todo_3',
          title: '다음 분기 읽을 책 리스트 정리',
          dueDate: '',
          categoryId: 'cat_study',
          estimatedMinutes: 30,
          important: false,
          completed: false
        },
        {
          id: 'todo_4',
          title: '책상 선정리 및 데스크 셋업 정돈',
          dueDate: '',
          categoryId: 'cat_etc',
          estimatedMinutes: 45,
          important: false,
          completed: false
        }
      ],
      routines: [
        {
          id: 'rtn_morning',
          name: '모닝 개운 루틴',
          categoryId: 'cat_routine',
          startTime: '07:00',
          alarm: true,
          completedDates: [yesterday],
          steps: [
            { id: 'st_1', title: '이불 정리 및 창문 열어 환기', minutes: 2, tip: '일어나자마자 이불을 펴면 다시 눕고 싶은 유혹이 사라집니다.' },
            { id: 'st_2', title: '미지근한 물 한 컵 천천히 마시기', minutes: 2, tip: '밤새 부족했던 수분을 채우고 신진대사를 깨웁니다.' },
            { id: 'st_3', title: '목 · 어깨 · 허리 가벼운 스트레칭', minutes: 6, tip: '굳어 있는 근육을 부드럽게 늘려주세요.' },
            { id: 'st_4', title: '오늘의 핵심 일정 3가지 확인', minutes: 5, tip: '타임플로우 대시보드에서 오늘 가장 중요한 일을 점검하세요.' }
          ]
        },
        {
          id: 'rtn_deepwork',
          name: '오전 딥워크 몰입 시동 루틴',
          categoryId: 'cat_work',
          startTime: '09:00',
          alarm: true,
          completedDates: [],
          steps: [
            { id: 'st_d1', title: '책상 위 불필요한 물건 치우기', minutes: 2, tip: '시야를 깔끔하게 비우면 집중력이 즉시 올라갑니다.' },
            { id: 'st_d2', title: '스마트폰 무음 및 멀리 두기', minutes: 1, tip: '방해 요소를 물리적으로 차단합니다.' },
            { id: 'st_d3', title: '지금 끝낼 핵심 과업 1개 정의', minutes: 3, tip: '이번 타이머 동안 어디까지 완성할지 한 줄로 정하세요.' },
            { id: 'st_d4', title: '초집중 딥워크 타이머 실행', minutes: 25, tip: '다른 창을 열지 않고 오직 한 가지 일에만 몰입합니다.' }
          ]
        },
        {
          id: 'rtn_night',
          name: '꿀잠 나이트 마감 루틴',
          categoryId: 'cat_rest',
          startTime: '22:30',
          alarm: true,
          completedDates: [],
          steps: [
            { id: 'st_n1', title: '오늘 타임트래커 빈칸 기록 마무리', minutes: 3, tip: '오늘 하루 실제로 사용한 시간을 가볍게 돌아봅니다.' },
            { id: 'st_n2', title: '내일 입을 옷과 가방 미리 챙기기', minutes: 5, tip: '내일 아침의 결정 피로를 덜어줍니다.' },
            { id: 'st_n3', title: '조명 낮추고 폼롤러 이완 스트레칭', minutes: 10, tip: '몸의 긴장을 풀고 수면 모드로 전환합니다.' }
          ]
        }
      ],
      reviewNotes: {
        keep: '오전 9시~11시 사이 핵심 업무 몰입도가 높고, 모닝 루틴을 실행한 날은 하루 계획 달성률이 눈에 띄게 좋았습니다.',
        problem: '오후 3시 이후 업무가 예상보다 길어지면서 저녁 자기계발 시간이 자주 밀리는 경향이 있었습니다.',
        tryAction: '오후 일정 사이에 30분 여유 버퍼를 두고, 저녁 9시에는 짧은 독서 루틴 타이머로 바로 시작하기'
      },
      timeBudgets: {
        cat_work: 80,
        cat_study: 35,
        cat_health: 20,
        cat_routine: 20,
        cat_rest: 30,
        cat_etc: 15
      },
      monthlyGoals: [
        { id: 'mg_1', title: '자기계발 및 직무 공부 월 35시간 달성하기', categoryId: 'cat_study', done: false },
        { id: 'mg_2', title: '주 3회 이상 저녁 유산소 · 스트레칭 실천', categoryId: 'cat_health', done: false },
        { id: 'mg_3', title: '모닝 개운 루틴 월 20회 이상 완주', categoryId: 'cat_routine', done: false }
      ]
    };
  }

  // -------------------- 전역 런타임 상태 --------------------
  let state = loadState();
  let selectedDate = getTodayStr();
  let miniCalCursor = new Date();
  let fullCalCursor = new Date();
  let currentCalView = 'month';
  let currentTodoFilter = 'today';
  let currentReportPeriod = 'thisMonth';

  // 실시간 타임트래커 스톱워치 상태
  let liveTracker = {
    running: false,
    title: '',
    categoryId: 'cat_work',
    startTimestamp: null,
    startTimeStr: '',
    elapsedSeconds: 0,
    intervalId: null
  };

  // 루티너리 플레이어 상태
  let routinePlayer = {
    activeRoutineId: null,
    running: false,
    paused: false,
    stepIndex: 0,
    stepTargetSeconds: 0,
    stepElapsedSeconds: 0,
    totalElapsedSeconds: 0,
    routineStartTimeStr: '',
    overtimeNotified: false,
    intervalId: null
  };

  // 알람 엔진 상태
  let triggeredAlarmKeys = new Set();
  let activeAlarmItem = null;
  let alarmRepeatIntervalId = null;
  let wakeLockSentinel = null;

  // -------------------- 저장소 입출력 --------------------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw);
      const fallback = createInitialState();
      return {
        ...fallback,
        ...parsed,
        settings: { ...fallback.settings, ...(parsed.settings || {}) },
        reviewNotes: { ...fallback.reviewNotes, ...(parsed.reviewNotes || {}) },
        timeBudgets: { ...fallback.timeBudgets, ...(parsed.timeBudgets || {}) }
      };
    } catch (_) {
      return createInitialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function getCategoryById(catId) {
    return state.categories.find(c => c.id === catId) || state.categories[0] || {
      id: 'cat_default',
      name: '기본',
      color: '#4F46E5'
    };
  }

  // -------------------- 사운드(Web Audio API) & 한국어 음성 안내(TTS) --------------------
  let audioCtx = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function playChimeSound(type = 'chime') {
    try {
      ensureAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const notes =
        type === 'fanfare'
          ? [523.25, 659.25, 783.99, 1046.5]
          : type === 'alarm'
          ? [587.33, 880, 587.33, 880]
          : [523.25, 659.25, 783.99];

      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);

        gain.gain.setValueAtTime(0.001, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.14 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.42);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.45);
      });
    } catch (_) {}
  }

  function speakKorean(text) {
    if (!state.settings.ttsEnabled) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      utter.rate = 1.03;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }

  function sendBrowserNotification(title, bodyText) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body: bodyText, icon: 'favicon.svg' });
      } catch (_) {}
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          try {
            new Notification(title, { body: bodyText, icon: 'favicon.svg' });
          } catch (_) {}
        }
      }).catch(() => {});
    }
  }

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
      } catch (_) {}
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
  }

  // -------------------- 토스트 메시지 --------------------
  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => {
      item.remove();
    }, 3400);
  }

  // -------------------- 자연어 빠른 입력 파서 --------------------
  function parseNaturalQuickInput(rawInput, modeOverride = 'auto', defaultCategoryId = '') {
    let text = String(rawInput || '').trim();
    if (!text) return null;

    let dateStr = selectedDate;
    if (/\b오늘\b/.test(text)) {
      dateStr = getTodayStr();
      text = text.replace(/\b오늘\b/g, '').trim();
    } else if (/\b내일\b/.test(text)) {
      dateStr = addDaysStr(getTodayStr(), 1);
      text = text.replace(/\b내일\b/g, '').trim();
    } else if (/\b모레\b/.test(text)) {
      dateStr = addDaysStr(getTodayStr(), 2);
      text = text.replace(/\b모레\b/g, '').trim();
    }

    let important = false;
    if (/!중요|!필수|★/.test(text)) {
      important = true;
      text = text.replace(/!중요|!필수|★/g, '').trim();
    }

    // 카테고리 태그 추출 (#업무 등)
    let categoryId = defaultCategoryId || (state.categories[0] && state.categories[0].id) || 'cat_work';
    const hashMatch = text.match(/#([^\s]+)/);
    if (hashMatch) {
      const keyword = hashMatch[1];
      const matchedCat = state.categories.find(c => c.name.includes(keyword));
      if (matchedCat) categoryId = matchedCat.id;
      text = text.replace(hashMatch[0], '').trim();
    } else {
      // 문맥 기반 카테고리 자동 추론
      if (/운동|헬스|러닝|산책|스트레칭|치과|병원|약/.test(text)) {
        const c = state.categories.find(x => x.id === 'cat_health' || x.name.includes('건강') || x.name.includes('운동'));
        if (c) categoryId = c.id;
      } else if (/공부|강의|독서|책|코딩|자격증|영어/.test(text)) {
        const c = state.categories.find(x => x.id === 'cat_study' || x.name.includes('학습') || x.name.includes('자기계발'));
        if (c) categoryId = c.id;
      } else if (/휴식|유튜브|게임|낮잠|산책|커피/.test(text)) {
        const c = state.categories.find(x => x.id === 'cat_rest' || x.name.includes('휴식'));
        if (c) categoryId = c.id;
      } else if (/루틴|기상|이불|취침/.test(text)) {
        const c = state.categories.find(x => x.id === 'cat_routine' || x.name.includes('루틴'));
        if (c) categoryId = c.id;
      }
    }

    // 시간 구간 파싱: 14:00~16:00 또는 오후 2시~4시 또는 14:00
    let startTime = '';
    let endTime = '';

    const rangeColon = text.match(/(\d{1,2}:\d{2})\s*[~\-]\s*(\d{1,2}:\d{2})/);
    if (rangeColon) {
      startTime = rangeColon[1].padStart(5, '0');
      endTime = rangeColon[2].padStart(5, '0');
      text = text.replace(rangeColon[0], '').trim();
    } else {
      const singleColon = text.match(/(\d{1,2}):(\d{2})/);
      if (singleColon) {
        const h = Number(singleColon[1]);
        const m = Number(singleColon[2]);
        startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        endTime = minutesToTime(h * 60 + m + 60);
        text = text.replace(singleColon[0], '').trim();
      } else {
        const korTime = text.match(/(오전|오후|저녁|밤)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
        if (korTime) {
          let h = Number(korTime[2]);
          const m = Number(korTime[3] || 0);
          const ampm = korTime[1] || '';
          if ((ampm === '오후' || ampm === '저녁' || ampm === '밤') && h < 12) h += 12;
          if (ampm === '오전' && h === 12) h = 0;
          startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          endTime = minutesToTime(h * 60 + m + 60);
          text = text.replace(korTime[0], '').trim();
        }
      }
    }

    // 소요 시간 표현 (2시간, 30분 등)
    const durHourMatch = text.match(/(\d+)\s*시간/);
    if (durHourMatch && startTime && !rangeColon) {
      const addMins = Number(durHourMatch[1]) * 60;
      endTime = minutesToTime(timeToMinutes(startTime) + addMins);
      text = text.replace(durHourMatch[0], '').trim();
    }

    // 모드 결정
    let resolvedType = modeOverride;
    if (resolvedType === 'auto') {
      if (/기록$|했어|했음|완료했어/.test(text)) {
        resolvedType = 'actual';
        text = text.replace(/기록$|했어|했음|완료했어/g, '').trim();
      } else if (startTime) {
        resolvedType = 'schedule';
      } else {
        resolvedType = 'todo';
      }
    }

    const cleanTitle = text || '새 항목';
    if (!startTime) {
      startTime = getNowTimeStr();
      endTime = minutesToTime(timeToMinutes(startTime) + 60);
    }

    return {
      type: resolvedType,
      title: cleanTitle,
      date: dateStr,
      startTime,
      endTime,
      categoryId,
      important
    };
  }

  // -------------------- 전체 UI 렌더링 오케스트레이터 --------------------
  function renderAll() {
    renderHeaderDate();
    renderCategorySelects();
    renderKPIs();
    renderMiniCalendar();
    renderTodoList();
    renderDualTimeline();
    renderDashboardRoutines();
    renderRoutinePlayerTab();
    renderCalendarOverviewTab();
    renderReportAndGoalsTab();
    updateTtsButtonUI();
  }

  function renderHeaderDate() {
    const el = document.getElementById('headerDateText');
    if (el) {
      el.textContent = `${formatDateHeadingKo(selectedDate)} · 계획과 실행을 한눈에`;
    }
    const tlTitle = document.getElementById('timelineDateTitle');
    if (tlTitle) {
      tlTitle.textContent = formatDateHeadingKo(selectedDate);
    }
  }

  function renderCategorySelects() {
    const selectIds = [
      'quickCategorySelect',
      'liveTrackerCategory',
      'itemModalCategory',
      'routineModalCategory',
      'newMonthlyGoalCategory'
    ];
    selectIds.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prevVal = sel.value;
      sel.innerHTML = state.categories
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join('');
      if (prevVal && state.categories.some(c => c.id === prevVal)) {
        sel.value = prevVal;
      }
    });

    const legendBar = document.getElementById('timelineCategoryLegend');
    if (legendBar) {
      legendBar.innerHTML = state.categories
        .map(
          c => `
          <span class="legend-chip">
            <span class="legend-color-box" style="background:${c.color}"></span>
            <span>${c.name}</span>
          </span>`
        )
        .join('');
    }
  }

  // -------------------- KPI 4종 렌더링 --------------------
  function renderKPIs() {
    const daySchedules = state.schedules.filter(s => s.date === selectedDate);
    const dayTodos = state.todos.filter(t => t.dueDate === selectedDate);
    const totalPlannedItems = daySchedules.length + dayTodos.length;
    const completedItems =
      daySchedules.filter(s => s.completed).length +
      dayTodos.filter(t => t.completed).length;

    const rate = totalPlannedItems > 0 ? Math.round((completedItems / totalPlannedItems) * 100) : 0;

    document.getElementById('kpiPlanRate').textContent = `${rate}%`;
    document.getElementById('kpiPlanDetail').textContent = `완료 ${completedItems} / 전체 ${totalPlannedItems}`;
    document.getElementById('kpiPlanBar').style.width = `${rate}%`;
    document.getElementById('kpiPlanBadge').textContent = rate >= 80 ? '순항 중' : rate >= 40 ? '진행 중' : '시작 단계';

    // 실제 기록 시간 vs 계획 시간
    const dayActuals = state.actualLogs.filter(a => a.date === selectedDate);
    const actualMins = dayActuals.reduce((acc, cur) => acc + durationMinutes(cur.startTime, cur.endTime), 0);
    const planMins = daySchedules.reduce((acc, cur) => acc + durationMinutes(cur.startTime, cur.endTime), 0);
    const actualRatio = planMins > 0 ? Math.min(100, Math.round((actualMins / planMins) * 100)) : (actualMins > 0 ? 100 : 0);

    document.getElementById('kpiActualHours').textContent = formatDurationKo(actualMins);
    document.getElementById('kpiActualVsPlan').textContent = `계획 ${formatDurationKo(planMins)}`;
    document.getElementById('kpiActualBar').style.width = `${actualRatio}%`;

    // 루틴 완료 현황
    const totalRoutines = state.routines.length;
    const doneRoutines = state.routines.filter(r => Array.isArray(r.completedDates) && r.completedDates.includes(selectedDate)).length;
    const routinePct = totalRoutines > 0 ? Math.round((doneRoutines / totalRoutines) * 100) : 0;
    document.getElementById('kpiRoutineCount').textContent = `${doneRoutines} / ${totalRoutines}`;
    document.getElementById('kpiRoutineBar').style.width = `${routinePct}%`;
    document.getElementById('kpiStreakBadge').textContent = `연속 ${state.settings.streakDays || 1}일`;
    const nextRoutine = state.routines.find(r => !r.completedDates?.includes(selectedDate));
    document.getElementById('kpiRoutineNext').textContent = nextRoutine ? `다음: ${nextRoutine.name}` : '오늘 루틴 모두 완주!';

    // 다음 예정 알람 계산
    const nowMins = timeToMinutes(getNowTimeStr());
    const upcomingAlarms = [
      ...daySchedules
        .filter(s => s.alarm && !s.completed && timeToMinutes(s.startTime) >= nowMins)
        .map(s => ({ time: s.startTime, title: s.title })),
      ...state.routines
        .filter(r => r.alarm && !r.completedDates?.includes(selectedDate) && timeToMinutes(r.startTime) >= nowMins)
        .map(r => ({ time: r.startTime, title: r.name }))
    ].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    if (upcomingAlarms.length > 0) {
      document.getElementById('kpiNextAlarmTime').textContent = upcomingAlarms[0].time;
      document.getElementById('kpiNextAlarmTitle').textContent = upcomingAlarms[0].title;
    } else {
      document.getElementById('kpiNextAlarmTime').textContent = '--:--';
      document.getElementById('kpiNextAlarmTitle').textContent = '오늘 남은 알람 없음';
    }
  }

  // -------------------- 미니 달력 렌더링 --------------------
  function renderMiniCalendar() {
    const year = miniCalCursor.getFullYear();
    const month = miniCalCursor.getMonth();
    document.getElementById('miniCalMonthTitle').textContent = `${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const todayStr = getTodayStr();

    const grid = document.getElementById('miniCalendarGrid');
    grid.innerHTML = '';

    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const dtStr = toDateStr(new Date(year, month - 1, d));
      cells.push({ day: d, dateStr: dtStr, otherMonth: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dtStr = toDateStr(new Date(year, month, d));
      cells.push({ day: d, dateStr: dtStr, otherMonth: false });
    }
    while (cells.length % 7 !== 0) {
      const nextD = cells.length - (firstDay + daysInMonth) + 1;
      const dtStr = toDateStr(new Date(year, month + 1, nextD));
      cells.push({ day: nextD, dateStr: dtStr, otherMonth: true });
    }

    cells.forEach(cell => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini-day';
      if (cell.otherMonth) btn.classList.add('other-month');
      if (cell.dateStr === todayStr) btn.classList.add('is-today');
      if (cell.dateStr === selectedDate) btn.classList.add('is-selected');

      const hasPlan = state.schedules.some(s => s.date === cell.dateStr);
      const hasActual = state.actualLogs.some(a => a.date === cell.dateStr);

      btn.innerHTML = `
        <span>${cell.day}</span>
        <div class="mini-day-dots">
          ${hasPlan ? '<span class="mini-dot" style="background:#4F46E5"></span>' : ''}
          ${hasActual ? '<span class="mini-dot" style="background:#0D9488"></span>' : ''}
        </div>
      `;
      btn.addEventListener('click', () => {
        selectedDate = cell.dateStr;
        renderAll();
      });
      grid.appendChild(btn);
    });
  }

  // -------------------- 할 일 및 백로그 목록 렌더링 --------------------
  function renderTodoList() {
    const container = document.getElementById('todoListContainer');
    if (!container) return;

    let filtered = [];
    if (currentTodoFilter === 'today') {
      filtered = state.todos.filter(t => !t.completed && (t.dueDate === selectedDate || !t.dueDate));
    } else if (currentTodoFilter === 'backlog') {
      filtered = state.todos.filter(t => !t.completed && !t.dueDate);
    } else {
      filtered = state.todos.filter(t => t.completed);
    }

    if (filtered.length === 0) {
      container.innerHTML = `<p class="empty-guide">표시할 할 일 항목이 없습니다.</p>`;
      return;
    }

    container.innerHTML = '';
    filtered.forEach(todo => {
      const cat = getCategoryById(todo.categoryId);
      const card = document.createElement('div');
      card.className = `todo-item-card ${todo.completed ? 'completed' : ''}`;
      card.innerHTML = `
        <div class="todo-left">
          <input type="checkbox" class="todo-check" ${todo.completed ? 'checked' : ''} aria-label="완료 체크" />
          <div class="todo-meta-col">
            <div class="todo-title-row">
              ${todo.important ? '<span class="important-star" title="중요 항목">★</span>' : ''}
              <span class="todo-title-text">${escapeHtml(todo.title)}</span>
            </div>
            <div class="todo-sub-info">
              <span class="cat-dot-tag" style="background:${cat.color}20;color:${cat.color}">${escapeHtml(cat.name)}</span>
              <span>${todo.dueDate ? `마감: ${todo.dueDate}` : '날짜 미정 보관함'}</span>
            </div>
          </div>
        </div>
        <div class="todo-actions">
          <button type="button" class="btn-xs btn-teal todo-start-btn" title="이 할 일의 실시간 타임트래커 측정을 바로 시작합니다">타이머 시작</button>
          <button type="button" class="btn-xs btn-ghost todo-edit-btn">편집</button>
        </div>
      `;

      card.querySelector('.todo-check').addEventListener('change', e => {
        todo.completed = e.target.checked;
        saveState();
        renderAll();
      });

      card.querySelector('.todo-start-btn').addEventListener('click', () => {
        startLiveTrackerWith(todo.title, todo.categoryId);
      });

      card.querySelector('.todo-edit-btn').addEventListener('click', () => {
        openItemModalForEdit('todo', todo);
      });

      container.appendChild(card);
    });
  }

  // -------------------- 중앙: 계획 대 실행 듀얼 타임트래커 렌더링 --------------------
  function renderDualTimeline() {
    const scrollEl = document.getElementById('dualTimelineScroll');
    if (!scrollEl) return;

    const dayPlans = state.schedules
      .filter(s => s.date === selectedDate)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const dayActuals = state.actualLogs
      .filter(a => a.date === selectedDate)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const currentHour = new Date().getHours();
    const isToday = selectedDate === getTodayStr();

    scrollEl.innerHTML = '';

    for (let hour = 6; hour <= 23; hour++) {
      const hourStr = `${String(hour).padStart(2, '0')}:00`;
      const nextHourStr = `${String(hour + 1).padStart(2, '0')}:00`;
      const row = document.createElement('div');
      row.className = `dt-hour-row ${isToday && hour === currentHour ? 'current-hour-row' : ''}`;

      // 해당 시간대에 시작하거나 걸쳐 있는 계획/실제 블록 찾기
      const plansInHour = dayPlans.filter(p => {
        const sH = Math.floor(timeToMinutes(p.startTime) / 60);
        return sH === hour;
      });

      const actualsInHour = dayActuals.filter(a => {
        const sH = Math.floor(timeToMinutes(a.startTime) / 60);
        return sH === hour;
      });

      // 시간 라벨 열
      const timeCol = document.createElement('div');
      timeCol.className = 'dt-hour-label';
      timeCol.textContent = hourStr;

      // 계획 열
      const planCol = document.createElement('div');
      planCol.className = 'dt-slot-cell';
      if (plansInHour.length === 0) {
        planCol.innerHTML = `<span class="dt-empty-hint">+ ${hourStr} 계획 추가</span>`;
      } else {
        plansInHour.forEach(p => {
          const cat = getCategoryById(p.categoryId);
          const block = document.createElement('div');
          block.className = 'timeline-block';
          block.style.background = `${cat.color}16`;
          block.style.borderLeftColor = cat.color;
          block.innerHTML = `
            <div class="tb-info">
              <span class="tb-time" style="color:${cat.color}">
                ${p.startTime} ~ ${p.endTime} ${p.alarm ? '🔔' : ''} ${p.important ? '★' : ''}
              </span>
              <span class="tb-title">${escapeHtml(p.title)}</span>
            </div>
            <div class="tb-actions">
              <button type="button" class="tb-mini-btn plan-run-btn" title="이 일정을 지금 시작하고 실제 시간을 측정합니다">시작</button>
              <button type="button" class="tb-mini-btn plan-done-btn" title="계획 일정과 동일한 시간으로 실제 사용 시간에 즉시 기록합니다">${p.completed ? '완료됨' : '완료 기록'}</button>
            </div>
          `;
          block.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            openItemModalForEdit('schedule', p);
          });
          block.querySelector('.plan-run-btn').addEventListener('click', e => {
            e.stopPropagation();
            startLiveTrackerWith(p.title, p.categoryId);
          });
          block.querySelector('.plan-done-btn').addEventListener('click', e => {
            e.stopPropagation();
            p.completed = !p.completed;
            if (p.completed) {
              // 실제 사용 시간(Actual)에도 아직 없으면 자동 기록
              const exists = state.actualLogs.some(
                a => a.date === p.date && a.title === p.title && a.startTime === p.startTime
              );
              if (!exists) {
                state.actualLogs.push({
                  id: uid('act'),
                  title: p.title,
                  date: p.date,
                  startTime: p.startTime,
                  endTime: p.endTime,
                  categoryId: p.categoryId
                });
                showToast(`'${p.title}' 일정이 실제 사용 시간에 자동 기록되었습니다.`);
              }
            }
            saveState();
            renderAll();
          });
          planCol.appendChild(block);
        });
      }
      planCol.addEventListener('click', e => {
        if (e.target.closest('.timeline-block')) return;
        openItemModalForCreate('schedule', hourStr, nextHourStr);
      });

      // 실제 사용 시간 열
      const actualCol = document.createElement('div');
      actualCol.className = 'dt-slot-cell';
      if (actualsInHour.length === 0) {
        actualCol.innerHTML = `<span class="dt-empty-hint">+ ${hourStr} 실제 기록</span>`;
      } else {
        actualsInHour.forEach(a => {
          const cat = getCategoryById(a.categoryId);
          const dur = durationMinutes(a.startTime, a.endTime);
          const block = document.createElement('div');
          block.className = 'timeline-block';
          block.style.background = `${cat.color}24`;
          block.style.borderLeftColor = cat.color;
          block.innerHTML = `
            <div class="tb-info">
              <span class="tb-time" style="color:${cat.color}">${a.startTime} ~ ${a.endTime} · ${dur}분 기록됨</span>
              <span class="tb-title">${escapeHtml(a.title)}</span>
            </div>
            <div class="tb-actions">
              <button type="button" class="tb-mini-btn actual-edit-btn">수정</button>
            </div>
          `;
          block.addEventListener('click', () => {
            openItemModalForEdit('actual', a);
          });
          actualCol.appendChild(block);
        });
      }
      actualCol.addEventListener('click', e => {
        if (e.target.closest('.timeline-block')) return;
        openItemModalForCreate('actual', hourStr, nextHourStr);
      });

      row.appendChild(timeCol);
      row.appendChild(planCol);
      row.appendChild(actualCol);
      scrollEl.appendChild(row);
    }
  }

  // -------------------- 대시보드 우측: 오늘 루틴 목록 --------------------
  function renderDashboardRoutines() {
    const container = document.getElementById('dashRoutineList');
    if (!container) return;

    container.innerHTML = '';
    state.routines.forEach(rtn => {
      const cat = getCategoryById(rtn.categoryId);
      const totalMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);
      const isDoneToday = Array.isArray(rtn.completedDates) && rtn.completedDates.includes(selectedDate);

      const card = document.createElement('div');
      card.className = 'routine-mini-card';
      card.innerHTML = `
        <div class="rmc-top">
          <span class="rmc-title">${escapeHtml(rtn.name)}</span>
          <span class="cat-dot-tag" style="background:${cat.color}20;color:${cat.color}">${escapeHtml(cat.name)}</span>
        </div>
        <div class="rmc-meta">권장 ${rtn.startTime || '07:00'} · 총 ${totalMins}분 · ${rtn.steps.length}단계</div>
        <div class="rmc-steps-preview">
          ${rtn.steps.map(s => `<span class="rmc-step-chip">${escapeHtml(s.title)} ${s.minutes}분</span>`).join('')}
        </div>
        <div class="rmc-foot">
          <span style="font-size:0.76rem;font-weight:700;color:${isDoneToday ? '#059669' : '#64748B'}">
            ${isDoneToday ? '오늘 완주 완료' : '실행 대기 중'}
          </span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn-xs btn-ghost rtn-edit-btn">편집</button>
            <button type="button" class="btn-xs btn-primary rtn-play-btn">루틴 시작</button>
          </div>
        </div>
      `;

      card.querySelector('.rtn-play-btn').addEventListener('click', () => {
        switchTab('routines');
        startRoutinePlayer(rtn.id);
      });

      card.querySelector('.rtn-edit-btn').addEventListener('click', () => {
        openRoutineModalForEdit(rtn);
      });

      container.appendChild(card);
    });
  }

  // -------------------- 실시간 타임트래커 스톱워치 엔진 --------------------
  function startLiveTrackerWith(title, categoryId) {
    if (liveTracker.running) {
      stopLiveTrackerAndRecord();
    }

    const titleInput = document.getElementById('liveTrackerTitle');
    const catSelect = document.getElementById('liveTrackerCategory');

    liveTracker.title = String(title || titleInput.value || '집중 작업').trim();
    liveTracker.categoryId = categoryId || catSelect.value || state.categories[0].id;
    liveTracker.startTimestamp = Date.now();
    liveTracker.startTimeStr = getNowTimeStr();
    liveTracker.elapsedSeconds = 0;
    liveTracker.running = true;

    titleInput.value = liveTracker.title;
    catSelect.value = liveTracker.categoryId;

    document.getElementById('startLiveTrackerBtn').classList.add('hidden');
    document.getElementById('stopLiveTrackerBtn').classList.remove('hidden');

    const badge = document.getElementById('liveTrackerBadge');
    badge.textContent = '측정 중';
    badge.classList.add('running');

    requestWakeLock();
    playChimeSound('chime');
    speakKorean(`${liveTracker.title} 타임트래커 기록을 시작합니다.`);
    showToast(`'${liveTracker.title}' 실시간 시간 기록이 시작되었습니다.`);

    clearInterval(liveTracker.intervalId);
    liveTracker.intervalId = setInterval(() => {
      liveTracker.elapsedSeconds = Math.floor((Date.now() - liveTracker.startTimestamp) / 1000);
      updateLiveTrackerClockUI();
      updateTopBannerUI();
    }, 1000);

    updateLiveTrackerClockUI();
    updateTopBannerUI();
  }

  function updateLiveTrackerClockUI() {
    const s = liveTracker.elapsedSeconds;
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    document.getElementById('liveTrackerClock').textContent = `${hh}:${mm}:${ss}`;
  }

  function stopLiveTrackerAndRecord() {
    if (!liveTracker.running) return;
    clearInterval(liveTracker.intervalId);
    liveTracker.running = false;
    releaseWakeLock();

    const elapsedMins = Math.max(5, Math.round(liveTracker.elapsedSeconds / 60));
    const startTime = liveTracker.startTimeStr || getNowTimeStr();
    const endTime = minutesToTime(timeToMinutes(startTime) + elapsedMins);

    state.actualLogs.push({
      id: uid('act'),
      title: liveTracker.title,
      date: getTodayStr(),
      startTime,
      endTime,
      categoryId: liveTracker.categoryId
    });

    document.getElementById('startLiveTrackerBtn').classList.remove('hidden');
    document.getElementById('stopLiveTrackerBtn').classList.add('hidden');
    document.getElementById('liveTrackerClock').textContent = '00:00:00';
    document.getElementById('liveTrackerTitle').value = '';

    const badge = document.getElementById('liveTrackerBadge');
    badge.textContent = '대기 중';
    badge.classList.remove('running');

    playChimeSound('fanfare');
    speakKorean(`${liveTracker.title} 기록이 완료되어 타임트래커에 반영되었습니다.`);
    showToast(`'${liveTracker.title}' · ${elapsedMins}분 실제 사용 시간이 기록되었습니다.`);

    saveState();
    updateTopBannerUI();
    renderAll();
  }

  // -------------------- 탭 2: 루티너리 몰입형 플레이어 엔진 --------------------
  function renderRoutinePlayerTab() {
    const listEl = document.getElementById('studioRoutineList');
    if (listEl) {
      listEl.innerHTML = '';
      state.routines.forEach(rtn => {
        const cat = getCategoryById(rtn.categoryId);
        const totalMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);
        const card = document.createElement('div');
        card.className = 'routine-mini-card';
        card.innerHTML = `
          <div class="rmc-top">
            <span class="rmc-title">${escapeHtml(rtn.name)}</span>
            <span class="cat-dot-tag" style="background:${cat.color}20;color:${cat.color}">${escapeHtml(cat.name)}</span>
          </div>
          <div class="rmc-meta">권장 시작 ${rtn.startTime} · 총 ${totalMins}분 · ${rtn.steps.length}개 행동</div>
          <div class="rmc-steps-preview">
            ${rtn.steps.map((s, idx) => `<span class="rmc-step-chip">${idx + 1}. ${escapeHtml(s.title)} · ${s.minutes}분</span>`).join('')}
          </div>
          <div class="rmc-foot">
            <button type="button" class="btn-xs btn-outline studio-edit-btn">단계 편집</button>
            <button type="button" class="btn-xs btn-primary studio-start-btn">플레이어에서 시작</button>
          </div>
        `;
        card.querySelector('.studio-start-btn').addEventListener('click', () => {
          startRoutinePlayer(rtn.id);
        });
        card.querySelector('.studio-edit-btn').addEventListener('click', () => {
          openRoutineModalForEdit(rtn);
        });
        listEl.appendChild(card);
      });
    }

    updateRoutinePlayerUI();
  }

  function startRoutinePlayer(routineId) {
    const rtn = state.routines.find(r => r.id === routineId);
    if (!rtn || !rtn.steps || rtn.steps.length === 0) return;

    clearInterval(routinePlayer.intervalId);
    routinePlayer.activeRoutineId = rtn.id;
    routinePlayer.running = true;
    routinePlayer.paused = false;
    routinePlayer.stepIndex = 0;
    routinePlayer.stepTargetSeconds = Math.max(10, Number(rtn.steps[0].minutes || 1) * 60);
    routinePlayer.stepElapsedSeconds = 0;
    routinePlayer.totalElapsedSeconds = 0;
    routinePlayer.routineStartTimeStr = getNowTimeStr();
    routinePlayer.overtimeNotified = false;

    requestWakeLock();
    playChimeSound('chime');
    const firstStep = rtn.steps[0];
    speakKorean(`${rtn.name}을 시작합니다. 첫 번째 행동은 ${firstStep.title}, 목표 시간은 ${firstStep.minutes}분입니다.`);

    routinePlayer.intervalId = setInterval(tickRoutinePlayer, 1000);
    updateRoutinePlayerUI();
    updateTopBannerUI();
  }

  function tickRoutinePlayer() {
    if (!routinePlayer.running || routinePlayer.paused) return;
    routinePlayer.stepElapsedSeconds += 1;
    routinePlayer.totalElapsedSeconds += 1;

    if (
      routinePlayer.stepElapsedSeconds >= routinePlayer.stepTargetSeconds &&
      !routinePlayer.overtimeNotified
    ) {
      routinePlayer.overtimeNotified = true;
      playChimeSound('alarm');
      const rtn = state.routines.find(r => r.id === routinePlayer.activeRoutineId);
      const step = rtn?.steps?.[routinePlayer.stepIndex];
      speakKorean(`${step ? step.title : '현재 단계'} 목표 시간이 지났습니다. 완료 후 다음 단계로 넘어갈까요?`);
    }

    updateRoutinePlayerUI();
    updateTopBannerUI();
  }

  function completeCurrentRoutineStep(skipped = false) {
    const rtn = state.routines.find(r => r.id === routinePlayer.activeRoutineId);
    if (!rtn) return;

    const nextIdx = routinePlayer.stepIndex + 1;
    if (nextIdx < rtn.steps.length) {
      routinePlayer.stepIndex = nextIdx;
      const nextStep = rtn.steps[nextIdx];
      routinePlayer.stepTargetSeconds = Math.max(10, Number(nextStep.minutes || 1) * 60);
      routinePlayer.stepElapsedSeconds = 0;
      routinePlayer.overtimeNotified = false;

      playChimeSound('chime');
      speakKorean(
        `${skipped ? '건너뛰었습니다.' : '잘하셨어요!'} 다음 행동은 ${nextStep.title}, ${nextStep.minutes}분입니다.`
      );
      updateRoutinePlayerUI();
      updateTopBannerUI();
    } else {
      // 루틴 전체 완주!
      finishRoutineSuccess(rtn);
    }
  }

  function finishRoutineSuccess(rtn) {
    clearInterval(routinePlayer.intervalId);
    routinePlayer.running = false;
    routinePlayer.paused = false;
    releaseWakeLock();

    const todayStr = getTodayStr();
    if (!Array.isArray(rtn.completedDates)) rtn.completedDates = [];
    if (!rtn.completedDates.includes(todayStr)) {
      rtn.completedDates.push(todayStr);
      state.settings.streakDays = (state.settings.streakDays || 1) + 1;
    }

    // 실제 소요 시간(최소 5분 또는 루틴 계획 시간)을 타임트래커(Actual)에 자동 기록
    const plannedMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);
    const actualMins = Math.max(5, Math.round(routinePlayer.totalElapsedSeconds / 60) || plannedMins);
    const startTime = routinePlayer.routineStartTimeStr || getNowTimeStr();
    const endTime = minutesToTime(timeToMinutes(startTime) + actualMins);

    state.actualLogs.push({
      id: uid('act'),
      title: `${rtn.name} 완주`,
      date: todayStr,
      startTime,
      endTime,
      categoryId: rtn.categoryId
    });

    playChimeSound('fanfare');
    speakKorean(`축하합니다! ${rtn.name}을 모두 완주하셨습니다. 실제 사용 시간 타임트래커에 자동 기록되었습니다.`);
    showToast(`🎉 '${rtn.name}' 완주! 타임트래커에 ${actualMins}분 자동 기록되었습니다.`);

    saveState();
    updateRoutinePlayerUI();
    updateTopBannerUI();
    renderAll();
  }

  function stopRoutinePlayerEarly() {
    clearInterval(routinePlayer.intervalId);
    routinePlayer.running = false;
    routinePlayer.paused = false;
    routinePlayer.activeRoutineId = null;
    releaseWakeLock();
    updateRoutinePlayerUI();
    updateTopBannerUI();
    showToast('루틴 실행을 종료했습니다.');
  }

  function updateRoutinePlayerUI() {
    const rtn =
      state.routines.find(r => r.id === routinePlayer.activeRoutineId) || state.routines[0];

    const nameEl = document.getElementById('playerRoutineName');
    const badgeEl = document.getElementById('playerRoutineBadge');
    const stepCounterEl = document.getElementById('playerStepCounter');
    const totalRemainEl = document.getElementById('playerTotalRemaining');
    const stepTitleEl = document.getElementById('playerCurrentStepTitle');
    const countdownEl = document.getElementById('playerCountdownText');
    const overtimeEl = document.getElementById('playerOvertimeText');
    const tipEl = document.getElementById('playerCurrentStepTip');
    const nextStepEl = document.getElementById('playerNextStepTitle');
    const ringEl = document.getElementById('playerRingProgress');
    const queueListEl = document.getElementById('playerStepQueueList');

    const btnComplete = document.getElementById('playerCompleteStepBtn');
    const btnAdd5 = document.getElementById('playerAdd5MinBtn');
    const btnPause = document.getElementById('playerPauseResumeBtn');
    const btnSkip = document.getElementById('playerSkipStepBtn');
    const btnStop = document.getElementById('playerStopRoutineBtn');

    if (!rtn) return;

    const cat = getCategoryById(rtn.categoryId);
    const totalMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);

    nameEl.textContent = rtn.name;
    badgeEl.textContent = cat.name;
    totalRemainEl.textContent = `총 ${totalMins}분`;

    const isRunning = routinePlayer.running && routinePlayer.activeRoutineId === rtn.id;
    btnComplete.disabled = !isRunning;
    btnAdd5.disabled = !isRunning;
    btnPause.disabled = !isRunning;
    btnSkip.disabled = !isRunning;
    btnStop.disabled = !isRunning;

    const currentIdx = isRunning ? routinePlayer.stepIndex : 0;
    const step = rtn.steps[currentIdx] || { title: '행동 없음', minutes: 1, tip: '' };
    const nextStep = rtn.steps[currentIdx + 1];

    stepCounterEl.textContent = `${currentIdx + 1} / ${rtn.steps.length} 단계`;
    stepTitleEl.textContent = step.title;
    tipEl.textContent = step.tip || '타이머에 맞춰 차분하게 현재 행동에만 집중해 보세요.';
    nextStepEl.textContent = nextStep ? `${nextStep.title} · ${nextStep.minutes}분` : '마지막 단계입니다! 완료하면 루틴이 끝납니다.';

    const circumference = 703.7;
    if (isRunning) {
      const remainSec = routinePlayer.stepTargetSeconds - routinePlayer.stepElapsedSeconds;
      if (remainSec >= 0) {
        const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
        const ss = String(remainSec % 60).padStart(2, '0');
        countdownEl.textContent = `${mm}:${ss}`;
        overtimeEl.classList.add('hidden');
        const ratio = remainSec / routinePlayer.stepTargetSeconds;
        ringEl.style.strokeDashoffset = String(circumference * (1 - ratio));
        ringEl.style.stroke = '#38BDF8';
      } else {
        const overSec = Math.abs(remainSec);
        const mm = String(Math.floor(overSec / 60)).padStart(2, '0');
        const ss = String(overSec % 60).padStart(2, '0');
        countdownEl.textContent = '00:00';
        overtimeEl.textContent = `초과 +${mm}:${ss}`;
        overtimeEl.classList.remove('hidden');
        ringEl.style.strokeDashoffset = '0';
        ringEl.style.stroke = '#F87171';
      }
      btnPause.textContent = routinePlayer.paused ? '다시 시작' : '일시정지';
    } else {
      const mm = String(step.minutes || 1).padStart(2, '0');
      countdownEl.textContent = `${mm}:00`;
      overtimeEl.classList.add('hidden');
      ringEl.style.strokeDashoffset = '0';
      ringEl.style.stroke = '#38BDF8';
      btnPause.textContent = '일시정지';
    }

    if (queueListEl) {
      queueListEl.innerHTML = rtn.steps
        .map((st, idx) => {
          const cls = isRunning
            ? idx < currentIdx
              ? 'done'
              : idx === currentIdx
              ? 'active'
              : ''
            : idx === 0
            ? 'active'
            : '';
          return `
            <div class="step-queue-item ${cls}">
              <span>${idx + 1}. ${escapeHtml(st.title)}</span>
              <span>${st.minutes}분</span>
            </div>
          `;
        })
        .join('');
    }
  }

  // 상단 플로팅 타이머 배너 동기화
  function updateTopBannerUI() {
    const banner = document.getElementById('activeTimerBanner');
    const typeEl = document.getElementById('bannerTimerType');
    const titleEl = document.getElementById('bannerTimerTitle');
    const clockEl = document.getElementById('bannerTimerClock');

    if (routinePlayer.running) {
      const rtn = state.routines.find(r => r.id === routinePlayer.activeRoutineId);
      const step = rtn?.steps?.[routinePlayer.stepIndex];
      const remain = Math.max(0, routinePlayer.stepTargetSeconds - routinePlayer.stepElapsedSeconds);
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(remain % 60).padStart(2, '0');
      banner.classList.remove('hidden');
      typeEl.textContent = '루틴 실행 중';
      titleEl.textContent = `${rtn ? rtn.name : ''} · ${step ? step.title : ''}`;
      clockEl.textContent = `${mm}:${ss}`;
      return;
    }

    if (liveTracker.running) {
      const s = liveTracker.elapsedSeconds;
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      banner.classList.remove('hidden');
      typeEl.textContent = '타임트래커 측정 중';
      titleEl.textContent = liveTracker.title;
      clockEl.textContent = `${mm}:${ss}`;
      return;
    }

    banner.classList.add('hidden');
  }

  // -------------------- 탭 3: 주간 · 월간 전체 조망 렌더링 --------------------
  function renderCalendarOverviewTab() {
    const year = fullCalCursor.getFullYear();
    const month = fullCalCursor.getMonth();
    const titleEl = document.getElementById('calHeaderTitle');
    const monthView = document.getElementById('monthCalendarView');
    const weekView = document.getElementById('weekMatrixView');

    if (currentCalView === 'month') {
      monthView.classList.remove('hidden');
      weekView.classList.add('hidden');
      titleEl.textContent = `${year}년 ${month + 1}월 전체 일정`;
      renderMonthGrid(year, month);
    } else {
      monthView.classList.add('hidden');
      weekView.classList.remove('hidden');
      renderWeekMatrix();
    }

    renderUpcomingMilestones();
  }

  function renderMonthGrid(year, month) {
    const grid = document.getElementById('monthCalendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const todayStr = getTodayStr();

    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({ day: d, dateStr: toDateStr(new Date(year, month - 1, d)), otherMonth: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, dateStr: toDateStr(new Date(year, month, d)), otherMonth: false });
    }
    while (cells.length % 7 !== 0) {
      const nextD = cells.length - (firstDay + daysInMonth) + 1;
      cells.push({ day: nextD, dateStr: toDateStr(new Date(year, month + 1, nextD)), otherMonth: true });
    }

    cells.forEach(cell => {
      const div = document.createElement('div');
      div.className = `month-cell ${cell.otherMonth ? 'other-month' : ''} ${cell.dateStr === todayStr ? 'is-today' : ''}`;

      const dayPlans = state.schedules.filter(s => s.date === cell.dateStr);
      const dayActuals = state.actualLogs.filter(a => a.date === cell.dateStr);
      const actualMins = dayActuals.reduce((acc, a) => acc + durationMinutes(a.startTime, a.endTime), 0);

      div.innerHTML = `
        <div class="mc-date-head">
          <span>${cell.day}일</span>
          ${actualMins > 0 ? `<span class="mc-actual-badge">기록 ${formatDurationKo(actualMins)}</span>` : ''}
        </div>
        ${dayPlans
          .slice(0, 3)
          .map(p => {
            const cat = getCategoryById(p.categoryId);
            return `<div class="mc-event-pill" style="background:${cat.color}20;color:${cat.color}">${p.startTime} ${escapeHtml(p.title)}</div>`;
          })
          .join('')}
        ${dayPlans.length > 3 ? `<div style="font-size:0.7rem;color:#64748B;">외 ${dayPlans.length - 3}건 더보기</div>` : ''}
      `;

      div.addEventListener('click', () => {
        selectedDate = cell.dateStr;
        switchTab('dashboard');
        renderAll();
      });
      grid.appendChild(div);
    });
  }

  function renderWeekMatrix() {
    const grid = document.getElementById('weekMatrixGrid');
    const titleEl = document.getElementById('calHeaderTitle');
    if (!grid) return;

    const [y, m, d] = selectedDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    const dayOfWeek = base.getDay();
    const sunday = new Date(y, m - 1, d - dayOfWeek);
    const saturday = new Date(y, m - 1, d - dayOfWeek + 6);

    titleEl.textContent = `${toDateStr(sunday)} ~ ${toDateStr(saturday)} 주간 매트릭스`;
    grid.innerHTML = '';

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
      const dStr = toDateStr(cur);
      const plans = state.schedules
        .filter(s => s.date === dStr)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const actuals = state.actualLogs.filter(a => a.date === dStr);
      const actualMins = actuals.reduce((acc, a) => acc + durationMinutes(a.startTime, a.endTime), 0);

      const col = document.createElement('div');
      col.className = 'week-day-col';
      col.innerHTML = `
        <div class="week-day-head">
          <span>${cur.getMonth() + 1}/${cur.getDate()} ${dayNames[i]}</span>
          <span style="font-size:0.74rem;color:#0D9488;">기록 ${formatDurationKo(actualMins)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${
            plans.length === 0
              ? '<p class="empty-guide">일정 없음</p>'
              : plans
                  .map(p => {
                    const cat = getCategoryById(p.categoryId);
                    return `
                      <div class="mc-event-pill" style="background:${cat.color}18;color:${cat.color};padding:6px 8px;">
                        <strong>${p.startTime}</strong> ${escapeHtml(p.title)}
                      </div>`;
                  })
                  .join('')
          }
        </div>
      `;
      col.addEventListener('click', () => {
        selectedDate = dStr;
        switchTab('dashboard');
        renderAll();
      });
      grid.appendChild(col);
    }
  }

  function renderUpcomingMilestones() {
    const container = document.getElementById('upcomingMilestoneList');
    if (!container) return;

    const combined = [
      ...state.schedules.map(s => ({
        date: s.date,
        time: s.startTime,
        title: s.title,
        categoryId: s.categoryId,
        important: s.important,
        badge: '일정'
      })),
      ...state.todos
        .filter(t => t.dueDate && !t.completed)
        .map(t => ({
          date: t.dueDate,
          time: '마감',
          title: t.title,
          categoryId: t.categoryId,
          important: t.important,
          badge: '할 일'
        }))
    ].sort((a, b) => a.date.localeCompare(b.date));

    if (combined.length === 0) {
      container.innerHTML = `<p class="empty-guide">등록된 주요 일정이 없습니다.</p>`;
      return;
    }

    container.innerHTML = '';
    combined.slice(0, 15).forEach(item => {
      const cat = getCategoryById(item.categoryId);
      const el = document.createElement('div');
      el.className = 'milestone-item';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:3px;">
          <span style="font-weight:700;color:${cat.color}">${item.date} · ${item.time}</span>
          <span class="cat-dot-tag" style="background:${cat.color}20;color:${cat.color}">${escapeHtml(cat.name)}</span>
        </div>
        <div style="font-weight:700;font-size:0.88rem;">
          ${item.important ? '<span class="important-star">★</span> ' : ''}${escapeHtml(item.title)}
        </div>
      `;
      el.addEventListener('click', () => {
        selectedDate = item.date;
        switchTab('dashboard');
        renderAll();
      });
      container.appendChild(el);
    });
  }

  // -------------------- 탭 4: 타임트래커 분석 보고서 & 다음 달 목표 설계 --------------------
  function computeReportStatistics() {
    const todayStr = getTodayStr();
    const ymPrefix = todayStr.slice(0, 7); // YYYY-MM
    const sevenDaysAgo = addDaysStr(todayStr, -6);

    const filterFn = item => {
      if (!item.date) return false;
      if (currentReportPeriod === 'today') return item.date === todayStr;
      if (currentReportPeriod === 'last7Days') return item.date >= sevenDaysAgo && item.date <= todayStr;
      return item.date.startsWith(ymPrefix);
    };

    const filteredPlans = state.schedules.filter(filterFn);
    const filteredActuals = state.actualLogs.filter(filterFn);

    const byCategory = {};
    state.categories.forEach(c => {
      byCategory[c.id] = {
        id: c.id,
        name: c.name,
        color: c.color,
        planMinutes: 0,
        actualMinutes: 0
      };
    });

    filteredPlans.forEach(p => {
      const bucket = byCategory[p.categoryId] || Object.values(byCategory)[0];
      if (bucket) bucket.planMinutes += durationMinutes(p.startTime, p.endTime);
    });

    filteredActuals.forEach(a => {
      const bucket = byCategory[a.categoryId] || Object.values(byCategory)[0];
      if (bucket) bucket.actualMinutes += durationMinutes(a.startTime, a.endTime);
    });

    const totalPlanMinutes = Object.values(byCategory).reduce((s, x) => s + x.planMinutes, 0);
    const totalActualMinutes = Object.values(byCategory).reduce((s, x) => s + x.actualMinutes, 0);

    // 시간대별 실제 집중 분석 (오전 / 오후 / 저녁)
    let morningMins = 0;
    let afternoonMins = 0;
    let nightMins = 0;
    filteredActuals.forEach(a => {
      const startH = Math.floor(timeToMinutes(a.startTime) / 60);
      const mins = durationMinutes(a.startTime, a.endTime);
      if (startH < 12) morningMins += mins;
      else if (startH < 18) afternoonMins += mins;
      else nightMins += mins;
    });

    let goldenTimeLabel = '오전 08~12시';
    if (afternoonMins > morningMins && afternoonMins >= nightMins) goldenTimeLabel = '오후 13~18시';
    else if (nightMins > morningMins && nightMins > afternoonMins) goldenTimeLabel = '저녁 19~23시';

    return {
      byCategory: Object.values(byCategory),
      totalPlanMinutes,
      totalActualMinutes,
      goldenTimeLabel
    };
  }

  function renderReportAndGoalsTab() {
    const stats = computeReportStatistics();
    const totalActualHours = (stats.totalActualMinutes / 60).toFixed(1);
    document.getElementById('reportTotalActualText').textContent = `총 ${totalActualHours}시간`;

    // 1. SVG 도넛 차트 렌더링
    const donutBox = document.getElementById('reportDonutChart');
    const barsBox = document.getElementById('reportCategoryBars');
    if (donutBox && barsBox) {
      const radius = 64;
      const circum = 2 * Math.PI * radius;
      let offsetAccum = 0;

      const segmentsSvg = stats.byCategory
        .filter(c => c.actualMinutes > 0)
        .map(c => {
          const frac = stats.totalActualMinutes > 0 ? c.actualMinutes / stats.totalActualMinutes : 0;
          const segLen = frac * circum;
          const dashArray = `${segLen} ${circum - segLen}`;
          const dashOffset = -offsetAccum;
          offsetAccum += segLen;
          return `<circle cx="85" cy="85" r="${radius}" fill="none" stroke="${c.color}" stroke-width="24" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 85 85)" />`;
        })
        .join('');

      donutBox.innerHTML = `
        <svg width="170" height="170" viewBox="0 0 170 170">
          <circle cx="85" cy="85" r="${radius}" fill="none" stroke="#E2E8F0" stroke-width="24" />
          ${segmentsSvg}
          <text x="85" y="80" text-anchor="middle" font-size="12" fill="#64748B" font-weight="700">실제 기록</text>
          <text x="85" y="100" text-anchor="middle" font-size="17" fill="#0F172A" font-weight="800">${totalActualHours}h</text>
        </svg>
      `;

      barsBox.innerHTML = stats.byCategory
        .map(c => {
          const pct = stats.totalActualMinutes > 0 ? Math.round((c.actualMinutes / stats.totalActualMinutes) * 100) : 0;
          const hrs = (c.actualMinutes / 60).toFixed(1);
          return `
            <div class="share-bar-item">
              <div class="share-bar-top">
                <span style="display:flex;align-items:center;gap:6px;">
                  <span class="legend-color-box" style="background:${c.color}"></span>
                  ${escapeHtml(c.name)}
                </span>
                <span>${hrs}시간 · ${pct}%</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width:${pct}%;background:${c.color}"></div>
              </div>
            </div>
          `;
        })
        .join('');
    }

    // 2. 계획 vs 실제 비교 진단 및 테이블
    const matchRate =
      stats.totalPlanMinutes > 0
        ? Math.min(100, Math.round((stats.totalActualMinutes / stats.totalPlanMinutes) * 100))
        : 0;
    document.getElementById('insightMatchRate').textContent = `${matchRate}%`;
    document.getElementById('insightGoldenTime').textContent = stats.goldenTimeLabel;

    const biggestGapCat = [...stats.byCategory].sort(
      (a, b) => Math.abs(b.actualMinutes - b.planMinutes) - Math.abs(a.actualMinutes - a.planMinutes)
    )[0];
    document.getElementById('insightTimeLeak').textContent = biggestGapCat
      ? biggestGapCat.name
      : '균형 유지 중';

    const tbody = document.getElementById('reportCompareTableBody');
    if (tbody) {
      tbody.innerHTML = stats.byCategory
        .map(c => {
          const diffMins = c.actualMinutes - c.planMinutes;
          const diffSign = diffMins > 0 ? '+' : '';
          const execRate = c.planMinutes > 0 ? Math.round((c.actualMinutes / c.planMinutes) * 100) : (c.actualMinutes > 0 ? 100 : 0);
          return `
            <tr>
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;">
                  <span class="legend-color-box" style="background:${c.color}"></span>
                  ${escapeHtml(c.name)}
                </span>
              </td>
              <td>${formatDurationKo(c.planMinutes)}</td>
              <td><strong>${formatDurationKo(c.actualMinutes)}</strong></td>
              <td style="color:${diffMins < 0 ? '#D97706' : '#059669'};font-weight:700;">
                ${diffSign}${formatDurationKo(Math.abs(diffMins))}
              </td>
              <td><span class="kpi-badge">${execRate}%</span></td>
            </tr>
          `;
        })
        .join('');
    }

    // 3. 우측: 회고 노트 반영
    document.getElementById('reviewKeepInput').value = state.reviewNotes.keep || '';
    document.getElementById('reviewProblemInput').value = state.reviewNotes.problem || '';
    document.getElementById('reviewTryInput').value = state.reviewNotes.tryAction || '';

    // 4. 다음 달 카테고리별 시간 예산 편집기
    const budgetList = document.getElementById('timeBudgetEditorList');
    if (budgetList) {
      budgetList.innerHTML = '';
      stats.byCategory.forEach(c => {
        const targetHours = Number(state.timeBudgets[c.id] || 20);
        const currentHours = Number((c.actualMinutes / 60).toFixed(1));
        const pct = targetHours > 0 ? Math.min(100, Math.round((currentHours / targetHours) * 100)) : 0;

        const row = document.createElement('div');
        row.className = 'budget-item-row';
        row.innerHTML = `
          <div class="budget-item-top">
            <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:0.86rem;">
              <span class="legend-color-box" style="background:${c.color}"></span>
              ${escapeHtml(c.name)}
              <span style="font-size:0.75rem;color:#64748B;font-weight:500;">이번 달 실제 ${currentHours}시간</span>
            </span>
            <div class="budget-input-group">
              <span>다음 달 목표</span>
              <input type="number" min="0" max="300" step="1" data-budget-cat="${c.id}" value="${targetHours}" />
              <span>시간</span>
            </div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${pct}%;background:${c.color}"></div>
          </div>
        `;
        budgetList.appendChild(row);
      });
    }

    // 5. 다음 달 핵심 목표 체크리스트
    renderMonthlyGoalList();
  }

  function renderMonthlyGoalList() {
    const container = document.getElementById('monthlyGoalList');
    if (!container) return;

    if (!state.monthlyGoals || state.monthlyGoals.length === 0) {
      container.innerHTML = `<p class="empty-guide">다음 달 달성할 핵심 목표를 추가해보세요.</p>`;
      return;
    }

    container.innerHTML = '';
    state.monthlyGoals.forEach(goal => {
      const cat = getCategoryById(goal.categoryId);
      const card = document.createElement('div');
      card.className = `todo-item-card ${goal.done ? 'completed' : ''}`;
      card.innerHTML = `
        <div class="todo-left">
          <input type="checkbox" class="todo-check" ${goal.done ? 'checked' : ''} />
          <div class="todo-meta-col">
            <div class="todo-title-row">
              <span class="todo-title-text">${escapeHtml(goal.title)}</span>
            </div>
            <div class="todo-sub-info">
              <span class="cat-dot-tag" style="background:${cat.color}20;color:${cat.color}">${escapeHtml(cat.name)}</span>
            </div>
          </div>
        </div>
        <div class="todo-actions">
          <button type="button" class="btn-xs btn-outline goal-to-todo-btn" title="이 목표를 오늘 할 일 목록에 바로 복사합니다">할 일로 추가</button>
          <button type="button" class="btn-xs btn-ghost goal-del-btn">삭제</button>
        </div>
      `;

      card.querySelector('.todo-check').addEventListener('change', e => {
        goal.done = e.target.checked;
        saveState();
        renderMonthlyGoalList();
      });

      card.querySelector('.goal-to-todo-btn').addEventListener('click', () => {
        state.todos.push({
          id: uid('todo'),
          title: goal.title,
          dueDate: selectedDate,
          categoryId: goal.categoryId,
          estimatedMinutes: 45,
          important: true,
          completed: false
        });
        saveState();
        renderAll();
        showToast(`'${goal.title}' 목표가 오늘 할 일에 등록되었습니다.`);
      });

      card.querySelector('.goal-del-btn').addEventListener('click', () => {
        state.monthlyGoals = state.monthlyGoals.filter(g => g.id !== goal.id);
        saveState();
        renderMonthlyGoalList();
      });

      container.appendChild(card);
    });
  }

  // -------------------- 알람 감시 및 끈질긴 리마인드 엔진 --------------------
  function checkScheduledAlarms() {
    const todayStr = getTodayStr();
    const nowTime = getNowTimeStr();

    // 1. 오늘 일정 알람 확인
    state.schedules.forEach(s => {
      if (s.date === todayStr && s.alarm && !s.completed && s.startTime === nowTime) {
        const key = `sch_${s.id}_${todayStr}_${nowTime}`;
        if (!triggeredAlarmKeys.has(key)) {
          triggeredAlarmKeys.add(key);
          triggerAlarmModal({
            type: 'schedule',
            title: s.title,
            time: s.startTime,
            categoryId: s.categoryId,
            refId: s.id
          });
        }
      }
    });

    // 2. 루틴 시작 알람 확인
    state.routines.forEach(r => {
      const doneToday = Array.isArray(r.completedDates) && r.completedDates.includes(todayStr);
      if (r.alarm && !doneToday && r.startTime === nowTime) {
        const key = `rtn_${r.id}_${todayStr}_${nowTime}`;
        if (!triggeredAlarmKeys.has(key)) {
          triggeredAlarmKeys.add(key);
          triggerAlarmModal({
            type: 'routine',
            title: r.name,
            time: r.startTime,
            categoryId: r.categoryId,
            refId: r.id
          });
        }
      }
    });
  }

  function triggerAlarmModal(alarmObj) {
    activeAlarmItem = alarmObj;
    const modal = document.getElementById('alarmModal');
    document.getElementById('alarmModalTitle').textContent = alarmObj.title;
    document.getElementById('alarmModalTime').textContent = `예정 시각 ${alarmObj.time}`;
    modal.classList.remove('hidden');

    const announceAlarm = () => {
      playChimeSound('alarm');
      speakKorean(`알람 시간입니다. ${alarmObj.title}을 시작할 시간입니다.`);
      sendBrowserNotification('타임플로우 정각 알람', `${alarmObj.title} · ${alarmObj.time} 시작할 시간입니다!`);
    };

    announceAlarm();

    // 미확인 시 3분 간격으로 반복 리마인드
    clearInterval(alarmRepeatIntervalId);
    alarmRepeatIntervalId = setInterval(() => {
      if (!modal.classList.contains('hidden')) {
        announceAlarm();
      } else {
        clearInterval(alarmRepeatIntervalId);
      }
    }, 180000);
  }

  function closeAlarmModal() {
    document.getElementById('alarmModal').classList.add('hidden');
    clearInterval(alarmRepeatIntervalId);
  }

  // -------------------- Cloudflare Gemini AI 연동 및 오프라인 스마트 폴백 --------------------
  async function callCloudflareAi(action, payload) {
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.ok && data.result) return data.result;
      return null;
    } catch (_) {
      return null;
    }
  }

  // AI 스마트 입력 처리
  async function handleAiSmartParse() {
    const inputEl = document.getElementById('quickInputText');
    const text = inputEl.value.trim();
    if (!text) {
      showToast('먼저 등록할 일정이나 할 일, 시간 기록 문장을 입력해 주세요.');
      return;
    }

    const btn = document.getElementById('aiSmartParseBtn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'AI 분석 중...';

    const aiRes = await callCloudflareAi('parse_quick_input', {
      text,
      todayDate: selectedDate,
      currentTime: getNowTimeStr(),
      categories: state.categories
    });

    if (aiRes) {
      let addedCount = 0;
      if (Array.isArray(aiRes.schedules)) {
        aiRes.schedules.forEach(s => {
          state.schedules.push({
            id: uid('sch'),
            title: s.title || '새 일정',
            date: s.date || selectedDate,
            startTime: s.startTime || '09:00',
            endTime: s.endTime || '10:00',
            categoryId: s.categoryId || state.categories[0].id,
            alarm: s.alarm !== false,
            important: Boolean(s.important),
            completed: false
          });
          addedCount++;
        });
      }
      if (Array.isArray(aiRes.todos)) {
        aiRes.todos.forEach(t => {
          state.todos.push({
            id: uid('todo'),
            title: t.title || '새 할 일',
            dueDate: t.dueDate || selectedDate,
            categoryId: t.categoryId || state.categories[0].id,
            estimatedMinutes: Number(t.estimatedMinutes || 30),
            important: Boolean(t.important),
            completed: false
          });
          addedCount++;
        });
      }
      if (Array.isArray(aiRes.actualLogs)) {
        aiRes.actualLogs.forEach(a => {
          state.actualLogs.push({
            id: uid('act'),
            title: a.title || '실제 기록',
            date: a.date || selectedDate,
            startTime: a.startTime || '14:00',
            endTime: a.endTime || '15:00',
            categoryId: a.categoryId || state.categories[0].id
          });
          addedCount++;
        });
      }
      inputEl.value = '';
      saveState();
      renderAll();
      showToast(aiRes.summary || `AI가 총 ${addedCount}건의 항목을 분류해 등록했습니다.`);
    } else {
      // 로컬 다중 문장 폴백 파서 (쉼표 또는 '그리고'로 분리)
      const segments = text.split(/,|그리고|및/).map(s => s.trim()).filter(Boolean);
      segments.forEach(seg => {
        const parsed = parseNaturalQuickInput(seg, 'auto', document.getElementById('quickCategorySelect').value);
        if (parsed) applyParsedQuickItem(parsed);
      });
      inputEl.value = '';
      saveState();
      renderAll();
      showToast(`${segments.length}건의 항목을 스마트 분류해 등록했습니다.`);
    }

    btn.disabled = false;
    btn.innerHTML = origHtml;
  }

  function applyParsedQuickItem(parsed) {
    if (!parsed) return;
    if (parsed.type === 'actual') {
      state.actualLogs.push({
        id: uid('act'),
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        categoryId: parsed.categoryId
      });
    } else if (parsed.type === 'schedule') {
      state.schedules.push({
        id: uid('sch'),
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        categoryId: parsed.categoryId,
        alarm: true,
        important: parsed.important,
        completed: false
      });
    } else {
      state.todos.push({
        id: uid('todo'),
        title: parsed.title,
        dueDate: parsed.date,
        categoryId: parsed.categoryId,
        estimatedMinutes: 30,
        important: parsed.important,
        completed: false
      });
    }
  }

  // AI 맞춤 루틴 자동 생성
  async function handleAiGenerateRoutine() {
    const inputEl = document.getElementById('aiRoutinePromptInput');
    const requestText = inputEl.value.trim();
    if (!requestText) {
      showToast('만들고 싶은 루틴의 목적이나 시간대를 입력해 주세요.');
      return;
    }

    const btn = document.getElementById('aiGenerateRoutineBtn');
    btn.disabled = true;
    btn.textContent = '루틴 설계 중...';

    const aiRes = await callCloudflareAi('generate_routine', {
      requestText,
      categories: state.categories
    });

    let newRoutine = null;
    if (aiRes && Array.isArray(aiRes.steps) && aiRes.steps.length > 0) {
      newRoutine = {
        id: uid('rtn'),
        name: aiRes.name || 'AI 맞춤 루틴',
        categoryId: aiRes.categoryId || 'cat_routine',
        startTime: aiRes.startTime || '08:00',
        alarm: true,
        completedDates: [],
        steps: aiRes.steps.map(st => ({
          id: uid('st'),
          title: st.title || '단계 행동',
          minutes: Math.max(1, Number(st.minutes || 5)),
          tip: st.tip || ''
        }))
      };
    } else {
      // 내장 스마트 루틴 생성기 폴백
      newRoutine = {
        id: uid('rtn'),
        name: requestText.slice(0, 22),
        categoryId: 'cat_routine',
        startTime: '08:00',
        alarm: true,
        completedDates: [],
        steps: [
          { id: uid('st'), title: '주변 환경 정리 및 물 한 잔 준비', minutes: 3, tip: '시작 신호를 몸에 보내는 가벼운 첫 단계입니다.' },
          { id: uid('st'), title: `${requestText} 핵심 행동 집중 실행`, minutes: 15, tip: '타이머가 도는 동안 한 가지에만 몰입합니다.' },
          { id: uid('st'), title: '마무리 점검 및 기록 체크', minutes: 3, tip: '가볍게 성취감을 느끼며 마무리하세요.' }
        ]
      };
    }

    state.routines.unshift(newRoutine);
    inputEl.value = '';
    saveState();
    renderAll();
    startRoutinePlayer(newRoutine.id);
    showToast(`'${newRoutine.name}' 루틴이 생성되어 플레이어에 준비되었습니다!`);

    btn.disabled = false;
    btn.textContent = 'AI 루틴 생성';
  }

  // AI 남은 일정 원클릭 재배치
  async function handleAiRescheduleDay() {
    const btn = document.getElementById('aiRescheduleBtn');
    btn.disabled = true;
    btn.textContent = '재배치 계산 중...';

    const pendingSchedules = state.schedules.filter(s => s.date === selectedDate && !s.completed);
    const pendingTodos = state.todos.filter(t => !t.completed && (t.dueDate === selectedDate || !t.dueDate));

    const aiRes = await callCloudflareAi('reschedule_day', {
      currentTime: getNowTimeStr(),
      todayDate: selectedDate,
      schedules: pendingSchedules,
      todos: pendingTodos
    });

    if (aiRes && Array.isArray(aiRes.rearrangedSchedules) && aiRes.rearrangedSchedules.length > 0) {
      // 기존 오늘 미완료 일정 제거 후 재배치 일정 반영
      state.schedules = state.schedules.filter(s => !(s.date === selectedDate && !s.completed));
      aiRes.rearrangedSchedules.forEach(rs => {
        state.schedules.push({
          id: uid('sch'),
          title: rs.title,
          date: selectedDate,
          startTime: rs.startTime || '15:00',
          endTime: rs.endTime || '16:00',
          categoryId: rs.categoryId || state.categories[0].id,
          alarm: true,
          important: Boolean(rs.important),
          completed: false
        });
      });
      saveState();
      renderAll();
      showToast(aiRes.advice || '남은 하루 시간대에 맞춰 미완료 일정을 최적 재배치했습니다.');
    } else {
      // 내장 스마트 재배치 알고리즘: 현재 시각 이후 다음 정각부터 중요도 순으로 1시간씩 순차 배치
      const nowMins = Math.max(9 * 60, timeToMinutes(getNowTimeStr()));
      let cursorMins = Math.ceil(nowMins / 30) * 30;
      const sorted = [...pendingSchedules].sort((a, b) => Number(b.important) - Number(a.important));

      sorted.forEach(s => {
        const dur = durationMinutes(s.startTime, s.endTime);
        if (cursorMins + dur <= 23 * 60) {
          s.startTime = minutesToTime(cursorMins);
          s.endTime = minutesToTime(cursorMins + dur);
          cursorMins += dur + 15; // 15분 휴식 버퍼 자동 삽입
        } else {
          // 오늘 밤 11시를 넘기면 내일로 자동 이월
          s.date = addDaysStr(selectedDate, 1);
        }
      });

      saveState();
      renderAll();
      showToast('현재 시각 기준으로 남은 일정을 15분 여유 버퍼와 함께 재배치했습니다.');
    }

    btn.disabled = false;
    btn.textContent = 'AI 남은 일정 재배치';
  }

  // AI 심층 시간 분석 보고서 & 다음 달 목표 역산 설계
  async function handleGenerateAiReport(isReverseGoalDesign = false) {
    const stats = computeReportStatistics();
    const wishInput = document.getElementById('nextMonthWishInput');
    const userGoalWish = wishInput ? wishInput.value.trim() : '';

    const btn = document.getElementById(isReverseGoalDesign ? 'aiDesignNextMonthBtn' : 'generateAiReportBtn');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'AI 분석 중...';

    const aiRes = await callCloudflareAi('analyze_report', {
      monthLabel: selectedDate.slice(0, 7),
      statsSummary: stats,
      userGoalWish,
      categories: state.categories
    });

    const reportData = aiRes || buildLocalSmartReport(stats, userGoalWish);

    const box = document.getElementById('aiReportResultBox');
    if (box) {
      box.innerHTML = `
        <div class="ai-report-block">
          <h4>시간 사용 총평</h4>
          <p><strong>${escapeHtml(reportData.headline)}</strong></p>
        </div>
        <div class="ai-report-block">
          <h4>계획 대비 실행 및 시간 누수 진단</h4>
          <p>${escapeHtml(reportData.timeLeakAnalysis)}</p>
        </div>
        <div class="ai-report-block">
          <h4>골든타임 및 루틴 강점 분석</h4>
          <p>${escapeHtml(reportData.goldenTimeAnalysis)}</p>
        </div>
        <div class="ai-report-block">
          <h4>추천 회고 초안 및 다음 달 액션 플랜</h4>
          <p>• 유지할 점: ${escapeHtml(reportData.keep)}<br/>
             • 개선할 점: ${escapeHtml(reportData.problem)}<br/>
             • 다음 달 전략: ${escapeHtml(reportData.tryAction)}</p>
        </div>
        <div style="margin-top:12px;display:flex;justify-content:flex-end;">
          <button type="button" id="applyAiReportToPlanBtn" class="btn-primary btn-xs">회고 노트 및 다음 달 목표 예산에 즉시 반영</button>
        </div>
      `;

      document.getElementById('applyAiReportToPlanBtn').addEventListener('click', () => {
        state.reviewNotes.keep = reportData.keep || state.reviewNotes.keep;
        state.reviewNotes.problem = reportData.problem || state.reviewNotes.problem;
        state.reviewNotes.tryAction = reportData.tryAction || state.reviewNotes.tryAction;

        if (Array.isArray(reportData.recommendedBudgets)) {
          reportData.recommendedBudgets.forEach(rb => {
            if (rb.categoryId && rb.monthlyHours !== undefined) {
              state.timeBudgets[rb.categoryId] = Number(rb.monthlyHours);
            }
          });
        }
        if (Array.isArray(reportData.recommendedGoals)) {
          reportData.recommendedGoals.forEach(gText => {
            if (gText && !state.monthlyGoals.some(mg => mg.title === gText)) {
              state.monthlyGoals.push({
                id: uid('mg'),
                title: gText,
                categoryId: state.categories[1]?.id || state.categories[0].id,
                done: false
              });
            }
          });
        }
        saveState();
        renderReportAndGoalsTab();
        showToast('AI 분석 결과가 우측 회고 노트와 다음 달 시간 예산·목표에 반영되었습니다!');
      });
    }

    if (isReverseGoalDesign) {
      // 역산 설계 버튼을 누른 경우 즉시 우측 예산/목표에도 반영
      const applyBtn = document.getElementById('applyAiReportToPlanBtn');
      if (applyBtn) applyBtn.click();
    } else {
      showToast('타임트래커 데이터 기반 AI 심층 분석 보고서가 완성되었습니다.');
    }

    btn.disabled = false;
    btn.textContent = origText;
  }

  function buildLocalSmartReport(stats, userGoalWish) {
    const sortedActual = [...stats.byCategory].sort((a, b) => b.actualMinutes - a.actualMinutes);
    const topCat = sortedActual[0] || { name: '업무', actualMinutes: 120 };
    const lowCat = sortedActual[sortedActual.length - 1] || { name: '자기계발', actualMinutes: 30 };
    const totalHrs = (stats.totalActualMinutes / 60).toFixed(1);

    return {
      headline: `총 ${totalHrs}시간의 실제 기록 중 '${topCat.name}' 비중이 가장 높으며, ${stats.goldenTimeLabel}에 최고의 몰입도를 보였습니다.`,
      timeLeakAnalysis: `'${topCat.name}' 영역은 계획 대비 안정적으로 실행되고 있으나, 오후 늦은 시간대 일정이 길어질 때 '${lowCat.name}' 실행 시간이 줄어드는 패턴이 관찰됩니다.`,
      goldenTimeAnalysis: `${stats.goldenTimeLabel} 구간의 계획 일치율이 가장 높습니다. 가장 에너지가 필요한 핵심 과업을 이 골든타임에 고정 배치하면 달성률을 크게 높일 수 있습니다.`,
      keep: `${stats.goldenTimeLabel} 집중 시간대 활용과 루틴 타이머를 통한 실제 사용 시간 기록 습관`,
      problem: `일정 사이 여유 버퍼가 부족해 앞 일정이 지연될 때 저녁 시간대 목표가 밀리는 현상`,
      tryAction: userGoalWish
        ? `'${userGoalWish}' 달성을 위해 평일 저녁 40분 전용 루틴을 신설하고 일정 사이 15분 버퍼 두기`
        : `다음 달에는 '${lowCat.name}' 카테고리의 주간 최소 시간 예산을 먼저 확보하고 루티너리 타이머로 시작 장벽 낮추기`,
      recommendedBudgets: stats.byCategory.map(c => ({
        categoryId: c.id,
        monthlyHours: Math.max(15, Math.round((c.actualMinutes / 60) * 1.2) + 10)
      })),
      recommendedGoals: userGoalWish
        ? [userGoalWish, `${stats.goldenTimeLabel} 핵심 딥워크 루틴 주 4회 실행`]
        : [`${lowCat.name} 월 25시간 이상 확보하기`, `매일 저녁 타임트래커 3분 마감 점검 실천`]
    };
  }

  // -------------------- 모달 열기·닫기·편집 핸들러 --------------------
  function openItemModalForCreate(type, startTime = '09:00', endTime = '10:00') {
    document.getElementById('itemModalHeading').textContent =
      type === 'actual' ? '실제 사용 시간 기록 추가' : type === 'todo' ? '할 일 추가' : '계획 일정 추가';
    document.getElementById('itemModalId').value = '';
    document.getElementById('itemModalType').value = type;
    document.getElementById('itemModalTitle').value = '';
    document.getElementById('itemModalDate').value = selectedDate;
    document.getElementById('itemModalStartTime').value = startTime;
    document.getElementById('itemModalEndTime').value = endTime;
    document.getElementById('itemModalAlarm').checked = true;
    document.getElementById('itemModalImportant').checked = false;
    document.getElementById('itemModalDeleteBtn').classList.add('hidden');
    toggleItemModalTimeVisibility(type);
    document.getElementById('itemModal').classList.remove('hidden');
  }

  function openItemModalForEdit(type, item) {
    document.getElementById('itemModalHeading').textContent = '항목 상세 편집';
    document.getElementById('itemModalId').value = item.id;
    document.getElementById('itemModalType').value = type;
    document.getElementById('itemModalTitle').value = item.title || '';
    document.getElementById('itemModalDate').value = item.date || item.dueDate || selectedDate;
    document.getElementById('itemModalCategory').value = item.categoryId || state.categories[0].id;
    document.getElementById('itemModalStartTime').value = item.startTime || '09:00';
    document.getElementById('itemModalEndTime').value = item.endTime || '10:00';
    document.getElementById('itemModalAlarm').checked = item.alarm !== false;
    document.getElementById('itemModalImportant').checked = Boolean(item.important);
    document.getElementById('itemModalDeleteBtn').classList.remove('hidden');
    toggleItemModalTimeVisibility(type);
    document.getElementById('itemModal').classList.remove('hidden');
  }

  function toggleItemModalTimeVisibility(type) {
    const timeRow = document.getElementById('itemModalTimeRow');
    if (timeRow) {
      if (type === 'todo') timeRow.classList.add('hidden');
      else timeRow.classList.remove('hidden');
    }
  }

  // 루틴 생성·편집 모달
  function openRoutineModalForEdit(rtn = null) {
    const isEdit = Boolean(rtn);
    document.getElementById('routineModalHeading').textContent = isEdit ? '루틴 편집' : '새 루틴 만들기';
    document.getElementById('routineModalId').value = isEdit ? rtn.id : '';
    document.getElementById('routineModalName').value = isEdit ? rtn.name : '';
    document.getElementById('routineModalCategory').value = isEdit ? rtn.categoryId : state.categories[0].id;
    document.getElementById('routineModalTime').value = isEdit ? rtn.startTime || '07:00' : '07:00';
    document.getElementById('routineModalAlarm').checked = isEdit ? rtn.alarm !== false : true;

    const delBtn = document.getElementById('routineModalDeleteBtn');
    if (isEdit) delBtn.classList.remove('hidden');
    else delBtn.classList.add('hidden');

    const container = document.getElementById('routineStepRowsContainer');
    container.innerHTML = '';
    const steps = isEdit && rtn.steps.length > 0
      ? rtn.steps
      : [
          { title: '첫 번째 행동', minutes: 5, tip: '' },
          { title: '두 번째 행동', minutes: 10, tip: '' }
        ];
    steps.forEach(st => appendRoutineStepEditorRow(st.title, st.minutes, st.tip));

    document.getElementById('routineModal').classList.remove('hidden');
  }

  function appendRoutineStepEditorRow(title = '', minutes = 5, tip = '') {
    const container = document.getElementById('routineStepRowsContainer');
    const row = document.createElement('div');
    row.className = 'step-edit-row';
    row.innerHTML = `
      <input type="text" class="step-row-title" placeholder="행동 이름" value="${escapeHtml(title)}" required />
      <input type="number" class="step-row-mins" min="1" max="180" value="${Number(minutes || 5)}" title="목표 시간(분)" />
      <span style="font-size:0.78rem;color:#64748B;">분</span>
      <input type="text" class="step-row-tip" placeholder="음성 안내 팁" value="${escapeHtml(tip || '')}" />
      <button type="button" class="btn-xs btn-danger-ghost step-row-del">&times;</button>
    `;
    row.querySelector('.step-row-del').addEventListener('click', () => {
      if (container.querySelectorAll('.step-edit-row').length > 1) {
        row.remove();
      } else {
        showToast('루틴에는 최소 1개 이상의 행동 단계가 필요합니다.');
      }
    });
    container.appendChild(row);
  }

  // 카테고리 편집 모달 렌더링
  function renderCategoryEditorModal() {
    const list = document.getElementById('categoryEditorList');
    if (!list) return;
    list.innerHTML = '';

    state.categories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'cat-edit-row';
      row.innerHTML = `
        <input type="color" value="${cat.color}" aria-label="색상 변경" />
        <input type="text" value="${escapeHtml(cat.name)}" aria-label="카테고리 이름" />
        <button type="button" class="btn-xs btn-danger-ghost">삭제</button>
      `;

      const colorInput = row.querySelector('input[type="color"]');
      const nameInput = row.querySelector('input[type="text"]');
      const delBtn = row.querySelector('button');

      colorInput.addEventListener('change', () => {
        cat.color = colorInput.value;
        saveState();
        renderAll();
      });

      nameInput.addEventListener('change', () => {
        const v = nameInput.value.trim();
        if (v) {
          cat.name = v;
          saveState();
          renderAll();
        }
      });

      delBtn.addEventListener('click', () => {
        if (state.categories.length <= 2) {
          showToast('최소 2개 이상의 카테고리는 유지되어야 합니다.');
          return;
        }
        state.categories = state.categories.filter(c => c.id !== cat.id);
        saveState();
        renderCategoryEditorModal();
        renderAll();
      });

      list.appendChild(row);
    });
  }

  // -------------------- 클라우드 동기화 (Supabase 직접 + Worker 하이브리드) --------------------
  async function syncToCloud(action = 'save') {
    const codeInput = document.getElementById('cloudSyncCodeInput');
    const statusEl = document.getElementById('cloudSyncStatusText');
    const rawCode = String(codeInput.value || state.settings.syncCode || '').trim().toUpperCase();

    if (rawCode.length < 3) {
      showToast('동기화 코드를 3글자 이상 입력해 주세요.');
      return;
    }

    state.settings.syncCode = rawCode;
    saveState();

    const dbKey = `TIMEFLOW:${rawCode}`;
    statusEl.textContent = action === 'save' ? '클라우드에 업로드 중...' : '클라우드에서 불러오는 중...';

    try {
      if (action === 'save') {
        const nowIso = new Date().toISOString();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/escape_rooms`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            code: dbKey,
            room_data: state,
            updated_at: nowIso
          })
        });
        if (!res.ok) throw new Error('업로드 실패');
        statusEl.textContent = `클라우드 업로드 완료 · ${new Date().toLocaleTimeString()}`;
        showToast(`동기화 코드 '${rawCode}'로 클라우드 저장이 완료되었습니다.`);
      } else {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/escape_rooms?code=eq.${encodeURIComponent(dbKey)}&select=room_data,updated_at`,
          {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`
            }
          }
        );
        if (!res.ok) throw new Error('조회 실패');
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0 || !rows[0].room_data) {
          statusEl.textContent = '해당 동기화 코드로 저장된 데이터가 없습니다.';
          showToast('해당 코드로 저장된 클라우드 데이터를 찾지 못했습니다.');
          return;
        }
        state = {
          ...createInitialState(),
          ...rows[0].room_data
        };
        saveState();
        renderAll();
        statusEl.textContent = `클라우드 동기화 완료 · ${new Date().toLocaleTimeString()}`;
        showToast('클라우드에서 최신 일정 · 루틴 · 타임트래커 데이터를 불러왔습니다!');
      }
    } catch (_) {
      statusEl.textContent = '네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
      showToast('클라우드 동기화 중 일시적인 통신 오류가 발생했습니다.');
    }
  }

  // -------------------- 예시 기록 풍부하게 채우기 (타임트래커 분석 체험용) --------------------
  function populateRichSampleReportLogs() {
    const today = getTodayStr();
    const sampleItems = [
      { daysAgo: 2, title: '주간 핵심 프로젝트 개발', start: '09:00', end: '12:00', cat: 'cat_work' },
      { daysAgo: 2, title: '직무 역량 강의 수강 및 요약', start: '14:00', end: '16:00', cat: 'cat_study' },
      { daysAgo: 2, title: '근력 및 코어 운동', start: '19:00', end: '20:10', cat: 'cat_health' },
      { daysAgo: 3, title: '기획서 작성 및 데이터 정리', start: '09:30', end: '12:30', cat: 'cat_work' },
      { daysAgo: 3, title: '모닝 개운 루틴 완주', start: '07:00', end: '07:30', cat: 'cat_routine' },
      { daysAgo: 3, title: '저녁 독서 및 회고', start: '21:00', end: '22:30', cat: 'cat_study' },
      { daysAgo: 4, title: '팀 협업 미팅 및 피드백 반영', start: '10:00', end: '13:00', cat: 'cat_work' },
      { daysAgo: 4, title: '러닝 5km 및 스트레칭', start: '18:30', end: '19:40', cat: 'cat_health' },
      { daysAgo: 5, title: '집중 코딩 및 사이드 프로젝트', start: '09:00', end: '12:00', cat: 'cat_study' },
      { daysAgo: 5, title: '충전 및 영화 감상', start: '20:00', end: '22:00', cat: 'cat_rest' }
    ];

    sampleItems.forEach(item => {
      const dStr = addDaysStr(today, -item.daysAgo);
      state.schedules.push({
        id: uid('sch'),
        title: item.title,
        date: dStr,
        startTime: item.start,
        endTime: item.end,
        categoryId: item.cat,
        alarm: false,
        important: false,
        completed: true
      });
      state.actualLogs.push({
        id: uid('act'),
        title: item.title,
        date: dStr,
        startTime: item.start,
        endTime: item.end,
        categoryId: item.cat
      });
    });

    saveState();
    renderAll();
    showToast('이번 달 타임트래커 예시 기록 10건이 추가되어 분석 차트가 업데이트되었습니다.');
  }

  // -------------------- 탭 전환 및 유틸리티 --------------------
  function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-view').forEach(sec => {
      sec.classList.toggle('active', sec.id === `tab-${tabName}`);
    });
  }

  function updateTtsButtonUI() {
    const btn = document.getElementById('ttsToggleBtn');
    const label = document.getElementById('ttsStatusLabel');
    if (!btn || !label) return;
    btn.classList.toggle('active', state.settings.ttsEnabled);
    label.textContent = state.settings.ttsEnabled ? '음성 안내 켜짐' : '음성 안내 꺼짐';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // -------------------- 이벤트 리스너 바인딩 --------------------
  function bindEvents() {
    // 메인 탭 전환
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
        renderAll();
      });
    });

    // 상단 음성 안내 토글
    document.getElementById('ttsToggleBtn').addEventListener('click', () => {
      state.settings.ttsEnabled = !state.settings.ttsEnabled;
      saveState();
      updateTtsButtonUI();
      if (state.settings.ttsEnabled) {
        speakKorean('한국어 음성 안내가 켜졌습니다.');
      }
    });

    // 알람 즉시 테스트 버튼
    document.getElementById('testAlarmBtn').addEventListener('click', () => {
      triggerAlarmModal({
        type: 'schedule',
        title: '알람 사운드 및 한국어 음성 안내 테스트',
        time: getNowTimeStr(),
        categoryId: state.categories[0].id,
        refId: ''
      });
    });

    // 초고속 입력 바 실시간 프리뷰 & 제출
    const quickInputEl = document.getElementById('quickInputText');
    const quickModeEl = document.getElementById('quickInputMode');
    const quickCatEl = document.getElementById('quickCategorySelect');
    const previewEl = document.getElementById('quickParsePreview');

    const updatePreview = () => {
      const parsed = parseNaturalQuickInput(quickInputEl.value, quickModeEl.value, quickCatEl.value);
      if (!parsed) {
        previewEl.textContent = '시간이나 #카테고리를 포함해 입력하면 자동으로 분류됩니다.';
        return;
      }
      const cat = getCategoryById(parsed.categoryId);
      const typeLabel =
        parsed.type === 'actual' ? '실제 기록' : parsed.type === 'schedule' ? '계획 일정' : '할 일';
      previewEl.textContent = `[${typeLabel}] ${parsed.date} ${parsed.type !== 'todo' ? `${parsed.startTime}~${parsed.endTime}` : ''} · ${parsed.title} · ${cat.name}`;
    };

    quickInputEl.addEventListener('input', updatePreview);
    quickModeEl.addEventListener('change', updatePreview);
    quickCatEl.addEventListener('change', updatePreview);

    document.querySelectorAll('.chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        quickInputEl.value = `${chip.dataset.insert}${quickInputEl.value}`;
        quickInputEl.focus();
        updatePreview();
      });
    });

    document.getElementById('quickInputForm').addEventListener('submit', e => {
      e.preventDefault();
      const parsed = parseNaturalQuickInput(quickInputEl.value, quickModeEl.value, quickCatEl.value);
      if (!parsed) return;
      applyParsedQuickItem(parsed);
      quickInputEl.value = '';
      updatePreview();
      saveState();
      renderAll();
      showToast(`'${parsed.title}' 항목이 등록되었습니다.`);
    });

    document.getElementById('aiSmartParseBtn').addEventListener('click', handleAiSmartParse);

    // 날짜 이동 버튼
    document.getElementById('prevDayBtn').addEventListener('click', () => {
      selectedDate = addDaysStr(selectedDate, -1);
      renderAll();
    });
    document.getElementById('nextDayBtn').addEventListener('click', () => {
      selectedDate = addDaysStr(selectedDate, 1);
      renderAll();
    });
    document.getElementById('goTodayBtn').addEventListener('click', () => {
      selectedDate = getTodayStr();
      miniCalCursor = new Date();
      renderAll();
    });
    document.getElementById('miniCalPrevBtn').addEventListener('click', () => {
      miniCalCursor = new Date(miniCalCursor.getFullYear(), miniCalCursor.getMonth() - 1, 1);
      renderMiniCalendar();
    });
    document.getElementById('miniCalNextBtn').addEventListener('click', () => {
      miniCalCursor = new Date(miniCalCursor.getFullYear(), miniCalCursor.getMonth() + 1, 1);
      renderMiniCalendar();
    });

    // 할 일 필터 탭
    document.querySelectorAll('#todoFilterTabs .filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#todoFilterTabs .filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTodoFilter = btn.dataset.filter;
        renderTodoList();
      });
    });

    // 일정 / 실제 기록 / 할 일 모달 열기 버튼
    document.getElementById('openAddTodoModalBtn').addEventListener('click', () => openItemModalForCreate('todo'));
    document.getElementById('openAddScheduleBtn').addEventListener('click', () => openItemModalForCreate('schedule'));
    document.getElementById('openAddActualBtn').addEventListener('click', () => openItemModalForCreate('actual'));
    document.getElementById('aiRescheduleBtn').addEventListener('click', handleAiRescheduleDay);

    document.getElementById('itemModalType').addEventListener('change', e => {
      toggleItemModalTimeVisibility(e.target.value);
    });

    // 항목 저장 및 삭제
    document.getElementById('itemModalForm').addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('itemModalId').value;
      const type = document.getElementById('itemModalType').value;
      const title = document.getElementById('itemModalTitle').value.trim();
      const date = document.getElementById('itemModalDate').value || selectedDate;
      const categoryId = document.getElementById('itemModalCategory').value;
      const startTime = document.getElementById('itemModalStartTime').value || '09:00';
      const endTime = document.getElementById('itemModalEndTime').value || '10:00';
      const alarm = document.getElementById('itemModalAlarm').checked;
      const important = document.getElementById('itemModalImportant').checked;

      // 기존 항목이면 제거 후 재삽입
      if (id) {
        state.schedules = state.schedules.filter(x => x.id !== id);
        state.actualLogs = state.actualLogs.filter(x => x.id !== id);
        state.todos = state.todos.filter(x => x.id !== id);
      }

      if (type === 'schedule') {
        state.schedules.push({
          id: id || uid('sch'),
          title,
          date,
          startTime,
          endTime,
          categoryId,
          alarm,
          important,
          completed: false
        });
      } else if (type === 'actual') {
        state.actualLogs.push({
          id: id || uid('act'),
          title,
          date,
          startTime,
          endTime,
          categoryId
        });
      } else {
        state.todos.push({
          id: id || uid('todo'),
          title,
          dueDate: date,
          categoryId,
          estimatedMinutes: 30,
          important,
          completed: false
        });
      }

      document.getElementById('itemModal').classList.add('hidden');
      saveState();
      renderAll();
      showToast(`'${title}' 항목이 저장되었습니다.`);
    });

    document.getElementById('itemModalDeleteBtn').addEventListener('click', () => {
      const id = document.getElementById('itemModalId').value;
      if (!id) return;
      state.schedules = state.schedules.filter(x => x.id !== id);
      state.actualLogs = state.actualLogs.filter(x => x.id !== id);
      state.todos = state.todos.filter(x => x.id !== id);
      document.getElementById('itemModal').classList.add('hidden');
      saveState();
      renderAll();
      showToast('항목이 삭제되었습니다.');
    });

    // 실시간 타임트래커 스톱워치 버튼
    document.getElementById('startLiveTrackerBtn').addEventListener('click', () => {
      const title = document.getElementById('liveTrackerTitle').value.trim() || '집중 업무 및 학습';
      const catId = document.getElementById('liveTrackerCategory').value;
      startLiveTrackerWith(title, catId);
    });
    document.getElementById('stopLiveTrackerBtn').addEventListener('click', stopLiveTrackerAndRecord);

    // 루티너리 플레이어 컨트롤 버튼
    document.getElementById('playerCompleteStepBtn').addEventListener('click', () => completeCurrentRoutineStep(false));
    document.getElementById('playerSkipStepBtn').addEventListener('click', () => completeCurrentRoutineStep(true));
    document.getElementById('playerAdd5MinBtn').addEventListener('click', () => {
      if (!routinePlayer.running) return;
      routinePlayer.stepTargetSeconds += 300;
      routinePlayer.overtimeNotified = false;
      updateRoutinePlayerUI();
      showToast('현재 행동 목표 시간을 5분 연장했습니다.');
    });
    document.getElementById('playerPauseResumeBtn').addEventListener('click', () => {
      if (!routinePlayer.running) return;
      routinePlayer.paused = !routinePlayer.paused;
      updateRoutinePlayerUI();
    });
    document.getElementById('playerStopRoutineBtn').addEventListener('click', stopRoutinePlayerEarly);

    // 상단 플로팅 배너 버튼
    document.getElementById('bannerCompleteBtn').addEventListener('click', () => {
      if (routinePlayer.running) completeCurrentRoutineStep(false);
      else if (liveTracker.running) stopLiveTrackerAndRecord();
    });
    document.getElementById('bannerPauseBtn').addEventListener('click', () => {
      if (routinePlayer.running) {
        routinePlayer.paused = !routinePlayer.paused;
        updateRoutinePlayerUI();
      }
    });
    document.getElementById('bannerGoPlayerBtn').addEventListener('click', () => {
      if (routinePlayer.running) switchTab('routines');
      else switchTab('dashboard');
    });

    // 루틴 추가 및 AI 루틴 생성
    document.getElementById('dashAddRoutineBtn').addEventListener('click', () => openRoutineModalForEdit(null));
    document.getElementById('openNewRoutineModalBtn').addEventListener('click', () => openRoutineModalForEdit(null));
    document.getElementById('aiGenerateRoutineBtn').addEventListener('click', handleAiGenerateRoutine);
    document.getElementById('addRoutineStepRowBtn').addEventListener('click', () => appendRoutineStepEditorRow('', 5, ''));

    document.getElementById('routineModalForm').addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('routineModalId').value;
      const name = document.getElementById('routineModalName').value.trim();
      const categoryId = document.getElementById('routineModalCategory').value;
      const startTime = document.getElementById('routineModalTime').value || '07:00';
      const alarm = document.getElementById('routineModalAlarm').checked;

      const stepRows = document.querySelectorAll('#routineStepRowsContainer .step-edit-row');
      const steps = Array.from(stepRows)
        .map(row => ({
          id: uid('st'),
          title: row.querySelector('.step-row-title').value.trim(),
          minutes: Math.max(1, Number(row.querySelector('.step-row-mins').value || 5)),
          tip: row.querySelector('.step-row-tip').value.trim()
        }))
        .filter(s => s.title);

      if (id) {
        const target = state.routines.find(r => r.id === id);
        if (target) {
          target.name = name;
          target.categoryId = categoryId;
          target.startTime = startTime;
          target.alarm = alarm;
          target.steps = steps;
        }
      } else {
        state.routines.push({
          id: uid('rtn'),
          name,
          categoryId,
          startTime,
          alarm,
          completedDates: [],
          steps
        });
      }

      document.getElementById('routineModal').classList.add('hidden');
      saveState();
      renderAll();
      showToast(`'${name}' 루틴이 저장되었습니다.`);
    });

    document.getElementById('routineModalDeleteBtn').addEventListener('click', () => {
      const id = document.getElementById('routineModalId').value;
      if (!id) return;
      state.routines = state.routines.filter(r => r.id !== id);
      document.getElementById('routineModal').classList.add('hidden');
      saveState();
      renderAll();
      showToast('루틴이 삭제되었습니다.');
    });

    // 탭 3: 주간·월간 달력 네비게이션
    document.querySelectorAll('[data-calview]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-calview]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCalView = btn.dataset.calview;
        renderCalendarOverviewTab();
      });
    });

    document.getElementById('calPrevBtn').addEventListener('click', () => {
      if (currentCalView === 'month') {
        fullCalCursor = new Date(fullCalCursor.getFullYear(), fullCalCursor.getMonth() - 1, 1);
      } else {
        selectedDate = addDaysStr(selectedDate, -7);
      }
      renderCalendarOverviewTab();
    });
    document.getElementById('calNextBtn').addEventListener('click', () => {
      if (currentCalView === 'month') {
        fullCalCursor = new Date(fullCalCursor.getFullYear(), fullCalCursor.getMonth() + 1, 1);
      } else {
        selectedDate = addDaysStr(selectedDate, 7);
      }
      renderCalendarOverviewTab();
    });

    // 탭 4: 타임트래커 보고서 및 다음 달 목표 이벤트
    document.querySelectorAll('#reportPeriodTabs .filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#reportPeriodTabs .filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentReportPeriod = btn.dataset.period;
        renderReportAndGoalsTab();
      });
    });

    document.getElementById('loadSampleReportDataBtn').addEventListener('click', populateRichSampleReportLogs);
    document.getElementById('generateAiReportBtn').addEventListener('click', () => handleGenerateAiReport(false));
    document.getElementById('aiDesignNextMonthBtn').addEventListener('click', () => handleGenerateAiReport(true));

    document.getElementById('saveReviewNoteBtn').addEventListener('click', () => {
      state.reviewNotes.keep = document.getElementById('reviewKeepInput').value.trim();
      state.reviewNotes.problem = document.getElementById('reviewProblemInput').value.trim();
      state.reviewNotes.tryAction = document.getElementById('reviewTryInput').value.trim();
      saveState();
      showToast('월간 피드백 및 회고 노트가 저장되었습니다.');
    });

    document.getElementById('saveTimeBudgetBtn').addEventListener('click', () => {
      document.querySelectorAll('[data-budget-cat]').forEach(inp => {
        const catId = inp.dataset.budgetCat;
        state.timeBudgets[catId] = Math.max(0, Number(inp.value || 0));
      });
      saveState();
      renderReportAndGoalsTab();
      showToast('다음 달 카테고리별 목표 시간 예산이 저장되었습니다.');
    });

    document.getElementById('addMonthlyGoalForm').addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('newMonthlyGoalInput');
      const catSel = document.getElementById('newMonthlyGoalCategory');
      const title = inp.value.trim();
      if (!title) return;
      state.monthlyGoals.push({
        id: uid('mg'),
        title,
        categoryId: catSel.value || state.categories[0].id,
        done: false
      });
      inp.value = '';
      saveState();
      renderMonthlyGoalList();
      showToast('다음 달 핵심 달성 목표가 추가되었습니다.');
    });

    // 알람 모달 액션
    document.getElementById('alarmStartNowBtn').addEventListener('click', () => {
      const item = activeAlarmItem;
      closeAlarmModal();
      if (!item) return;
      if (item.type === 'routine' && item.refId) {
        switchTab('routines');
        startRoutinePlayer(item.refId);
      } else {
        startLiveTrackerWith(item.title, item.categoryId);
      }
    });

    document.getElementById('alarmSnooze5Btn').addEventListener('click', () => {
      const item = activeAlarmItem;
      closeAlarmModal();
      showToast('5분 뒤에 다시 알람이 울립니다.');
      if (item) {
        setTimeout(() => {
          triggerAlarmModal(item);
        }, 300000);
      }
    });

    document.getElementById('alarmDismissBtn').addEventListener('click', closeAlarmModal);

    // 카테고리 편집 모달
    document.getElementById('openCategoryModalBtn').addEventListener('click', () => {
      renderCategoryEditorModal();
      document.getElementById('categoryModal').classList.remove('hidden');
    });

    document.getElementById('addCategoryForm').addEventListener('submit', e => {
      e.preventDefault();
      const nameEl = document.getElementById('newCategoryName');
      const colorEl = document.getElementById('newCategoryColor');
      const name = nameEl.value.trim();
      if (!name) return;
      state.categories.push({
        id: uid('cat'),
        name,
        color: colorEl.value || '#6366F1'
      });
      nameEl.value = '';
      saveState();
      renderCategoryEditorModal();
      renderAll();
      showToast(`'${name}' 카테고리가 추가되었습니다.`);
    });

    // 동기화 및 백업 모달
    document.getElementById('openSyncModalBtn').addEventListener('click', () => {
      document.getElementById('cloudSyncCodeInput').value = state.settings.syncCode || '';
      document.getElementById('syncModal').classList.remove('hidden');
    });
    document.getElementById('cloudSaveBtn').addEventListener('click', () => syncToCloud('save'));
    document.getElementById('cloudLoadBtn').addEventListener('click', () => syncToCloud('load'));

    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timeflow_backup_${getTodayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('백업 파일이 다운로드되었습니다.');
    });

    document.getElementById('importJsonInput').addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const imported = JSON.parse(String(ev.target.result));
          state = { ...createInitialState(), ...imported };
          saveState();
          renderAll();
          document.getElementById('syncModal').classList.add('hidden');
          showToast('백업 파일을 성공적으로 불러왔습니다!');
        } catch (_) {
          showToast('유효한 JSON 백업 파일이 아닙니다.');
        }
      };
      reader.readAsText(file);
    });

    // 공통 모달 닫기 버튼
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.close;
        document.getElementById(targetId)?.classList.add('hidden');
      });
    });
  }

  // -------------------- 초기화 실행 --------------------
  function init() {
    bindEvents();
    renderAll();
    // 매 15초마다 정각 알람 체크
    setInterval(checkScheduledAlarms, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
