/* ==========================================================================
   타임플로우 (TimeFlow) — 일정 · 루티너리 · 타임트래커 · 월간 분석 및 목표 설계
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'TIMEFLOW_APP_STATE_V1';
  const FIRED_ALARM_STORAGE_KEY = 'TIMEFLOW_FIRED_ALARMS_V1';
  const REPORT_TOGGLE_STORAGE_KEY = 'TIMEFLOW_REPORT_TOGGLE_V1';
  const SUPABASE_URL = 'https://buwyexbkjtnubjjzjgxa.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_9UEw3qlP8N6mss-ECjYrSA_lVs33DzY';

  function sanitizeHexColor(rawColor, fallback = '#4F46E5') {
    const s = String(rawColor || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
    if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
    }
    return fallback;
  }

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

  function addMonthsStr(dateStr, deltaMonths) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetMonthDate = new Date(y, m - 1 + deltaMonths, 1);
    const maxDay = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth() + 1, 0).getDate();
    return toDateStr(new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), Math.min(d, maxDay)));
  }

  function getWeekRangeFromDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    const dayOfWeek = base.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(y, m - 1, d + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const dow = cur.getDay();
      days.push({
        dateObj: cur,
        dateStr: toDateStr(cur),
        dayName: dayNames[dow],
        dayIdx: dow,
        monthDayLabel: `${cur.getMonth() + 1}/${cur.getDate()}`
      });
    }
    return {
      monday,
      sunday,
      startStr: toDateStr(monday),
      endStr: toDateStr(sunday),
      titleLabel: `${monday.getMonth() + 1}월 ${monday.getDate()}일 ~ ${sunday.getMonth() + 1}월 ${sunday.getDate()}일`,
      days
    };
  }

  function getDdayBadgeInfo(targetDateStr, isCompleted) {
    if (isCompleted) return { text: '완료', cls: 'dday-done' };
    if (!targetDateStr) return { text: '기한 미정', cls: 'dday-muted' };
    const today = getTodayStr();
    const [ty, tm, td] = today.split('-').map(Number);
    const [dy, dm, dd] = targetDateStr.split('-').map(Number);
    const t0 = new Date(ty, tm - 1, td).getTime();
    const t1 = new Date(dy, dm - 1, dd).getTime();
    const diffDays = Math.round((t1 - t0) / 86400000);
    if (diffDays === 0) return { text: '오늘 마감', cls: 'dday-today' };
    if (diffDays > 0 && diffDays <= 3) return { text: `D-${diffDays}`, cls: 'dday-soon' };
    if (diffDays > 3) return { text: `D-${diffDays}`, cls: 'dday-future' };
    return { text: `${Math.abs(diffDays)}일 경과`, cls: 'dday-overdue' };
  }

  function getNowTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function getRelativeDateLabelKo(dateStr) {
    const today = getTodayStr();
    if (!dateStr || dateStr === today) return '오늘';
    const [ty, tm, td] = today.split('-').map(Number);
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    if (!dy || !dm || !dd) return '';
    const diffDays = Math.round(
      (new Date(dy, dm - 1, dd).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000
    );
    if (diffDays === 1) return '내일';
    if (diffDays === 2) return '모레';
    if (diffDays === -1) return '어제';
    if (diffDays === -2) return '그제';
    if (diffDays > 0) return `${diffDays}일 후`;
    return `${Math.abs(diffDays)}일 전`;
  }

  function formatShortMonthDayKo(dateStr) {
    if (!dateStr) return '';
    const [, m, d] = dateStr.split('-').map(Number);
    if (!m || !d) return dateStr;
    return `${m}/${d}`;
  }

  function timeToMinutes(tStr) {
    if (typeof tStr !== 'string' || !tStr.includes(':')) return 0;
    const [hRaw, mRaw] = tStr.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    const safeH = Number.isFinite(h) ? Math.max(0, Math.min(23, Math.trunc(h))) : 0;
    const safeM = Number.isFinite(m) ? Math.max(0, Math.min(59, Math.trunc(m))) : 0;
    return safeH * 60 + safeM;
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

  function formatShortDurationKo(mins) {
    const rounded = Math.round(mins);
    if (rounded <= 0) return '0분';
    if (rounded < 60) return `${rounded}분`;
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    if (m === 0) return `${h}시간`;
    if (m === 30) return `${h}.5시간`;
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

  function cleanProjectTag(rawTag) {
    return String(rawTag || '')
      .replace(/^[#@]+/, '')
      .trim();
  }

  function getRepeatLabelKo(repeat, baseDateStr = '') {
    if (!repeat || repeat === 'none') return '';
    if (repeat === 'daily') return '🔁 매일';
    if (repeat === 'weekdays') return '🔁 평일';
    if (repeat === 'weekly') {
      if (baseDateStr && baseDateStr.includes('-')) {
        const [y, m, d] = baseDateStr.split('-').map(Number);
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dow = new Date(y, m - 1, d).getDay();
        return `🔁 매주 ${dayNames[dow]}요일`;
      }
      return '🔁 매주';
    }
    if (repeat === 'monthly') {
      if (baseDateStr && baseDateStr.includes('-')) {
        const dayNum = Number(baseDateStr.split('-')[2]);
        return `🔁 매월 ${dayNum}일`;
      }
      return '🔁 매월';
    }
    return '';
  }

  function doesItemOccurOnDate(item, targetDateStr, isTodo = false) {
    if (!item || !targetDateStr) return false;
    const baseDate = isTodo ? item.dueDate : item.date;
    const repeat = item.repeat || 'none';
    if (repeat === 'none') {
      return baseDate === targetDateStr;
    }

    const [ty, tm, td] = targetDateStr.split('-').map(Number);
    if (!ty || !tm || !td) return false;
    const targetDt = new Date(ty, tm - 1, td);
    const dow = targetDt.getDay();

    if (repeat === 'daily') return true;
    if (repeat === 'weekdays') return dow >= 1 && dow <= 5;
    if (repeat === 'weekly') {
      if (!baseDate || !baseDate.includes('-')) return dow === 1;
      const [by, bm, bd] = baseDate.split('-').map(Number);
      const baseDow = new Date(by, bm - 1, bd).getDay();
      return dow === baseDow;
    }
    if (repeat === 'monthly') {
      if (!baseDate || !baseDate.includes('-')) return td === 1;
      const bd = Number(baseDate.split('-')[2]);
      return td === bd;
    }
    return baseDate === targetDateStr;
  }

  function isItemCompletedOnDate(item, dateStr) {
    if (!item) return false;
    const repeat = item.repeat || 'none';
    if (repeat !== 'none') {
      const target = dateStr || getTodayStr();
      return Array.isArray(item.completedDates) && item.completedDates.includes(target);
    }
    return Boolean(item.completed);
  }

  function setItemCompletedOnDate(item, dateStr, checked) {
    if (!item) return;
    const repeat = item.repeat || 'none';
    if (repeat !== 'none') {
      const target = dateStr || getTodayStr();
      if (!Array.isArray(item.completedDates)) item.completedDates = [];
      if (checked) {
        if (!item.completedDates.includes(target)) item.completedDates.push(target);
      } else {
        item.completedDates = item.completedDates.filter(d => d !== target);
      }
    } else {
      item.completed = Boolean(checked);
    }
  }

  function getNextOccurrenceDateStr(item, fromDateStr, isTodo = false) {
    const baseDate = isTodo ? item.dueDate : item.date;
    const repeat = item.repeat || 'none';
    if (repeat === 'none') return baseDate || fromDateStr;
    const startRef = fromDateStr || getTodayStr();
    for (let i = 0; i < 35; i++) {
      const cand = addDaysStr(startRef, i);
      if (doesItemOccurOnDate(item, cand, isTodo)) return cand;
    }
    return baseDate || startRef;
  }

  function doesRoutineOccurOnDate(rtn, targetDateStr) {
    if (!rtn || !targetDateStr) return false;
    if (!Array.isArray(rtn.activeDays) || rtn.activeDays.length === 0 || rtn.activeDays.length === 7) {
      return true;
    }
    const [ty, tm, td] = targetDateStr.split('-').map(Number);
    if (!ty || !tm || !td) return true;
    const dow = new Date(ty, tm - 1, td).getDay();
    return rtn.activeDays.map(Number).includes(dow);
  }

  function getRoutineDaysLabelKo(rtn) {
    if (!rtn || !Array.isArray(rtn.activeDays) || rtn.activeDays.length === 0 || rtn.activeDays.length === 7) {
      return '매일';
    }
    const sorted = [...new Set(rtn.activeDays.map(Number))].sort((a, b) => a - b);
    const joined = sorted.join(',');
    if (joined === '1,2,3,4,5') return '평일';
    if (joined === '0,6') return '주말';
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `${sorted.map(d => dayNames[d]).join('·')}요일`;
  }

  function getRoutineStartTimeForDate(rtn, targetDateStr) {
    const fallback = (rtn && rtn.startTime) || '07:00';
    if (!rtn || !rtn.useCustomDayTimes || !rtn.dayTimes || !targetDateStr) {
      return fallback;
    }
    const [ty, tm, td] = String(targetDateStr).split('-').map(Number);
    if (!ty || !tm || !td) return fallback;
    const dow = new Date(ty, tm - 1, td).getDay();
    const customTime = rtn.dayTimes[dow] || rtn.dayTimes[String(dow)];
    return customTime && /^\d{2}:\d{2}$/.test(customTime) ? customTime : fallback;
  }

  function formatRoutineScheduleSummaryKo(rtn) {
    const baseTime = (rtn && rtn.startTime) || '07:00';
    const orderRank = d => (d === 0 ? 7 : d);
    const active =
      rtn && Array.isArray(rtn.activeDays) && rtn.activeDays.length > 0
        ? [...new Set(rtn.activeDays.map(Number))].sort((a, b) => orderRank(a) - orderRank(b))
        : [1, 2, 3, 4, 5, 6, 0];

    if (!rtn || !rtn.useCustomDayTimes || !rtn.dayTimes) {
      return `${getRoutineDaysLabelKo(rtn)} · ${baseTime}`;
    }

    const groupsByTime = new Map();
    active.forEach(dow => {
      const t =
        rtn.dayTimes[dow] || rtn.dayTimes[String(dow)] || baseTime;
      const safeT = /^\d{2}:\d{2}$/.test(t) ? t : baseTime;
      if (!groupsByTime.has(safeT)) groupsByTime.set(safeT, []);
      groupsByTime.get(safeT).push(dow);
    });

    if (groupsByTime.size <= 1) {
      const onlyTime = groupsByTime.keys().next().value || baseTime;
      return `${getRoutineDaysLabelKo(rtn)} · ${onlyTime}`;
    }

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const parts = [];
    groupsByTime.forEach((days, timeStr) => {
      const sortedZeroFirst = [...days].sort((a, b) => a - b).join(',');
      let label = '';
      if (sortedZeroFirst === '1,2,3,4,5') label = '평일';
      else if (sortedZeroFirst === '0,6') label = '주말';
      else label = days.map(d => dayNames[d]).join('·');
      parts.push(`${label} ${timeStr}`);
    });
    return parts.join(' · ');
  }

  // -------------------- 초기 기본 상태 생성 --------------------
  const SAMPLE_ITEM_IDS = new Set([
    'sch_1', 'sch_2', 'sch_3', 'sch_4', 'sch_5', 'sch_6', 'sch_7', 'sch_8', 'sch_9', 'sch_10', 'sch_wk_meeting',
    'act_1', 'act_2', 'act_3', 'act_y1', 'act_y2',
    'todo_1', 'todo_2', 'todo_3', 'todo_4', 'todo_5', 'todo_6', 'todo_7', 'todo_wk_notice', 'todo_wk_sync'
  ]);

  const SAMPLE_REPORT_TITLES = new Set([
    '주간 핵심 프로젝트 개발',
    '직무 역량 강의 수강 및 요약',
    '근력 및 코어 운동',
    '기획서 작성 및 데이터 정리',
    '모닝 개운 루틴 완주',
    '저녁 독서 및 회고',
    '팀 협업 미팅 및 피드백 반영',
    '러닝 5km 및 스트레칭',
    '집중 코딩 및 사이드 프로젝트',
    '충전 및 영화 감상'
  ]);

  function createInitialState() {
    const today = getTodayStr();
    const tomorrow = addDaysStr(today, 1);
    const yesterday = addDaysStr(today, -1);

    return {
      updatedAt: '',
      settings: {
        ttsEnabled: true,
        syncCode: '',
        autoSync: true,
        darkMode: false,
        streakDays: 1,
        weeklyMonthlySeeded: true,
        projectTagSeeded: true
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
          projectTag: '',
          repeat: 'daily',
          completedDates: [today, yesterday],
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
          projectTag: '신규런칭',
          repeat: 'none',
          alarm: true,
          important: true,
          completed: true
        },
        {
          id: 'sch_3',
          title: '자료 리서치 및 오후 정기 회의 준비',
          date: today,
          startTime: '14:00',
          endTime: '15:30',
          categoryId: 'cat_work',
          projectTag: '신규런칭',
          repeat: 'none',
          alarm: true,
          important: true,
          completed: false
        },
        {
          id: 'sch_wk_meeting',
          title: '신규 서비스 주간 진행 점검 회의',
          date: today,
          startTime: '16:00',
          endTime: '17:00',
          categoryId: 'cat_work',
          projectTag: '신규런칭',
          repeat: 'weekly',
          completedDates: [],
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
          projectTag: '',
          repeat: 'none',
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
          projectTag: '역량강화',
          repeat: 'none',
          alarm: true,
          important: true,
          completed: false
        },
        {
          id: 'sch_6',
          title: '주간 안내 공지 및 일정 브리핑',
          date: tomorrow,
          startTime: '10:00',
          endTime: '11:00',
          categoryId: 'cat_work',
          projectTag: '정기안내',
          repeat: 'weekly',
          completedDates: [],
          alarm: true,
          important: true,
          completed: false
        },
        {
          id: 'sch_7',
          title: '핵심 역량 온라인 강의 집중 수강',
          date: addDaysStr(today, 2),
          startTime: '20:00',
          endTime: '21:30',
          categoryId: 'cat_study',
          projectTag: '역량강화',
          repeat: 'weekly',
          completedDates: [],
          alarm: true,
          important: true,
          completed: false
        },
        {
          id: 'sch_8',
          title: '월간 프로젝트 중간 발표 및 리뷰',
          date: addDaysStr(today, 4),
          startTime: '14:00',
          endTime: '16:00',
          categoryId: 'cat_work',
          projectTag: '신규런칭',
          repeat: 'none',
          alarm: true,
          important: true,
          completed: false
        },
        {
          id: 'sch_9',
          title: '주말 코어 근력 및 유산소 러닝',
          date: addDaysStr(today, 5),
          startTime: '10:00',
          endTime: '11:30',
          categoryId: 'cat_health',
          projectTag: '',
          repeat: 'weekly',
          completedDates: [],
          alarm: false,
          important: false,
          completed: false
        },
        {
          id: 'sch_10',
          title: '업무 문서 정리 및 이메일 회신',
          date: yesterday,
          startTime: '09:30',
          endTime: '12:00',
          categoryId: 'cat_work',
          projectTag: '정기안내',
          repeat: 'none',
          alarm: false,
          important: false,
          completed: true
        }
      ],
      actualLogs: [
        {
          id: 'act_1',
          title: '모닝 개운 루틴 완주',
          date: today,
          startTime: '07:00',
          endTime: '07:25',
          categoryId: 'cat_routine',
          projectTag: ''
        },
        {
          id: 'act_2',
          title: '핵심 프로젝트 기획안 집중 작성',
          date: today,
          startTime: '09:00',
          endTime: '11:20',
          categoryId: 'cat_work',
          projectTag: '신규런칭'
        },
        {
          id: 'act_3',
          title: '점심 식사 및 산책 휴식',
          date: today,
          startTime: '12:00',
          endTime: '13:00',
          categoryId: 'cat_rest',
          projectTag: ''
        },
        {
          id: 'act_y1',
          title: '업무 문서 정리 및 이메일 회신',
          date: yesterday,
          startTime: '09:30',
          endTime: '12:00',
          categoryId: 'cat_work',
          projectTag: '정기안내'
        },
        {
          id: 'act_y2',
          title: '온라인 강의 수강 및 노트 정리',
          date: yesterday,
          startTime: '20:00',
          endTime: '21:30',
          categoryId: 'cat_study',
          projectTag: '역량강화'
        }
      ],
      todos: [
        {
          id: 'todo_wk_notice',
          title: '매주 정기 안내문 작성 및 공지 발송',
          dueDate: today,
          categoryId: 'cat_work',
          projectTag: '정기안내',
          repeat: 'weekly',
          completedDates: [],
          estimatedMinutes: 25,
          important: true,
          completed: false
        },
        {
          id: 'todo_wk_sync',
          title: '주간 회의록 공유 및 후속 액션 점검',
          dueDate: today,
          categoryId: 'cat_work',
          projectTag: '신규런칭',
          repeat: 'weekly',
          completedDates: [],
          estimatedMinutes: 30,
          important: true,
          completed: false
        },
        {
          id: 'todo_1',
          title: '이번 달 타임트래커 점검 및 예산 확인',
          dueDate: today,
          categoryId: 'cat_study',
          projectTag: '역량강화',
          repeat: 'none',
          estimatedMinutes: 30,
          important: true,
          completed: false
        },
        {
          id: 'todo_2',
          title: '운동화 세탁 맡기기',
          dueDate: today,
          categoryId: 'cat_routine',
          projectTag: '',
          repeat: 'none',
          estimatedMinutes: 20,
          important: false,
          completed: false
        },
        {
          id: 'todo_5',
          title: '기획안 최종본 제출 마감',
          dueDate: tomorrow,
          categoryId: 'cat_work',
          projectTag: '신규런칭',
          repeat: 'none',
          estimatedMinutes: 60,
          important: true,
          completed: false
        },
        {
          id: 'todo_6',
          title: '직무 자격증 모의고사 풀이 마감',
          dueDate: addDaysStr(today, 3),
          categoryId: 'cat_study',
          projectTag: '역량강화',
          repeat: 'weekly',
          completedDates: [],
          estimatedMinutes: 50,
          important: true,
          completed: false
        },
        {
          id: 'todo_7',
          title: '월간 지출 정산 및 영수증 정리',
          dueDate: addDaysStr(today, 6),
          categoryId: 'cat_routine',
          projectTag: '정기안내',
          repeat: 'monthly',
          completedDates: [],
          estimatedMinutes: 30,
          important: false,
          completed: false
        },
        {
          id: 'todo_3',
          title: '다음 분기 읽을 책 리스트 정리',
          dueDate: '',
          categoryId: 'cat_study',
          projectTag: '역량강화',
          repeat: 'none',
          estimatedMinutes: 30,
          important: false,
          completed: false
        },
        {
          id: 'todo_4',
          title: '책상 선정리 및 데스크 셋업 정돈',
          dueDate: '',
          categoryId: 'cat_etc',
          projectTag: '',
          repeat: 'none',
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
          alarmLeadMinutes: 0,
          activeDays: [0, 1, 2, 3, 4, 5, 6],
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
          alarmLeadMinutes: 0,
          activeDays: [1, 2, 3, 4, 5],
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
          alarmLeadMinutes: 0,
          activeDays: [0, 1, 2, 3, 4, 5, 6],
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
      ],
      aiReportsByPeriod: {}
    };
  }

  // -------------------- 전역 런타임 상태 --------------------
  let state = loadState();
  let selectedDate = getTodayStr();
  let miniCalCursor = new Date();
  let fullCalCursor = new Date();
  let reportCursor = new Date();
  let modalRoutineDayTimes = {};

  // 대시보드 중앙 타임라인 뷰 상태
  let dashScope = 'day';
  // 일별·주별 표시 모드: PC는 나란히(both), 모바일은 단일 컬럼 계획(plan) 기본
  let dashTrackMode = typeof window !== 'undefined' && window.innerWidth <= 768 ? 'plan' : 'both';
  let dashMonthMode = 'focus';
  // 모바일 안 B 상단 할 일·루틴 드로어 접힘 상태 (모바일 기본 접힘)
  let mobileTodoFolded = true;

  // 탭 3 주간·월간 전체 조망 상태
  let currentCalView = 'month';
  let calWeekMode = 'both';
  let calWeekLayout = 'board';
  let calMonthMode = 'focus';
  let currentMilestoneFilter = 'all';
  let calSideOpen = false;
  let calToolsOpen = false;

  let currentTodoFilter = 'today';
  let currentReportPeriod = 'thisMonth';
  let selectedProjectTag = '';
  let projectTagBarOpen = false;
  let todoGroupByTag = true;
  let currentSearchTypeFilter = 'all';
  let currentActiveTab = 'dashboard';
  let selectedPreviewRoutineId = '';
  let durationResizeEnabled = false;
  let lastMobileCalViewport = typeof window !== 'undefined' && window.innerWidth <= 768;

  function syncDurationResizeModeUI() {
    document.body.classList.toggle('is-resize-mode', durationResizeEnabled);
    document.querySelectorAll('.js-toggle-resize-mode').forEach(btn => {
      btn.classList.toggle('active', durationResizeEnabled);
      btn.setAttribute('aria-pressed', String(durationResizeEnabled));
      btn.textContent = durationResizeEnabled ? '늘리기 완료' : '시간 늘리기';
    });
  }

  function isMobileCalendarViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
  }

  function loadReportCardOpenMap() {
    const defaults = {
      catShare: true,
      pattern: true,
      aiCoaching: false,
      reviewNote: false,
      timeBudget: false,
      monthlyGoal: false
    };
    try {
      const raw = localStorage.getItem(REPORT_TOGGLE_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(defaults).forEach(k => {
          if (typeof parsed[k] === 'boolean') defaults[k] = parsed[k];
        });
      }
    } catch (_) {}
    return defaults;
  }

  function saveReportCardOpenMap() {
    try {
      localStorage.setItem(REPORT_TOGGLE_STORAGE_KEY, JSON.stringify(reportCardOpenMap));
    } catch (_) {}
  }

  let reportCardOpenMap = loadReportCardOpenMap();

  function syncReportToggleCardsUI() {
    const cards = document.querySelectorAll('.report-toggle-card[data-report-card]');
    let openCount = 0;
    cards.forEach(card => {
      const key = card.dataset.reportCard;
      const isOpen = Boolean(reportCardOpenMap[key]);
      if (isOpen) openCount += 1;
      card.classList.toggle('is-collapsed', !isOpen);
      const head = card.querySelector('.report-toggle-head');
      if (head) {
        head.setAttribute('aria-expanded', String(isOpen));
      }
    });
    const toggleAllBtn = document.getElementById('toggleAllReportCardsBtn');
    if (toggleAllBtn && cards.length > 0) {
      toggleAllBtn.textContent = openCount === cards.length ? '모두 접기' : '모두 펼치기';
    }
  }

  function setReportCardOpen(cardKey, isOpen) {
    if (!cardKey || !(cardKey in reportCardOpenMap)) return;
    reportCardOpenMap[cardKey] = Boolean(isOpen);
    saveReportCardOpenMap();
    syncReportToggleCardsUI();
  }

  let dayDetailDate = '';

  // 모달 · 팝업 창 브라우저 뒤로가기(History API) 연동 스택
  const overlayHistoryStack = [];
  let pushedOverlayHistoryCount = 0;
  let suppressPopStateCount = 0;
  let overlayHistorySyncQueued = false;

  function isMobileMilestoneModalViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= 980;
  }

  function syncOverlayStackZIndex() {
    overlayHistoryStack.forEach((id, idx) => {
      const baseZ = 200 + idx * 10;
      if (id === 'calendarSidePanel') {
        const backdrop = document.getElementById('calendarSideBackdrop');
        const panel = document.getElementById('calendarSidePanel');
        if (backdrop) backdrop.style.zIndex = String(baseZ);
        if (panel) panel.style.zIndex = String(baseZ + 2);
      } else {
        const el = document.getElementById(id);
        if (el) el.style.zIndex = String(baseZ);
      }
    });
  }

  function scheduleOverlayHistorySync() {
    if (overlayHistorySyncQueued) return;
    overlayHistorySyncQueued = true;
    const runSync = () => {
      overlayHistorySyncQueued = false;
      const desiredDepth = overlayHistoryStack.length;
      const topId = desiredDepth > 0 ? overlayHistoryStack[desiredDepth - 1] : null;
      const delta = desiredDepth - pushedOverlayHistoryCount;

      if (delta > 0) {
        for (let i = pushedOverlayHistoryCount; i < desiredDepth; i++) {
          const idAtLevel = overlayHistoryStack[i];
          try {
            history.pushState({ timeflowOverlay: idAtLevel, depth: i + 1 }, '', location.href);
            pushedOverlayHistoryCount++;
          } catch (_) {
            break;
          }
        }
      } else if (delta < 0) {
        pushedOverlayHistoryCount = desiredDepth;
        suppressPopStateCount++;
        try {
          history.go(delta);
        } catch (_) {
          suppressPopStateCount = Math.max(0, suppressPopStateCount - 1);
        }
      } else if (desiredDepth > 0 && topId) {
        try {
          history.replaceState({ timeflowOverlay: topId, depth: desiredDepth }, '', location.href);
        } catch (_) {}
      }
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(runSync);
    } else {
      Promise.resolve().then(runSync);
    }
  }

  function hideOverlayDomOnly(modalId) {
    if (modalId === 'alarmModal') {
      clearInterval(alarmRepeatIntervalId);
    }
    if (modalId === 'calendarSidePanel') {
      calSideOpen = false;
      const panel = document.getElementById('calendarSidePanel');
      const backdrop = document.getElementById('calendarSideBackdrop');
      if (panel) panel.style.zIndex = '';
      if (backdrop) backdrop.style.zIndex = '';
      syncCalendarPanelsUI();
      return;
    }
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.add('hidden');
      el.style.zIndex = '';
    }
  }

  function openModalWindow(modalId) {
    if (modalId === 'calendarSidePanel') {
      calSideOpen = true;
      syncCalendarPanelsUI();
      if (!isMobileMilestoneModalViewport()) {
        return;
      }
    } else {
      const el = document.getElementById(modalId);
      if (!el) return;
      el.classList.remove('hidden');
    }

    const existingIdx = overlayHistoryStack.indexOf(modalId);
    if (existingIdx !== -1) {
      overlayHistoryStack.splice(existingIdx, 1);
    }
    overlayHistoryStack.push(modalId);
    syncOverlayStackZIndex();
    scheduleOverlayHistorySync();
  }

  function closeModalWindow(modalId, options = {}) {
    const fromPopState = Boolean(options && options.fromPopState);
    hideOverlayDomOnly(modalId);

    const idx = overlayHistoryStack.lastIndexOf(modalId);
    if (idx !== -1) {
      overlayHistoryStack.splice(idx, 1);
      syncOverlayStackZIndex();
      if (!fromPopState) {
        scheduleOverlayHistorySync();
      }
    }
  }

  function closeTopModalWindow() {
    if (overlayHistoryStack.length === 0) return false;
    const topId = overlayHistoryStack[overlayHistoryStack.length - 1];
    closeModalWindow(topId);
    return true;
  }

  function handleOverlayPopState() {
    if (suppressPopStateCount > 0) {
      suppressPopStateCount--;
      return;
    }
    if (overlayHistoryStack.length > 0) {
      pushedOverlayHistoryCount = Math.max(0, pushedOverlayHistoryCount - 1);
      const topId = overlayHistoryStack.pop();
      hideOverlayDomOnly(topId);
      syncOverlayStackZIndex();
    }
  }

  function getActiveRealProjectTag() {
    return selectedProjectTag && selectedProjectTag !== '__UNTAGGED__'
      ? cleanProjectTag(selectedProjectTag)
      : '';
  }

  // 실행 취소 히스토리 스택 & 자동 동기화 타이머
  const undoStack = [];
  let autoSyncTimerId = null;
  let lastAutoCloudPullAt = 0;
  let isSyncInFlight = false;
  let lastScrolledTimelineDate = '';

  // 실시간 타임트래커 스톱워치 상태 (할 일·일정 자동 완료 연동 지원)
  let liveTracker = {
    running: false,
    title: '',
    categoryId: 'cat_work',
    projectTag: '',
    linkedRef: null,
    startDateStr: '',
    startTimestamp: null,
    startTimeStr: '',
    elapsedSeconds: 0,
    intervalId: null
  };

  // 루티너리 플레이어 상태 (Date.now() 월클락 타임스탬프 기반)
  let routinePlayer = {
    activeRoutineId: null,
    running: false,
    paused: false,
    stepIndex: 0,
    stepTargetSeconds: 0,
    stepElapsedSeconds: 0,
    totalElapsedSeconds: 0,
    stepStartTimestamp: 0,
    stepBaseElapsedMs: 0,
    totalStartTimestamp: 0,
    totalBaseElapsedMs: 0,
    startDateStr: '',
    routineStartTimeStr: '',
    overtimeNotified: false,
    intervalId: null
  };

  // 알람 엔진 상태
  let triggeredAlarmKeys = loadTriggeredAlarmKeys();
  let activeAlarmItem = null;
  let alarmRepeatIntervalId = null;
  let alarmSnoozeTimeoutId = null;
  let wakeLockSentinel = null;

  function loadTriggeredAlarmKeys() {
    const todayStr = getTodayStr();
    try {
      const raw = sessionStorage.getItem(FIRED_ALARM_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === todayStr && Array.isArray(parsed.keys)) {
        return new Set(parsed.keys);
      }
    } catch (_) {}
    return new Set();
  }

  function markAlarmKeyTriggered(key) {
    const todayStr = getTodayStr();
    // 날짜가 바뀌었으면 이전 키 정리
    for (const existing of Array.from(triggeredAlarmKeys)) {
      if (!existing.includes(todayStr)) {
        triggeredAlarmKeys.delete(existing);
      }
    }
    triggeredAlarmKeys.add(key);
    try {
      sessionStorage.setItem(
        FIRED_ALARM_STORAGE_KEY,
        JSON.stringify({ date: todayStr, keys: Array.from(triggeredAlarmKeys) })
      );
    } catch (_) {}
  }

  function computeRoutineStreakDays() {
    const completedSet = new Set();
    if (Array.isArray(state.routines)) {
      state.routines.forEach(r => {
        if (Array.isArray(r.completedDates)) {
          r.completedDates.forEach(d => {
            if (d) completedSet.add(d);
          });
        }
      });
    }
    if (completedSet.size === 0) return 0;

    const today = getTodayStr();
    const yesterday = addDaysStr(today, -1);
    let cursor = '';
    if (completedSet.has(today)) {
      cursor = today;
    } else if (completedSet.has(yesterday)) {
      cursor = yesterday;
    } else {
      return 0;
    }

    let streak = 0;
    while (completedSet.has(cursor) && streak < 3650) {
      streak += 1;
      cursor = addDaysStr(cursor, -1);
    }
    return streak;
  }

  function pushUndoSnapshot(actionLabel = '') {
    try {
      const snapshot = JSON.stringify({
        schedules: state.schedules,
        actualLogs: state.actualLogs,
        todos: state.todos,
        routines: state.routines,
        categories: state.categories,
        monthlyGoals: state.monthlyGoals
      });
      undoStack.push({ label: actionLabel, snapshot });
      if (undoStack.length > 15) {
        undoStack.shift();
      }
    } catch (_) {}
  }

  function performUndo() {
    if (undoStack.length === 0) {
      showToast('실행 취소할 이전 작업이 없습니다.');
      return;
    }
    try {
      const last = undoStack.pop();
      const restored = JSON.parse(last.snapshot);
      state.schedules = restored.schedules || [];
      state.actualLogs = restored.actualLogs || [];
      state.todos = restored.todos || [];
      state.routines = restored.routines || [];
      state.categories = restored.categories || state.categories;
      state.monthlyGoals = restored.monthlyGoals || [];
      saveState();
      renderAll();
      showToast('방금 수행한 변경 사항을 이전 상태로 복구했습니다.');
    } catch (_) {}
  }

  // -------------------- 저장소 입출력 --------------------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw);
      const fallback = createInitialState();
      const merged = {
        ...fallback,
        ...parsed,
        settings: { ...fallback.settings, ...(parsed.settings || {}) },
        reviewNotes: { ...fallback.reviewNotes, ...(parsed.reviewNotes || {}) },
        timeBudgets: { ...fallback.timeBudgets, ...(parsed.timeBudgets || {}) }
      };
      if (!merged.settings.weeklyMonthlySeeded || !merged.settings.projectTagSeeded) {
        const fallbackSchMap = new Map(fallback.schedules.map(fs => [fs.id, fs]));
        merged.schedules.forEach(s => {
          const ref = fallbackSchMap.get(s.id);
          if (ref) {
            if (!s.projectTag && ref.projectTag) s.projectTag = ref.projectTag;
            if (!s.repeat && ref.repeat) s.repeat = ref.repeat;
          }
        });
        fallback.schedules.forEach(fs => {
          if (!merged.schedules.some(s => s.id === fs.id)) {
            merged.schedules.push(fs);
          }
        });

        const fallbackTodoMap = new Map(fallback.todos.map(ft => [ft.id, ft]));
        merged.todos.forEach(t => {
          const ref = fallbackTodoMap.get(t.id);
          if (ref) {
            if (!t.projectTag && ref.projectTag) t.projectTag = ref.projectTag;
            if (!t.repeat && ref.repeat) t.repeat = ref.repeat;
          }
        });
        fallback.todos.forEach(ft => {
          if (!merged.todos.some(t => t.id === ft.id)) {
            merged.todos.push(ft);
          }
        });

        const fallbackActMap = new Map(fallback.actualLogs.map(fa => [fa.id, fa]));
        merged.actualLogs.forEach(a => {
          const ref = fallbackActMap.get(a.id);
          if (ref && !a.projectTag && ref.projectTag) {
            a.projectTag = ref.projectTag;
          }
        });

        merged.settings.weeklyMonthlySeeded = true;
        merged.settings.projectTagSeeded = true;
      }
      return merged;
    } catch (_) {
      return createInitialState();
    }
  }

  function saveState(options = {}) {
    const { skipAutoSync = false, touchTimestamp = true } = options;
    if (touchTimestamp) {
      state.updatedAt = new Date().toISOString();
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
    if (!skipAutoSync) {
      scheduleAutoCloudSave();
    }
  }

  function getCategoryById(catId) {
    const found = state.categories.find(c => c.id === catId) || state.categories[0];
    if (!found) {
      return {
        id: 'cat_default',
        name: '기본',
        color: '#4F46E5'
      };
    }
    return {
      ...found,
      color: sanitizeHexColor(found.color)
    };
  }

  // -------------------- 사운드(Web Audio API) & 한국어 음성 안내(TTS) · iOS Safari 호환 --------------------
  let audioCtx = null;
  let audioUnlockedOnce = false;
  let cachedKoreanVoice = null;

  function refreshKoreanSpeechVoice() {
    if (!('speechSynthesis' in window)) return;
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      if (voices.length > 0) {
        cachedKoreanVoice =
          voices.find(v => /^ko[-_]KR/i.test(v.lang)) ||
          voices.find(v => /^ko/i.test(v.lang)) ||
          null;
      }
    } catch (_) {}
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try {
          audioCtx = new Ctx();
        } catch (_) {}
      }
    }
    // iOS Safari는 화면 잠금·전화·백그라운드 복귀 후 state가 'interrupted'가 될 수 있음
    if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
      audioCtx.resume().catch(() => {});
    }
  }

  function unlockAudioOnUserGesture() {
    try {
      ensureAudioContext();
      if (audioCtx && !audioUnlockedOnce) {
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        if (typeof source.start === 'function') source.start(0);
        audioUnlockedOnce = true;
      }
      if (!cachedKoreanVoice) {
        refreshKoreanSpeechVoice();
      }
    } catch (_) {}
  }

  function playChimeSound(type = 'chime') {
    try {
      ensureAudioContext();
      if (!audioCtx) return;

      const scheduleNotes = () => {
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
      };

      if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
        audioCtx.resume().then(scheduleNotes).catch(() => {});
      } else {
        scheduleNotes();
      }
    } catch (_) {}
  }

  function speakKorean(text) {
    if (!state.settings.ttsEnabled) return;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      if (!cachedKoreanVoice) refreshKoreanSpeechVoice();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      if (cachedKoreanVoice) {
        utter.voice = cachedKoreanVoice;
      }
      utter.rate = 1.02;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }

  function requestNotificationPermissionFromGesture() {
    if (!('Notification' in window)) return;
    try {
      if (Notification.permission === 'default') {
        const res = Notification.requestPermission();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } catch (_) {}
  }

  function sendBrowserNotification(title, bodyText) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body: bodyText, icon: 'icon-192.png' });
      } catch (_) {}
    }
  }

  function triggerSafeFileDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
    }, 250);
    // iOS Safari 비동기 다운로드 완료 전 URL 조기 해제 방지
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 15000);
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

  // -------------------- 토스트 메시지 및 실행 취소 --------------------
  function showToast(message, options = {}) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const { withUndo = false, onUndo = null, durationMs } = options || {};
    const hasUndoAction = Boolean(withUndo && undoStack.length > 0) || typeof onUndo === 'function';

    const item = document.createElement('div');
    item.className = 'toast-item';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    item.appendChild(textSpan);

    if (hasUndoAction) {
      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'toast-undo-btn';
      undoBtn.textContent = '실행 취소';
      undoBtn.addEventListener('click', () => {
        item.remove();
        if (typeof onUndo === 'function') {
          onUndo();
        } else {
          performUndo();
        }
      });
      item.appendChild(undoBtn);
    }

    container.appendChild(item);
    const timeout = durationMs || (hasUndoAction ? 6200 : 3400);
    setTimeout(() => {
      item.remove();
    }, timeout);
  }

  // -------------------- 자연어 빠른 입력 파서 --------------------
  function parseNaturalQuickInput(rawInput, modeOverride = 'auto', defaultCategoryId = '') {
    let text = String(rawInput || '').trim();
    if (!text) return null;

    let dateStr = selectedDate;
    if (/(?:^|\s)오늘(?=\s|$)/.test(text)) {
      dateStr = getTodayStr();
      text = text.replace(/(?:^|\s)오늘(?=\s|$)/g, ' ').trim();
    } else if (/(?:^|\s)내일(?=\s|$)/.test(text)) {
      dateStr = addDaysStr(getTodayStr(), 1);
      text = text.replace(/(?:^|\s)내일(?=\s|$)/g, ' ').trim();
    } else if (/(?:^|\s)모레(?=\s|$)/.test(text)) {
      dateStr = addDaysStr(getTodayStr(), 2);
      text = text.replace(/(?:^|\s)모레(?=\s|$)/g, ' ').trim();
    }

    let important = false;
    if (/!중요|!필수|★/.test(text)) {
      important = true;
      text = text.replace(/!중요|!필수|★/g, '').trim();
    }

    // 프로젝트 태그 추출 (@신규런칭 등)
    let projectTag = getActiveRealProjectTag();
    const atMatch = text.match(/@([^\s#,]+)/);
    if (atMatch) {
      projectTag = cleanProjectTag(atMatch[1]);
      text = text.replace(atMatch[0], '').trim();
    }

    // 반복 주기 추출 (매주 수요일, 매주, 매일, 평일, 매월)
    let repeat = 'none';
    const korDayMap = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
    const weeklyDayMatch = text.match(/매주\s*([일월화수목금토])요일|([일월화수목금토])요일마다/);
    if (weeklyDayMatch) {
      repeat = 'weekly';
      const dayChar = weeklyDayMatch[1] || weeklyDayMatch[2];
      const targetDow = korDayMap[dayChar];
      if (targetDow !== undefined) {
        const weekInfo = getWeekRangeFromDateStr(selectedDate);
        const matchedDayObj = weekInfo.days.find(d => d.dayIdx === targetDow);
        if (matchedDayObj) dateStr = matchedDayObj.dateStr;
      }
      text = text.replace(weeklyDayMatch[0], '').trim();
    } else if (/매주|주간마다/.test(text)) {
      repeat = 'weekly';
      text = text.replace(/매주|주간마다/g, '').trim();
    } else if (/매일|날마다/.test(text)) {
      repeat = 'daily';
      text = text.replace(/매일|날마다/g, '').trim();
    } else if (/평일마다|평일/.test(text)) {
      repeat = 'weekdays';
      text = text.replace(/평일마다|평일/g, '').trim();
    } else if (/매월|매달/.test(text)) {
      repeat = 'monthly';
      text = text.replace(/매월|매달/g, '').trim();
    } else {
      // 단독 요일 지정 (예: 수요일 14시 회의)
      const singleDowMatch = text.match(/(?:^|\s)([일월화수목금토])요일(?=\s|$)/);
      if (singleDowMatch) {
        const targetDow = korDayMap[singleDowMatch[1]];
        if (targetDow !== undefined) {
          const weekInfo = getWeekRangeFromDateStr(selectedDate);
          const matchedDayObj = weekInfo.days.find(d => d.dayIdx === targetDow);
          if (matchedDayObj) dateStr = matchedDayObj.dateStr;
        }
        text = text.replace(singleDowMatch[0], ' ').trim();
      }
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
    let explicitRangeParsed = false;

    const toValidHHMM = (rawH, rawM, ampm = '') => {
      let h = Number(rawH);
      const m = Math.max(0, Math.min(59, Number(rawM || 0)));
      if ((ampm === '오후' || ampm === '저녁' || ampm === '밤') && h < 12) h += 12;
      if ((ampm === '오전' || ampm === '새벽') && h === 12) h = 0;
      h = Math.max(0, Math.min(23, h));
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const rangeColon = text.match(/(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})/);
    if (rangeColon) {
      startTime = toValidHHMM(rangeColon[1], rangeColon[2]);
      endTime = toValidHHMM(rangeColon[3], rangeColon[4]);
      explicitRangeParsed = true;
      text = text.replace(rangeColon[0], '').trim();
    } else {
      const korRange = text.match(
        /(새벽|오전|오후|저녁|밤)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?\s*[~\-]\s*(새벽|오전|오후|저녁|밤)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/
      );
      if (korRange) {
        const startAmPm = korRange[1] || '';
        const endAmPm = korRange[4] || startAmPm;
        startTime = toValidHHMM(korRange[2], korRange[3], startAmPm);
        endTime = toValidHHMM(korRange[5], korRange[6], endAmPm);
        if (!korRange[4] && timeToMinutes(endTime) <= timeToMinutes(startTime) && Number(korRange[5]) < 12) {
          endTime = toValidHHMM(Number(korRange[5]) + 12, korRange[6], '');
        }
        explicitRangeParsed = true;
        text = text.replace(korRange[0], '').trim();
      } else {
        const singleColon = text.match(/(\d{1,2}):(\d{2})/);
        if (singleColon) {
          startTime = toValidHHMM(singleColon[1], singleColon[2]);
          endTime = minutesToTime(timeToMinutes(startTime) + 60);
          text = text.replace(singleColon[0], '').trim();
        } else {
          const korTime = text.match(/(새벽|오전|오후|저녁|밤)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
          if (korTime) {
            startTime = toValidHHMM(korTime[2], korTime[3], korTime[1] || '');
            endTime = minutesToTime(timeToMinutes(startTime) + 60);
            text = text.replace(korTime[0], '').trim();
          }
        }
      }
    }

    // 소요 시간 표현 (2시간, 1시간 30분, 30분 등)
    const durHourMinMatch = text.match(/(\d+)\s*시간(?:\s*(\d+)\s*분)?/);
    if (durHourMinMatch && startTime && !explicitRangeParsed) {
      const addMins = Number(durHourMinMatch[1]) * 60 + Number(durHourMinMatch[2] || 0);
      endTime = minutesToTime(timeToMinutes(startTime) + Math.max(5, addMins));
      text = text.replace(durHourMinMatch[0], '').trim();
    } else if (startTime && !explicitRangeParsed) {
      const durMinMatch = text.match(/(?:^|\s)(\d+)\s*분(?:\s*동안)?(?=\s|$)/);
      if (durMinMatch) {
        const addMins = Math.max(5, Number(durMinMatch[1]));
        endTime = minutesToTime(timeToMinutes(startTime) + addMins);
        text = text.replace(durMinMatch[0], ' ').trim();
      }
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

    const cleanTitle = text.replace(/\s{2,}/g, ' ').trim() || '새 항목';
    if (!startTime) {
      startTime = getNowTimeStr();
      endTime = minutesToTime(timeToMinutes(startTime) + 60);
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      if (timeToMinutes(startTime) >= 23 * 60 + 55) {
        startTime = '23:30';
        endTime = '23:59';
      } else {
        endTime = minutesToTime(timeToMinutes(startTime) + 30);
      }
    }

    return {
      type: resolvedType,
      title: cleanTitle,
      date: dateStr,
      startTime,
      endTime,
      categoryId,
      projectTag,
      repeat: resolvedType === 'actual' ? 'none' : repeat,
      important
    };
  }

  function getAllProjectTags() {
    const tagSet = new Set();
    state.schedules.forEach(s => {
      const t = cleanProjectTag(s.projectTag);
      if (t) tagSet.add(t);
    });
    state.todos.forEach(td => {
      const t = cleanProjectTag(td.projectTag);
      if (t) tagSet.add(t);
    });
    state.actualLogs.forEach(a => {
      const t = cleanProjectTag(a.projectTag);
      if (t) tagSet.add(t);
    });
    return Array.from(tagSet);
  }

  function matchesSelectedProjectTag(item) {
    if (!selectedProjectTag) return true;
    const itemTag = cleanProjectTag(item?.projectTag);
    if (selectedProjectTag === '__UNTAGGED__') return !itemTag;
    return itemTag === selectedProjectTag;
  }

  function syncProjectTagBarVisibility(hasTagsHint = null) {
    const sectionEl = document.getElementById('projectTagFilterSection');
    const toggleBtns = document.querySelectorAll('.js-toggle-ptag-bar');
    const hasTags =
      hasTagsHint !== null ? Boolean(hasTagsHint) : getAllProjectTags().length > 0;
    const isEligibleTab = currentActiveTab === 'dashboard' || currentActiveTab === 'calendar';
    const hasActiveFilter = Boolean(selectedProjectTag);
    const shouldShowBar =
      isEligibleTab && (hasTags || hasActiveFilter) && projectTagBarOpen;

    if (sectionEl) {
      sectionEl.classList.toggle('hidden', !shouldShowBar);
    }

    const btnText =
      selectedProjectTag === '__UNTAGGED__'
        ? '프로젝트 · 미지정'
        : selectedProjectTag
        ? `@${selectedProjectTag}`
        : '프로젝트';

    toggleBtns.forEach(btn => {
      btn.classList.toggle('hidden', !hasTags && !hasActiveFilter);
      btn.classList.toggle('active', projectTagBarOpen || hasActiveFilter);
      btn.setAttribute('aria-expanded', String(shouldShowBar));
      btn.textContent = btnText;
    });
  }

  function renderProjectTagFilterBar() {
    const chipsContainer = document.getElementById('projectTagFilterChips');
    const summaryEl = document.getElementById('projectTagActiveSummary');
    const datalistEl = document.getElementById('projectTagDatalist');

    // 단일 패스로 프로젝트 태그 목록과 항목 수 집계
    const statsByTag = new Map();
    const ensureTagStat = rawTag => {
      const t = cleanProjectTag(rawTag);
      if (!t) return null;
      let entry = statsByTag.get(t);
      if (!entry) {
        entry = { schCount: 0, todoCount: 0, doneTodoCount: 0, actualMins: 0 };
        statsByTag.set(t, entry);
      }
      return entry;
    };

    state.schedules.forEach(s => {
      const entry = ensureTagStat(s.projectTag);
      if (entry) entry.schCount++;
    });
    state.todos.forEach(td => {
      const entry = ensureTagStat(td.projectTag);
      if (entry) {
        entry.todoCount++;
        if (isItemCompletedOnDate(td, selectedDate)) entry.doneTodoCount++;
      }
    });
    state.actualLogs.forEach(a => {
      const entry = ensureTagStat(a.projectTag);
      if (entry) entry.actualMins += durationMinutes(a.startTime, a.endTime);
    });

    const tags = Array.from(statsByTag.keys());

    if (selectedProjectTag && selectedProjectTag !== '__UNTAGGED__' && !statsByTag.has(selectedProjectTag)) {
      selectedProjectTag = '';
    }

    if (datalistEl) {
      datalistEl.innerHTML = tags.map(t => `<option value="${escapeHtml(t)}"></option>`).join('');
    }

    syncProjectTagBarVisibility(tags.length > 0);

    if (!chipsContainer) return;

    let chipsHtml = `
      <button type="button" class="ptag-chip ${!selectedProjectTag ? 'active' : ''}" data-ptag="">
        <span>전체</span>
      </button>
    `;

    tags.forEach(tag => {
      const st = statsByTag.get(tag);
      const count = (st?.schCount || 0) + (st?.todoCount || 0);
      const isActive = selectedProjectTag === tag;
      chipsHtml += `
        <button type="button" class="ptag-chip ${isActive ? 'active' : ''}" data-ptag="${escapeHtml(tag)}">
          <span>@${escapeHtml(tag)}</span>
          <span class="ptag-chip-count">${count}</span>
        </button>
      `;
    });

    chipsHtml += `
      <button type="button" class="ptag-chip ${selectedProjectTag === '__UNTAGGED__' ? 'active' : ''}" data-ptag="__UNTAGGED__">
        <span>미지정</span>
      </button>
    `;

    chipsContainer.innerHTML = chipsHtml;

    chipsContainer.querySelectorAll('.ptag-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedProjectTag = btn.dataset.ptag || '';
        if (selectedProjectTag) {
          projectTagBarOpen = true;
        }
        renderAll();
      });
    });

    if (summaryEl) {
      if (!selectedProjectTag) {
        summaryEl.textContent = '';
        summaryEl.classList.add('hidden');
      } else if (selectedProjectTag === '__UNTAGGED__') {
        summaryEl.textContent = '태그 미지정 항목 필터 적용 중';
        summaryEl.classList.remove('hidden');
      } else {
        const st = statsByTag.get(selectedProjectTag) || {
          schCount: 0,
          todoCount: 0,
          doneTodoCount: 0,
          actualMins: 0
        };
        summaryEl.textContent = `일정 ${st.schCount}건 · 할 일 ${st.doneTodoCount}/${st.todoCount} · 실행 ${formatDurationKo(st.actualMins)}`;
        summaryEl.classList.remove('hidden');
      }
    }
  }

  function syncCalCursorsToSelectedDate(syncFullCal = false) {
    const [sy, sm] = selectedDate.split('-').map(Number);
    if (!sy || !sm) return;
    miniCalCursor = new Date(sy, sm - 1, 1);
    if (syncFullCal) {
      fullCalCursor = new Date(sy, sm - 1, 1);
    }
  }

  function syncMobileDrawerUI() {
    const collapsible = document.getElementById('dashLeftCollapsible');
    const toggleBtn = document.getElementById('mobileDrawerToggleBtn');
    const chevron = document.getElementById('mobileDrawerChevron');
    if (collapsible) {
      collapsible.classList.toggle('is-collapsed', mobileTodoFolded);
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(!mobileTodoFolded));
    }
    if (chevron) {
      chevron.textContent = mobileTodoFolded ? '펼치기 ▾' : '접기 ▴';
    }
  }

  // 계획 일정 완료 체크 시 실행 기록 자동 생성 및 해제 시 자동 생성분 정리
  function toggleScheduleCompletedWithActualSync(schedule, targetDate, nextState, showFeedbackToast = false) {
    if (!schedule || !targetDate) return;
    pushUndoSnapshot('일정 완료 상태 변경');
    setItemCompletedOnDate(schedule, targetDate, nextState);
    const pTag = cleanProjectTag(schedule.projectTag);

    if (nextState) {
      const exists = state.actualLogs.some(
        a =>
          a.date === targetDate &&
          (a.linkedScheduleId === schedule.id ||
            (a.title === schedule.title && a.startTime === schedule.startTime))
      );
      if (!exists) {
        state.actualLogs.push({
          id: uid('act'),
          title: schedule.title,
          date: targetDate,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          categoryId: schedule.categoryId,
          projectTag: pTag,
          linkedScheduleId: schedule.id,
          autoGenerated: true
        });
        if (showFeedbackToast) {
          showToast(`'${schedule.title}' 실행 시간에 자동 기록되었습니다.`, { withUndo: true });
        }
      }
    } else {
      state.actualLogs = state.actualLogs.filter(
        a =>
          !(
            a.date === targetDate &&
            a.autoGenerated &&
            (a.linkedScheduleId === schedule.id ||
              (a.title === schedule.title && a.startTime === schedule.startTime))
          )
      );
    }
  }

  // 선택한 날짜에서 기존 일정과 겹치지 않는 가장 빠른 빈 시간대 탐색
  function findNextFreeSlotOnDate(dateStr, durMins = 30, preferredStartMins = null) {
    const safeDur = Math.max(15, Math.min(240, Math.round(Number(durMins) || 30)));
    const occupied = state.schedules
      .filter(s => doesItemOccurOnDate(s, dateStr, false))
      .map(s => ({
        start: timeToMinutes(s.startTime),
        end: timeToMinutes(s.endTime)
      }))
      .sort((a, b) => a.start - b.start);

    const isToday = dateStr === getTodayStr();
    const defaultStart = isToday ? Math.max(9 * 60, Math.ceil(timeToMinutes(getNowTimeStr()) / 15) * 15) : 9 * 60;
    let candidate = preferredStartMins !== null ? preferredStartMins : defaultStart;
    let conflict = true;

    while (conflict && candidate + safeDur <= 23 * 60 + 45) {
      conflict = false;
      for (let i = 0; i < occupied.length; i++) {
        const occ = occupied[i];
        if (candidate < occ.end && candidate + safeDur > occ.start) {
          candidate = Math.ceil((occ.end + 10) / 15) * 15;
          conflict = true;
          break;
        }
      }
    }

    if (candidate + safeDur > 23 * 60 + 59) {
      const start = Math.max(0, 23 * 60 + 59 - safeDur);
      return { startTime: minutesToTime(start), endTime: '23:59', overflowed: true };
    }
    return {
      startTime: minutesToTime(candidate),
      endTime: minutesToTime(candidate + safeDur),
      overflowed: false
    };
  }

  // -------------------- 전체 UI 렌더링 오케스트레이터 --------------------
  function renderActiveTabViews(forceAllTabs = false) {
    if (forceAllTabs || currentActiveTab === 'dashboard') {
      renderTodoList();
      renderDualTimeline();
      renderDashboardRoutines();
      syncMobileDrawerUI();
    }
    if (forceAllTabs || currentActiveTab === 'routines') {
      renderRoutinePlayerTab();
    }
    if (forceAllTabs || currentActiveTab === 'calendar') {
      renderCalendarOverviewTab();
    }
    if (forceAllTabs || currentActiveTab === 'report') {
      renderReportAndGoalsTab();
    }
  }

  function renderAll(forceAllTabs = false) {
    renderTodaySummary();
    renderCategorySelects();
    renderProjectTagFilterBar();
    syncDurationResizeModeUI();
    renderActiveTabViews(forceAllTabs);
    if (dayDetailDate && !document.getElementById('dayDetailModal')?.classList.contains('hidden')) {
      renderDayDetailModalContent(dayDetailDate);
    }
    updateTtsButtonUI();
    applyThemeUI();
    updateSyncHeaderUI();
  }

  function renderTodaySummary() {
    const isToday = selectedDate === getTodayStr();
    const relLabel = getRelativeDateLabelKo(selectedDate);
    const daySchedules = state.schedules.filter(
      s => matchesSelectedProjectTag(s) && doesItemOccurOnDate(s, selectedDate, false)
    );
    const dayTodos = state.todos.filter(t => {
      if (!matchesSelectedProjectTag(t)) return false;
      if (t.repeat && t.repeat !== 'none') return doesItemOccurOnDate(t, selectedDate, true);
      return t.dueDate === selectedDate || !t.dueDate;
    });
    const totalPlanned = daySchedules.length + dayTodos.length;
    const completedCount =
      daySchedules.filter(s => isItemCompletedOnDate(s, selectedDate)).length +
      dayTodos.filter(t => isItemCompletedOnDate(t, selectedDate)).length;

    const dayActuals = state.actualLogs.filter(
      a => matchesSelectedProjectTag(a) && a.date === selectedDate
    );
    const actualMins = dayActuals.reduce((acc, cur) => acc + durationMinutes(cur.startTime, cur.endTime), 0);

    state.settings.streakDays = computeRoutineStreakDays();

    const headerEl = document.getElementById('headerDateText');
    if (headerEl) {
      const actualPart = actualMins > 0 ? ` · 실행 ${formatDurationKo(actualMins)}` : '';
      const relPrefix = !isToday && relLabel ? `${relLabel} · ` : '';
      headerEl.textContent = `${relPrefix}${formatDateHeadingKo(selectedDate)} · 달성 ${completedCount}/${totalPlanned}${actualPart}`;
    }

    const relBadgeEl = document.getElementById('timelineRelativeBadge');
    if (relBadgeEl) {
      relBadgeEl.textContent = relLabel || '오늘';
      relBadgeEl.classList.toggle('is-other-day', !isToday);
    }

    const goTodayBtn = document.getElementById('goTodayBtn');
    if (goTodayBtn) {
      goTodayBtn.textContent = isToday ? '오늘' : '오늘로 이동';
      goTodayBtn.classList.toggle('is-away', !isToday);
    }

    const calTodayBtn = document.getElementById('calTodayBtn');
    if (calTodayBtn) {
      calTodayBtn.classList.toggle('is-away', !isToday);
    }

    const remainingTodos = dayTodos.filter(t => !isItemCompletedOnDate(t, selectedDate)).length;
    const remainingRoutines = state.routines.filter(
      r => doesRoutineOccurOnDate(r, selectedDate) && !(Array.isArray(r.completedDates) && r.completedDates.includes(selectedDate))
    ).length;

    const mobileSummaryEl = document.getElementById('mobileDrawerSummaryText');
    if (mobileSummaryEl) {
      const dayPrefix = isToday ? '오늘' : formatShortMonthDayKo(selectedDate);
      if (remainingTodos === 0 && remainingRoutines === 0) {
        mobileSummaryEl.textContent = `${dayPrefix} 할 일 · 루틴 모두 완료`;
      } else {
        const parts = [`${dayPrefix} 할 일 ${remainingTodos}건`];
        if (remainingRoutines > 0) parts.push(`루틴 ${remainingRoutines}건`);
        mobileSummaryEl.textContent = parts.join(' · ');
      }
    }

    const datePicker = document.getElementById('quickDatePicker');
    if (datePicker && datePicker.value !== selectedDate) {
      datePicker.value = selectedDate;
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
        .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
        .join('');
      if (prevVal && state.categories.some(c => c.id === prevVal)) {
        sel.value = prevVal;
      }
    });
  }

  // -------------------- 타임블록 드래그 앤 드롭 & 소요 시간 리사이즈 엔진 --------------------
  let draggedTimelineItem = null;
  let lastDragOrResizeAt = 0;

  function isJustDraggedOrResized() {
    return Date.now() - lastDragOrResizeAt < 260;
  }

  function calcBlockMinHeightPx(durMins) {
    return Math.max(46, Math.min(180, Math.round(durMins * 0.78)));
  }

  function adjustItemDurationByStep(item, deltaMins) {
    if (!item || !item.startTime || !item.endTime) return;
    const startMins = timeToMinutes(item.startTime);
    const curDur = durationMinutes(item.startTime, item.endTime);
    const nextDur = Math.max(15, Math.min(23 * 60 + 59 - startMins, curDur + deltaMins));
    if (nextDur === curDur) return;
    pushUndoSnapshot('소요 시간 조절');
    item.endTime = minutesToTime(startMins + nextDur);
    saveState();
    renderAll();
    showToast(
      `'${item.title}' 소요 시간이 ${item.startTime}~${item.endTime} · ${formatDurationKo(nextDur)}으로 변경되었습니다.`,
      { withUndo: true }
    );
  }

  function shiftItemStartTime(item, deltaMins) {
    if (!item || !item.startTime || !item.endTime) return;
    const curStart = timeToMinutes(item.startTime);
    const curDur = durationMinutes(item.startTime, item.endTime);
    const maxStart = Math.max(0, 23 * 60 + 59 - curDur);
    const nextStart = Math.max(0, Math.min(maxStart, curStart + deltaMins));
    if (nextStart === curStart) return;
    pushUndoSnapshot('시작 시각 이동');
    item.startTime = minutesToTime(nextStart);
    item.endTime = minutesToTime(Math.min(23 * 60 + 59, nextStart + curDur));
    saveState();
    renderAll();
    showToast(`'${item.title}' 시간이 ${item.startTime}~${item.endTime}으로 이동되었습니다.`, { withUndo: true });
  }

  function makeItemDraggable(el, itemType, item, sourceDate) {
    if (!el || !item) return;
    el.draggable = true;
    el.addEventListener('dragstart', e => {
      if (el.classList.contains('is-resizing')) {
        e.preventDefault();
        return;
      }
      draggedTimelineItem = {
        itemType,
        itemId: item.id,
        sourceDate: sourceDate || selectedDate
      };
      el.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', JSON.stringify(draggedTimelineItem));
        } catch (_) {}
      }
    });
    el.addEventListener('dragend', () => {
      lastDragOrResizeAt = Date.now();
      el.classList.remove('is-dragging');
      document.querySelectorAll('.drag-over-slot').forEach(s => s.classList.remove('drag-over-slot'));
    });
  }

  function makeSlotDroppable(slotEl, targetOptions) {
    if (!slotEl) return;
    slotEl.addEventListener('dragover', e => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      slotEl.classList.add('drag-over-slot');
    });
    slotEl.addEventListener('dragleave', e => {
      if (!slotEl.contains(e.relatedTarget)) {
        slotEl.classList.remove('drag-over-slot');
      }
    });
    slotEl.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      slotEl.classList.remove('drag-over-slot');
      let payload = draggedTimelineItem;
      if (!payload && e.dataTransfer) {
        try {
          payload = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch (_) {}
      }
      draggedTimelineItem = null;
      lastDragOrResizeAt = Date.now();
      if (payload) {
        handleTimelineItemDrop(payload, targetOptions);
      }
    });
  }

  function handleTimelineItemDrop(payload, targetOptions) {
    const { itemType, itemId } = payload;
    const { targetType, targetDate, targetHour } = targetOptions;
    const destDate = targetDate || selectedDate;

    if (itemType === 'schedule') {
      const sch = state.schedules.find(s => s.id === itemId);
      if (!sch) return;
      const origDur = durationMinutes(sch.startTime, sch.endTime);
      const origMinuteOffset = timeToMinutes(sch.startTime) % 60;

      if (targetType === 'actual') {
        const startMins =
          typeof targetHour === 'number'
            ? Math.min(23 * 60 + 45, targetHour * 60 + origMinuteOffset)
            : timeToMinutes(sch.startTime);
        const endMins = Math.min(23 * 60 + 59, startMins + origDur);
        const newStart = minutesToTime(startMins);
        const newEnd = minutesToTime(endMins);

        pushUndoSnapshot('일정 실제 기록 전환');
        setItemCompletedOnDate(sch, destDate, true);
        state.actualLogs.push({
          id: uid('act'),
          title: sch.title,
          date: destDate,
          startTime: newStart,
          endTime: newEnd,
          categoryId: sch.categoryId,
          projectTag: cleanProjectTag(sch.projectTag)
        });
        saveState();
        renderAll();
        showToast(`'${sch.title}' 일정이 ${newStart}~${newEnd} 실제 진행 기록으로 반영되었습니다.`, { withUndo: true });
        return;
      }

      const nextDate = destDate && sch.date !== destDate ? destDate : sch.date;
      let nextStart = sch.startTime;
      let nextEnd = sch.endTime;
      if (typeof targetHour === 'number') {
        const nextStartMins = Math.min(23 * 60 + 45, targetHour * 60 + origMinuteOffset);
        const nextEndMins = Math.min(23 * 60 + 59, nextStartMins + origDur);
        nextStart = minutesToTime(nextStartMins);
        nextEnd = minutesToTime(nextEndMins);
      }
      if (nextDate !== sch.date || nextStart !== sch.startTime || nextEnd !== sch.endTime) {
        pushUndoSnapshot('일정 이동');
        sch.date = nextDate;
        sch.startTime = nextStart;
        sch.endTime = nextEnd;
        saveState();
        renderAll();
        showToast(
          `'${sch.title}' 일정이 ${sch.date === selectedDate ? '' : sch.date + ' '}${sch.startTime}~${sch.endTime}으로 이동되었습니다.`,
          { withUndo: true }
        );
      }
    } else if (itemType === 'actual') {
      const act = state.actualLogs.find(a => a.id === itemId);
      if (!act) return;
      const origDur = durationMinutes(act.startTime, act.endTime);
      const origMinuteOffset = timeToMinutes(act.startTime) % 60;

      const nextDate = destDate && act.date !== destDate ? destDate : act.date;
      let nextStart = act.startTime;
      let nextEnd = act.endTime;
      if (typeof targetHour === 'number') {
        const nextStartMins = Math.min(23 * 60 + 45, targetHour * 60 + origMinuteOffset);
        const nextEndMins = Math.min(23 * 60 + 59, nextStartMins + origDur);
        nextStart = minutesToTime(nextStartMins);
        nextEnd = minutesToTime(nextEndMins);
      }
      if (nextDate !== act.date || nextStart !== act.startTime || nextEnd !== act.endTime) {
        pushUndoSnapshot('실제 기록 이동');
        act.date = nextDate;
        act.startTime = nextStart;
        act.endTime = nextEnd;
        saveState();
        renderAll();
        showToast(
          `'${act.title}' 기록이 ${act.date === selectedDate ? '' : act.date + ' '}${act.startTime}~${act.endTime}으로 이동되었습니다.`,
          { withUndo: true }
        );
      }
    } else if (itemType === 'todo') {
      const todo = state.todos.find(t => t.id === itemId);
      if (!todo) return;

      if (typeof targetHour === 'number') {
        const dur = Math.max(15, Number(todo.estimatedMinutes || 60));
        const startMins = targetHour * 60;
        const endMins = Math.min(23 * 60 + 59, startMins + dur);
        const newStart = minutesToTime(startMins);
        const newEnd = minutesToTime(endMins);

        pushUndoSnapshot('할 일 타임라인 배치');
        if (targetType === 'actual') {
          state.actualLogs.push({
            id: uid('act'),
            title: todo.title,
            date: destDate,
            startTime: newStart,
            endTime: newEnd,
            categoryId: todo.categoryId,
            projectTag: cleanProjectTag(todo.projectTag)
          });
          setItemCompletedOnDate(todo, destDate, true);
          saveState();
          renderAll();
          showToast(`'${todo.title}' 할 일이 ${newStart}~${newEnd} 실제 진행 기록으로 등록되었습니다.`, { withUndo: true });
        } else {
          state.schedules.push({
            id: uid('sch'),
            title: todo.title,
            date: destDate,
            startTime: newStart,
            endTime: newEnd,
            categoryId: todo.categoryId,
            projectTag: cleanProjectTag(todo.projectTag),
            repeat: 'none',
            completedDates: [],
            alarm: true,
            alarmLeadMinutes: 0,
            important: Boolean(todo.important),
            completed: false
          });
          if (!todo.dueDate) todo.dueDate = destDate;
          saveState();
          renderAll();
          showToast(`'${todo.title}' 할 일이 ${newStart}~${newEnd} 계획 일정으로 배치되었습니다.`, { withUndo: true });
        }
        return;
      }

      if (destDate && todo.dueDate !== destDate) {
        pushUndoSnapshot('할 일 마감일 변경');
        todo.dueDate = destDate;
        saveState();
        renderAll();
        showToast(`'${todo.title}' 마감 날짜가 ${destDate}로 변경되었습니다.`, { withUndo: true });
      }
    }
  }

  function attachDurationResizeHandle(blockEl, item, onPreviewUpdate) {
    if (!blockEl || !item) return;
    const handle = document.createElement('div');
    handle.className = 'tb-resize-handle';
    handle.title = '위아래로 드래그하여 소요 시간을 15분 단위로 조절합니다';

    handle.addEventListener('click', e => {
      if (!durationResizeEnabled) return;
      e.stopPropagation();
    });
    handle.addEventListener('dragstart', e => {
      if (!durationResizeEnabled) return;
      e.preventDefault();
      e.stopPropagation();
    });

    handle.addEventListener('pointerdown', e => {
      if (!durationResizeEnabled) return;
      e.stopPropagation();
      e.preventDefault();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {}

      const startY = e.clientY;
      const startMins = timeToMinutes(item.startTime);
      const origDur = durationMinutes(item.startTime, item.endTime);
      let nextEndStr = item.endTime;
      let nextDur = origDur;

      blockEl.classList.add('is-resizing');
      blockEl.draggable = false;

      const onMove = ev => {
        const deltaY = ev.clientY - startY;
        const deltaMins = Math.round(deltaY / 12) * 15;
        nextDur = Math.max(15, Math.min(23 * 60 + 59 - startMins, origDur + deltaMins));
        nextEndStr = minutesToTime(startMins + nextDur);
        if (typeof onPreviewUpdate === 'function') {
          onPreviewUpdate(nextEndStr, nextDur);
        }
      };

      const onUp = ev => {
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch (_) {}
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        blockEl.classList.remove('is-resizing');
        blockEl.draggable = true;
        lastDragOrResizeAt = Date.now();

        if (nextEndStr !== item.endTime) {
          pushUndoSnapshot('드래그 시간 조절');
          item.endTime = nextEndStr;
          saveState();
          renderAll();
          showToast(
            `'${item.title}' 소요 시간이 ${item.startTime}~${item.endTime} · ${formatDurationKo(nextDur)}으로 변경되었습니다.`,
            { withUndo: true }
          );
        }
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });

    blockEl.appendChild(handle);
  }

  // -------------------- 할 일 및 프로젝트 태그 묶음 렌더링 --------------------
  function createTodoCardElement(todo) {
    const cat = getCategoryById(todo.categoryId);
    const isDone = isItemCompletedOnDate(todo, selectedDate);
    const pTag = cleanProjectTag(todo.projectTag);
    const repeatLabel = getRepeatLabelKo(todo.repeat, todo.dueDate);

    const estMins = Math.max(15, Number(todo.estimatedMinutes || 30));

    const card = document.createElement('div');
    card.className = `todo-item-card ${isDone ? 'completed' : ''}`;
    card.innerHTML = `
      <div class="todo-left">
        <input type="checkbox" class="todo-check" ${isDone ? 'checked' : ''} aria-label="완료 체크" />
        <div class="todo-meta-col">
          <div class="todo-title-row">
            ${todo.important ? '<span class="important-star" title="중요 항목">★</span>' : ''}
            <span class="todo-title-text">${escapeHtml(todo.title)}</span>
          </div>
          <div class="todo-sub-info">
            ${pTag ? `<span class="project-tag-pill">@${escapeHtml(pTag)}</span>` : ''}
            ${repeatLabel ? `<span class="repeat-badge">${escapeHtml(repeatLabel)}</span>` : ''}
            <span class="cat-dot-tag" style="background:${cat.color}20;color:${cat.color}">${escapeHtml(cat.name)}</span>
            <span class="est-time-chip">${formatShortDurationKo(estMins)}</span>
            ${
              todo.dueDate && (!todo.repeat || todo.repeat === 'none') && todo.dueDate !== selectedDate
                ? `<span>${todo.dueDate}</span>`
                : ''
            }
          </div>
        </div>
      </div>
      <div class="todo-actions">
        <button type="button" class="icon-play-btn todo-start-btn" title="타이머 시작 및 완료 시 타임라인 자동 기록" aria-label="타이머 시작">▶</button>
      </div>
    `;

    card.querySelector('.todo-check').addEventListener('click', e => {
      e.stopPropagation();
    });
    card.querySelector('.todo-check').addEventListener('change', e => {
      const nextDone = Boolean(e.target.checked);
      pushUndoSnapshot('할 일 완료 상태 변경');
      setItemCompletedOnDate(todo, selectedDate, nextDone);
      saveState();
      renderAll();
      if (nextDone) {
        showToast(`'${todo.title}' 완료 처리되었습니다.`, { withUndo: true });
      }
    });

    card.querySelector('.todo-start-btn').addEventListener('click', e => {
      e.stopPropagation();
      startLiveTrackerWith(todo.title, todo.categoryId, pTag, { type: 'todo', id: todo.id });
    });

    card.addEventListener('click', e => {
      if (
        e.target.closest('button') ||
        e.target.closest('.todo-check') ||
        isJustDraggedOrResized()
      ) {
        return;
      }
      openItemModalForEdit('todo', todo);
    });

    makeItemDraggable(card, 'todo', todo, selectedDate);
    card.title = '클릭하여 수정하거나 타임라인 시간대로 드래그하여 배치합니다';

    return card;
  }

  function renderTodoList() {
    const container = document.getElementById('todoListContainer');
    const groupBtn = document.getElementById('toggleTodoGroupByTagBtn');
    if (!container) return;

    if (groupBtn) {
      groupBtn.classList.toggle('active', todoGroupByTag);
    }

    const baseTodos = state.todos.filter(t => matchesSelectedProjectTag(t));
    let filtered = [];

    if (currentTodoFilter === 'today') {
      filtered = baseTodos.filter(t => {
        const isDone = isItemCompletedOnDate(t, selectedDate);
        if (isDone) return false;
        if (t.repeat && t.repeat !== 'none') {
          return true;
        }
        return t.dueDate === selectedDate || !t.dueDate;
      });
    } else if (currentTodoFilter === 'recurring') {
      filtered = baseTodos.filter(t => t.repeat && t.repeat !== 'none');
    } else if (currentTodoFilter === 'backlog') {
      filtered = baseTodos.filter(
        t => !isItemCompletedOnDate(t, selectedDate) && !t.dueDate && (!t.repeat || t.repeat === 'none')
      );
    } else {
      filtered = baseTodos.filter(t => isItemCompletedOnDate(t, selectedDate));
    }

    container.innerHTML = '';

    // 태그별 묶음 모드가 꺼져 있는 경우
    if (!todoGroupByTag) {
      if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-guide">표시할 할 일 항목이 없습니다.</p>`;
        return;
      }
      filtered.forEach(todo => {
        container.appendChild(createTodoCardElement(todo));
      });
      return;
    }

    // 태그별 묶음 모드가 켜져 있는 경우: 프로젝트 태그별로 할 일과 정기 일정을 함께 묶어서 표시
    const tagGroups = new Map();
    const allTags = getAllProjectTags().filter(tag => {
      if (!selectedProjectTag) return true;
      if (selectedProjectTag === '__UNTAGGED__') return false;
      return tag === selectedProjectTag;
    });

    allTags.forEach(tag => {
      tagGroups.set(tag, []);
    });

    const untaggedTodos = [];
    filtered.forEach(todo => {
      const tag = cleanProjectTag(todo.projectTag);
      if (tag) {
        if (!tagGroups.has(tag)) tagGroups.set(tag, []);
        tagGroups.get(tag).push(todo);
      } else {
        untaggedTodos.push(todo);
      }
    });

    let renderedGroups = 0;

    tagGroups.forEach((groupTodos, tag) => {
      // 이 프로젝트 태그에 속한 정기 반복 일정 또는 오늘/예정 일정도 함께 확인
      const tagSchedules = state.schedules.filter(s => {
        if (cleanProjectTag(s.projectTag) !== tag) return false;
        if (currentTodoFilter === 'recurring') return s.repeat && s.repeat !== 'none';
        if (currentTodoFilter === 'done') return isItemCompletedOnDate(s, selectedDate);
        if (currentTodoFilter === 'today') return doesItemOccurOnDate(s, selectedDate, false);
        return false;
      });

      if (groupTodos.length === 0 && tagSchedules.length === 0) return;
      renderedGroups++;

      const allTagTodos = state.todos.filter(t => cleanProjectTag(t.projectTag) === tag);
      const doneTagTodos = allTagTodos.filter(t => isItemCompletedOnDate(t, selectedDate)).length;
      const tagActualMins = state.actualLogs
        .filter(a => cleanProjectTag(a.projectTag) === tag)
        .reduce((acc, a) => acc + durationMinutes(a.startTime, a.endTime), 0);

      const block = document.createElement('div');
      block.className = 'project-group-block';

      const head = document.createElement('div');
      head.className = 'project-group-head';
      head.innerHTML = `
        <div class="pg-head-left">
          <span class="pg-tag-badge">@${escapeHtml(tag)}</span>
          <span class="pg-meta-stats">할 일 ${doneTagTodos}/${allTagTodos.length}${tagActualMins > 0 ? ` · ${formatShortDurationKo(tagActualMins)}` : ''}</span>
        </div>
        <div class="pg-head-right">
          <button type="button" class="pg-quick-add-btn pg-add-todo-btn" title="이 프로젝트 태그로 할 일 추가">+ 할 일</button>
          <button type="button" class="pg-quick-add-btn pg-add-sch-btn" title="이 프로젝트 태그로 정기·일반 일정 추가">+ 일정</button>
        </div>
      `;

      head.querySelector('.pg-add-todo-btn').addEventListener('click', () => {
        openItemModalForCreate('todo', '09:00', '10:00', tag);
      });
      head.querySelector('.pg-add-sch-btn').addEventListener('click', () => {
        openItemModalForCreate('schedule', '10:00', '11:00', tag, 'weekly');
      });

      block.appendChild(head);

      const body = document.createElement('div');
      body.className = 'pg-body-items';

      // 프로젝트 소속 정기 일정(매주 안내, 정기 회의 등) 미니 리스트 표시
      if (tagSchedules.length > 0 && currentTodoFilter !== 'backlog') {
        const schList = document.createElement('div');
        schList.className = 'pg-schedule-mini-list';
        tagSchedules.forEach(sch => {
          const repLabel = getRepeatLabelKo(sch.repeat, sch.date);
          const isSchDone = isItemCompletedOnDate(sch, selectedDate);
          const sItem = document.createElement('div');
          sItem.className = 'pg-schedule-mini-item';
          sItem.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;min-width:0;">
              <input type="checkbox" class="pg-sch-check" ${isSchDone ? 'checked' : ''} title="일정 완료 체크" />
              ${repLabel ? `<span class="repeat-badge">${escapeHtml(repLabel)}</span>` : '<span class="wk-type-tag plan">일정</span>'}
              <span style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isSchDone ? 'text-decoration:line-through;opacity:0.6;' : ''}">${escapeHtml(sch.title)}</span>
            </div>
            <span style="font-size:0.72rem;color:var(--primary);font-weight:700;flex-shrink:0;">${sch.startTime}</span>
          `;
          sItem.querySelector('.pg-sch-check').addEventListener('click', e => {
            e.stopPropagation();
            toggleScheduleCompletedWithActualSync(sch, selectedDate, Boolean(e.target.checked), true);
            saveState();
            renderAll();
          });
          sItem.addEventListener('click', e => {
            if (e.target.classList.contains('pg-sch-check')) return;
            openItemModalForEdit('schedule', sch);
          });
          schList.appendChild(sItem);
        });
        body.appendChild(schList);
      }

      groupTodos.forEach(todo => {
        body.appendChild(createTodoCardElement(todo));
      });

      block.appendChild(body);
      container.appendChild(block);
    });

    if (untaggedTodos.length > 0 && selectedProjectTag !== '__UNTAGGED__') {
      renderedGroups++;
      const block = document.createElement('div');
      block.className = 'project-group-block';
      block.innerHTML = `
        <div class="project-group-head">
          <div class="pg-head-left">
            <span class="pg-tag-badge" style="background:var(--bg-subtle);color:var(--text-sub);">개별 할 일</span>
            <span class="pg-meta-stats">${untaggedTodos.length}건</span>
          </div>
          <div class="pg-head-right">
            <button type="button" class="pg-quick-add-btn pg-add-untagged-btn">+ 할 일</button>
          </div>
        </div>
        <div class="pg-body-items"></div>
      `;
      block.querySelector('.pg-add-untagged-btn').addEventListener('click', () => {
        openItemModalForCreate('todo', '09:00', '10:00', '');
      });
      const body = block.querySelector('.pg-body-items');
      untaggedTodos.forEach(todo => {
        body.appendChild(createTodoCardElement(todo));
      });
      container.appendChild(block);
    } else if (selectedProjectTag === '__UNTAGGED__' && untaggedTodos.length > 0) {
      renderedGroups++;
      untaggedTodos.forEach(todo => {
        container.appendChild(createTodoCardElement(todo));
      });
    }

    if (renderedGroups === 0) {
      container.innerHTML = `<p class="empty-guide">표시할 프로젝트 할 일이나 정기 과업이 없습니다.</p>`;
    }
  }

  // -------------------- 우측 메인: 오늘 타임라인 렌더링 --------------------
  function renderDualTimeline() {
    const dayWrap = document.getElementById('dashDayViewWrap');
    const tlTitle = document.getElementById('timelineDateTitle');
    const summaryEl = document.getElementById('dashTrackSummaryText');
    if (!dayWrap) return;

    document.querySelectorAll('#dashTrackModeTabs [data-dashtrack]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dashtrack === dashTrackMode);
    });

    if (tlTitle) {
      tlTitle.textContent = formatDateHeadingKo(selectedDate);
    }
    const datePicker = document.getElementById('quickDatePicker');
    if (datePicker && datePicker.value !== selectedDate) {
      datePicker.value = selectedDate;
    }

    renderDayDualTimeline(summaryEl);
  }

  function renderDayDualTimeline(summaryEl) {
    const scrollEl = document.getElementById('dualTimelineScroll');
    const headerEl = document.getElementById('dualTimelineHeader');
    const headerPlanCol = document.getElementById('dtHeaderPlanCol');
    const headerActualCol = document.getElementById('dtHeaderActualCol');
    if (!scrollEl || !headerEl) return;

    const showPlan = dashTrackMode === 'both' || dashTrackMode === 'plan';
    const showActual = dashTrackMode === 'both' || dashTrackMode === 'actual';

    headerEl.classList.toggle('single-col', dashTrackMode !== 'both');
    headerPlanCol.classList.toggle('hidden', !showPlan);
    headerActualCol.classList.toggle('hidden', !showActual);

    const dayPlans = state.schedules
      .filter(s => matchesSelectedProjectTag(s) && doesItemOccurOnDate(s, selectedDate, false))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const dayActuals = state.actualLogs
      .filter(a => matchesSelectedProjectTag(a) && a.date === selectedDate)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const totalPlanMins = dayPlans.reduce((s, x) => s + durationMinutes(x.startTime, x.endTime), 0);
    const totalActualMins = dayActuals.reduce((s, x) => s + durationMinutes(x.startTime, x.endTime), 0);
    if (summaryEl) {
      summaryEl.textContent = `계획 ${formatDurationKo(totalPlanMins)} · 실행 ${formatDurationKo(totalActualMins)}`;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const nowTimeStr = `${String(currentHour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isToday = selectedDate === getTodayStr();

    // 시간대별 사전 버킷 인덱싱 (O(N))
    const plansByHour = Array.from({ length: 24 }, () => []);
    const actualsByHour = Array.from({ length: 24 }, () => []);
    let minHour = 6;

    dayPlans.forEach(p => {
      const h = Math.max(0, Math.min(23, Math.floor(timeToMinutes(p.startTime) / 60)));
      if (h < minHour) minHour = h;
      plansByHour[h].push(p);
    });
    dayActuals.forEach(a => {
      const h = Math.max(0, Math.min(23, Math.floor(timeToMinutes(a.startTime) / 60)));
      if (h < minHour) minHour = h;
      actualsByHour[h].push(a);
    });

    const prevScrollTop = scrollEl.scrollTop;
    const isDateChanged = lastScrolledTimelineDate !== selectedDate;

    scrollEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    let currentHourRowEl = null;

    for (let hour = minHour; hour <= 23; hour++) {
      const hourStr = `${String(hour).padStart(2, '0')}:00`;
      const nextHourStr = hour === 23 ? '23:59' : `${String(hour + 1).padStart(2, '0')}:00`;
      const isCurrentRow = isToday && hour === currentHour;
      const row = document.createElement('div');
      row.className = `dt-hour-row ${dashTrackMode !== 'both' ? 'single-col' : ''} ${isCurrentRow ? 'current-hour-row' : ''}`;
      if (isCurrentRow) currentHourRowEl = row;

      const plansInHour = plansByHour[hour];
      const actualsInHour = actualsByHour[hour];

      const timeCol = document.createElement('div');
      timeCol.className = 'dt-hour-label';
      if (isCurrentRow) {
        timeCol.innerHTML = `<span>${hourStr}</span><span class="dt-now-badge">지금 ${nowTimeStr}</span>`;
      } else {
        timeCol.textContent = hourStr;
      }
      row.appendChild(timeCol);

      if (showPlan) {
        const planCol = document.createElement('div');
        planCol.className = 'dt-slot-cell';
        planCol.dataset.slotType = 'plan';
        planCol.dataset.hour = String(hour);
        makeSlotDroppable(planCol, { targetType: 'schedule', targetDate: selectedDate, targetHour: hour });

        if (plansInHour.length === 0) {
          planCol.innerHTML = `<span class="dt-empty-hint">+ ${hourStr} 추가</span>`;
        } else {
          plansInHour.forEach(p => {
            const cat = getCategoryById(p.categoryId);
            const isPlanDone = isItemCompletedOnDate(p, selectedDate);
            const pTag = cleanProjectTag(p.projectTag);
            const repLabel = getRepeatLabelKo(p.repeat, p.date);
            const dur = durationMinutes(p.startTime, p.endTime);
            const block = document.createElement('div');
            block.className = `timeline-block ${isPlanDone ? 'is-completed-block' : ''}`;
            block.style.background = `${cat.color}16`;
            block.style.borderLeftColor = cat.color;
            block.style.minHeight = `${calcBlockMinHeightPx(dur)}px`;
            block.innerHTML = `
              <div class="tb-left-row">
                <input type="checkbox" class="tb-plan-check" ${isPlanDone ? 'checked' : ''} title="완료 체크 시 실행 시간에 자동 기록됩니다" aria-label="일정 완료 체크" />
                <div class="tb-info">
                  <span class="tb-title">${p.important ? '<span class="important-star">★ </span>' : ''}${escapeHtml(p.title)}</span>
                  <span class="tb-time" style="color:${cat.color};display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                    <span class="tb-time-range-text">${p.startTime}~${p.endTime} · ${dur}분${p.alarm ? ' 🔔' : ''}</span>
                    ${pTag ? `<span class="project-tag-pill">@${escapeHtml(pTag)}</span>` : ''}
                    ${repLabel ? `<span class="repeat-badge">${escapeHtml(repLabel)}</span>` : ''}
                  </span>
                </div>
              </div>
              <div class="tb-actions">
                <button type="button" class="icon-play-btn plan-run-btn" title="지금 시작 및 시간 기록" aria-label="타이머 시작">▶</button>
              </div>
            `;

            const planCheck = block.querySelector('.tb-plan-check');
            planCheck.addEventListener('click', e => {
              e.stopPropagation();
            });
            planCheck.addEventListener('change', e => {
              toggleScheduleCompletedWithActualSync(p, selectedDate, Boolean(e.target.checked), true);
              saveState();
              renderAll();
            });

            block.querySelector('.plan-run-btn').addEventListener('click', e => {
              e.stopPropagation();
              startLiveTrackerWith(p.title, p.categoryId, pTag, { type: 'schedule', id: p.id });
            });

            block.addEventListener('click', e => {
              if (
                e.target.closest('button') ||
                e.target.closest('.tb-plan-check') ||
                e.target.closest('.tb-resize-handle') ||
                isJustDraggedOrResized()
              ) {
                return;
              }
              openItemModalForEdit('schedule', p);
            });

            makeItemDraggable(block, 'schedule', p, selectedDate);
            const rangeTextEl = block.querySelector('.tb-time-range-text');
            attachDurationResizeHandle(block, p, (previewEnd, previewDur) => {
              if (rangeTextEl) {
                rangeTextEl.textContent = `${p.startTime}~${previewEnd} · ${previewDur}분${p.alarm ? ' 🔔' : ''}`;
              }
              block.style.minHeight = `${calcBlockMinHeightPx(previewDur)}px`;
            });

            planCol.appendChild(block);
          });
        }
        planCol.addEventListener('click', e => {
          if (e.target.closest('.timeline-block') || isJustDraggedOrResized()) return;
          openItemModalForCreate('schedule', hourStr, nextHourStr);
        });
        row.appendChild(planCol);
      }

      if (showActual) {
        const actualCol = document.createElement('div');
        actualCol.className = 'dt-slot-cell';
        actualCol.dataset.slotType = 'actual';
        actualCol.dataset.hour = String(hour);
        makeSlotDroppable(actualCol, { targetType: 'actual', targetDate: selectedDate, targetHour: hour });

        if (actualsInHour.length === 0) {
          actualCol.innerHTML = `<span class="dt-empty-hint">+ ${hourStr} 기록</span>`;
        } else {
          actualsInHour.forEach(a => {
            const cat = getCategoryById(a.categoryId);
            const dur = durationMinutes(a.startTime, a.endTime);
            const aTag = cleanProjectTag(a.projectTag);
            const block = document.createElement('div');
            block.className = 'timeline-block';
            block.style.background = `${cat.color}22`;
            block.style.borderLeftColor = cat.color;
            block.style.minHeight = `${calcBlockMinHeightPx(dur)}px`;
            block.innerHTML = `
              <div class="tb-info">
                <span class="tb-title">${escapeHtml(a.title)}</span>
                <span class="tb-time" style="color:${cat.color};display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                  <span class="tb-time-range-text">${a.startTime}~${a.endTime} · ${dur}분</span>
                  ${aTag ? `<span class="project-tag-pill">@${escapeHtml(aTag)}</span>` : ''}
                </span>
              </div>
            `;
            block.addEventListener('click', e => {
              if (e.target.closest('.tb-resize-handle') || isJustDraggedOrResized()) return;
              openItemModalForEdit('actual', a);
            });

            makeItemDraggable(block, 'actual', a, selectedDate);
            const rangeTextEl = block.querySelector('.tb-time-range-text');
            attachDurationResizeHandle(block, a, (previewEnd, previewDur) => {
              if (rangeTextEl) {
                rangeTextEl.textContent = `${a.startTime}~${previewEnd} · ${previewDur}분`;
              }
              block.style.minHeight = `${calcBlockMinHeightPx(previewDur)}px`;
            });

            actualCol.appendChild(block);
          });
        }
        actualCol.addEventListener('click', e => {
          if (e.target.closest('.timeline-block') || isJustDraggedOrResized()) return;
          openItemModalForCreate('actual', hourStr, nextHourStr);
        });
        row.appendChild(actualCol);
      }

      fragment.appendChild(row);
    }

    scrollEl.appendChild(fragment);

    // 날짜 변경 시 오늘이면 현재 시각 행으로 자동 포커스, 같은 날짜 재렌더링 시 스크롤 위치 유지
    if (isDateChanged) {
      lastScrolledTimelineDate = selectedDate;
      requestAnimationFrame(() => {
        if (isToday && currentHourRowEl) {
          scrollEl.scrollTop = Math.max(0, currentHourRowEl.offsetTop - 64);
        } else {
          scrollEl.scrollTop = 0;
        }
      });
    } else if (prevScrollTop > 0) {
      scrollEl.scrollTop = prevScrollTop;
    }
  }

  // -------------------- 좌측 상단: 오늘 미완료 루틴 미니 스트립 --------------------
  function renderDashboardRoutines() {
    const sectionEl = document.getElementById('dashRoutineSection');
    const container = document.getElementById('dashRoutineList');
    if (!container) return;

    container.innerHTML = '';
    const remainingRoutines = state.routines
      .filter(
        rtn =>
          doesRoutineOccurOnDate(rtn, selectedDate) &&
          !(Array.isArray(rtn.completedDates) && rtn.completedDates.includes(selectedDate))
      )
      .sort(
        (a, b) =>
          timeToMinutes(getRoutineStartTimeForDate(a, selectedDate)) -
          timeToMinutes(getRoutineStartTimeForDate(b, selectedDate))
      );

    if (sectionEl) {
      sectionEl.classList.toggle('hidden', remainingRoutines.length === 0);
    }
    if (remainingRoutines.length === 0) return;

    remainingRoutines.forEach(rtn => {
      const cat = getCategoryById(rtn.categoryId);
      const totalMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);
      const startOnDate = getRoutineStartTimeForDate(rtn, selectedDate);

      const row = document.createElement('div');
      row.className = 'routine-one-line';
      row.innerHTML = `
        <div class="rol-left">
          <span class="rol-dot" style="background:${cat.color}"></span>
          <span class="rol-title">${escapeHtml(rtn.name)}</span>
          <span class="rol-meta">${startOnDate} · ${totalMins}분</span>
        </div>
        <button type="button" class="btn-xs btn-primary rtn-play-btn">시작</button>
      `;

      row.querySelector('.rtn-play-btn').addEventListener('click', e => {
        e.stopPropagation();
        switchTab('routines');
        startRoutinePlayer(rtn.id);
      });

      row.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        openRoutineModalForEdit(rtn);
      });

      container.appendChild(row);
    });
  }

  // -------------------- 실시간 타임트래커 스톱워치 엔진 (할 일·일정 자동 완료 연동) --------------------
  function startLiveTrackerWith(title, categoryId, projectTag = '', linkedRef = null) {
    if (liveTracker.running) {
      stopLiveTrackerAndRecord();
    }

    const titleInput = document.getElementById('liveTrackerTitle');
    const catSelect = document.getElementById('liveTrackerCategory');
    const tagInput = document.getElementById('liveTrackerProjectTag');

    liveTracker.title = String(title || (titleInput && titleInput.value) || '집중 작업').trim();
    liveTracker.categoryId = categoryId || (catSelect && catSelect.value) || state.categories[0].id;
    liveTracker.projectTag = cleanProjectTag(
      projectTag || (tagInput && tagInput.value) || getActiveRealProjectTag()
    );
    liveTracker.linkedRef = linkedRef || null;
    liveTracker.startDateStr = getTodayStr();
    liveTracker.startTimestamp = Date.now();
    liveTracker.startTimeStr = getNowTimeStr();
    liveTracker.elapsedSeconds = 0;
    liveTracker.running = true;

    if (titleInput) titleInput.value = liveTracker.title;
    if (catSelect) catSelect.value = liveTracker.categoryId;
    if (tagInput) tagInput.value = liveTracker.projectTag;

    document.getElementById('startLiveTrackerBtn')?.classList.add('hidden');
    document.getElementById('stopLiveTrackerBtn')?.classList.remove('hidden');

    const badge = document.getElementById('liveTrackerBadge');
    if (badge) {
      badge.textContent = '측정 중';
      badge.classList.add('running');
    }

    requestWakeLock();
    playChimeSound('chime');
    speakKorean(`${liveTracker.title} 기록을 시작합니다.`);
    showToast(`'${liveTracker.title}' 타이머가 시작되었습니다.`);

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
    const clockEl = document.getElementById('liveTrackerClock');
    if (!clockEl) return;
    const s = liveTracker.elapsedSeconds;
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    clockEl.textContent = `${hh}:${mm}:${ss}`;
  }

  function stopLiveTrackerAndRecord() {
    if (!liveTracker.running) return;
    clearInterval(liveTracker.intervalId);
    liveTracker.running = false;
    releaseWakeLock();

    const elapsedMins = Math.max(5, Math.round(liveTracker.elapsedSeconds / 60));
    let startTime = liveTracker.startTimeStr || getNowTimeStr();
    if (timeToMinutes(startTime) >= 23 * 60 + 55) {
      startTime = '23:54';
    }
    const endTime = minutesToTime(timeToMinutes(startTime) + elapsedMins);
    const recordDate = liveTracker.startDateStr || getTodayStr();
    const tagInput = document.getElementById('liveTrackerProjectTag');
    const finalTag = cleanProjectTag((tagInput && tagInput.value) || liveTracker.projectTag);
    const finishedTitle = liveTracker.title;
    const linked = liveTracker.linkedRef;
    liveTracker.linkedRef = null;

    pushUndoSnapshot('타이머 완료 및 자동 기록');

    state.actualLogs.push({
      id: uid('act'),
      title: finishedTitle,
      date: recordDate,
      startTime,
      endTime,
      categoryId: liveTracker.categoryId,
      projectTag: finalTag
    });

    // 할 일 또는 계획 일정에서 시작된 타이머라면 해당 항목도 완료 체크로 자동 연동
    if (linked && linked.id) {
      if (linked.type === 'todo') {
        const targetTodo = state.todos.find(t => t.id === linked.id);
        if (targetTodo) setItemCompletedOnDate(targetTodo, recordDate, true);
      } else if (linked.type === 'schedule') {
        const targetSch = state.schedules.find(s => s.id === linked.id);
        if (targetSch) setItemCompletedOnDate(targetSch, recordDate, true);
      }
    }

    document.getElementById('startLiveTrackerBtn')?.classList.remove('hidden');
    document.getElementById('stopLiveTrackerBtn')?.classList.add('hidden');
    const clockEl = document.getElementById('liveTrackerClock');
    if (clockEl) clockEl.textContent = '00:00:00';
    const titleInput = document.getElementById('liveTrackerTitle');
    if (titleInput) titleInput.value = '';
    if (tagInput) tagInput.value = '';
    document.getElementById('quickTimerBar')?.classList.add('hidden');

    const badge = document.getElementById('liveTrackerBadge');
    if (badge) {
      badge.textContent = '대기';
      badge.classList.remove('running');
    }

    playChimeSound('fanfare');
    speakKorean(`${finishedTitle} 기록이 타임라인에 자동 반영되었습니다.`);
    showToast(`'${finishedTitle}' ${elapsedMins}분 실행 기록 및 완료 처리되었습니다.`, { withUndo: true });

    saveState();
    updateTopBannerUI();
    renderAll();
  }

  // -------------------- 탭 2: 루티너리 몰입형 플레이어 엔진 --------------------
  function getTargetRoutineForPlayer() {
    if (routinePlayer.running && routinePlayer.activeRoutineId) {
      const activeRtn = state.routines.find(r => r.id === routinePlayer.activeRoutineId);
      if (activeRtn) return activeRtn;
    }
    if (selectedPreviewRoutineId) {
      const previewRtn = state.routines.find(r => r.id === selectedPreviewRoutineId);
      if (previewRtn) return previewRtn;
    }
    return state.routines[0] || null;
  }

  function renderRoutinePlayerTab() {
    const targetRtn = getTargetRoutineForPlayer();
    if (targetRtn) {
      selectedPreviewRoutineId = targetRtn.id;
    }

    const listEl = document.getElementById('studioRoutineList');
    if (listEl) {
      listEl.innerHTML = '';
      state.routines.forEach(rtn => {
        const cat = getCategoryById(rtn.categoryId);
        const totalMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);
        const scheduleSummary = formatRoutineScheduleSummaryKo(rtn);
        const isRunningThis = routinePlayer.running && routinePlayer.activeRoutineId === rtn.id;
        const isSelectedThis = targetRtn && targetRtn.id === rtn.id;

        const card = document.createElement('div');
        card.className = `routine-mini-card ${isSelectedThis ? 'is-selected' : ''} ${isRunningThis ? 'is-running' : ''}`;
        card.innerHTML = `
          <div class="rmc-top">
            <span class="rmc-title">${escapeHtml(rtn.name)}</span>
            <span class="cat-dot-tag" style="background:${cat.color}20;color:${cat.color}">${escapeHtml(cat.name)}</span>
          </div>
          <div class="rmc-meta">${escapeHtml(scheduleSummary)} · 총 ${totalMins}분 · ${rtn.steps.length}단계</div>
          <details class="rmc-steps-details">
            <summary class="rmc-steps-summary">행동 순서 보기</summary>
            <div class="rmc-steps-preview">
              ${rtn.steps.map((s, idx) => `<span class="rmc-step-chip">${idx + 1}. ${escapeHtml(s.title)} · ${s.minutes}분</span>`).join('')}
            </div>
          </details>
          <div class="rmc-foot">
            <button type="button" class="btn-xs btn-outline studio-edit-btn">편집</button>
            <button type="button" class="btn-xs btn-primary studio-start-btn">${isRunningThis ? '진행 중' : '루틴 시작'}</button>
          </div>
        `;
        card.querySelector('.studio-start-btn').addEventListener('click', e => {
          e.stopPropagation();
          selectedPreviewRoutineId = rtn.id;
          startRoutinePlayer(rtn.id);
          renderRoutinePlayerTab();
        });
        card.querySelector('.studio-edit-btn').addEventListener('click', e => {
          e.stopPropagation();
          selectedPreviewRoutineId = rtn.id;
          openRoutineModalForEdit(rtn);
        });
        card.addEventListener('click', e => {
          if (e.target.closest('button') || e.target.closest('summary')) return;
          selectedPreviewRoutineId = rtn.id;
          if (routinePlayer.running && routinePlayer.activeRoutineId !== rtn.id) {
            startRoutinePlayer(rtn.id);
          }
          renderRoutinePlayerTab();
        });
        listEl.appendChild(card);
      });
    }

    updateRoutinePlayerUI();
  }

  function syncRoutinePlayerWallClock() {
    if (!routinePlayer.running) return;
    if (routinePlayer.paused) {
      routinePlayer.stepElapsedSeconds = Math.floor(routinePlayer.stepBaseElapsedMs / 1000);
      routinePlayer.totalElapsedSeconds = Math.floor(routinePlayer.totalBaseElapsedMs / 1000);
      return;
    }
    const now = Date.now();
    const stepMs = routinePlayer.stepBaseElapsedMs + Math.max(0, now - routinePlayer.stepStartTimestamp);
    const totalMs = routinePlayer.totalBaseElapsedMs + Math.max(0, now - routinePlayer.totalStartTimestamp);
    routinePlayer.stepElapsedSeconds = Math.floor(stepMs / 1000);
    routinePlayer.totalElapsedSeconds = Math.floor(totalMs / 1000);
  }

  function toggleRoutinePlayerPause() {
    if (!routinePlayer.running) return;
    const now = Date.now();
    if (!routinePlayer.paused) {
      routinePlayer.stepBaseElapsedMs += Math.max(0, now - routinePlayer.stepStartTimestamp);
      routinePlayer.totalBaseElapsedMs += Math.max(0, now - routinePlayer.totalStartTimestamp);
      routinePlayer.paused = true;
      syncRoutinePlayerWallClock();
    } else {
      routinePlayer.stepStartTimestamp = now;
      routinePlayer.totalStartTimestamp = now;
      routinePlayer.paused = false;
    }
    updateRoutinePlayerUI();
    updateTopBannerUI();
  }

  function startRoutinePlayer(routineId) {
    const rtn = state.routines.find(r => r.id === routineId);
    if (!rtn || !rtn.steps || rtn.steps.length === 0) return;

    clearInterval(routinePlayer.intervalId);
    const now = Date.now();
    selectedPreviewRoutineId = rtn.id;
    routinePlayer.activeRoutineId = rtn.id;
    routinePlayer.running = true;
    routinePlayer.paused = false;
    routinePlayer.stepIndex = 0;
    routinePlayer.stepTargetSeconds = Math.max(10, Number(rtn.steps[0].minutes || 1) * 60);
    routinePlayer.stepElapsedSeconds = 0;
    routinePlayer.totalElapsedSeconds = 0;
    routinePlayer.stepStartTimestamp = now;
    routinePlayer.stepBaseElapsedMs = 0;
    routinePlayer.totalStartTimestamp = now;
    routinePlayer.totalBaseElapsedMs = 0;
    routinePlayer.startDateStr = getTodayStr();
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
    syncRoutinePlayerWallClock();

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

    syncRoutinePlayerWallClock();
    const now = Date.now();
    if (!routinePlayer.paused) {
      routinePlayer.totalBaseElapsedMs += Math.max(0, now - routinePlayer.totalStartTimestamp);
      routinePlayer.totalStartTimestamp = now;
    }

    const nextIdx = routinePlayer.stepIndex + 1;
    if (nextIdx < rtn.steps.length) {
      routinePlayer.stepIndex = nextIdx;
      const nextStep = rtn.steps[nextIdx];
      routinePlayer.stepTargetSeconds = Math.max(10, Number(nextStep.minutes || 1) * 60);
      routinePlayer.stepElapsedSeconds = 0;
      routinePlayer.stepBaseElapsedMs = 0;
      routinePlayer.stepStartTimestamp = now;
      routinePlayer.overtimeNotified = false;

      playChimeSound('chime');
      speakKorean(
        `${skipped ? '건너뛰었습니다.' : '잘하셨어요!'} 다음 행동은 ${nextStep.title}, ${nextStep.minutes}분입니다.`
      );
      updateRoutinePlayerUI();
      updateTopBannerUI();
    } else {
      finishRoutineSuccess(rtn);
    }
  }

  function goToPreviousRoutineStep() {
    if (!routinePlayer.running) return;
    const rtn = state.routines.find(r => r.id === routinePlayer.activeRoutineId);
    if (!rtn || routinePlayer.stepIndex <= 0) return;

    syncRoutinePlayerWallClock();
    const now = Date.now();
    if (!routinePlayer.paused) {
      routinePlayer.totalBaseElapsedMs += Math.max(0, now - routinePlayer.totalStartTimestamp);
      routinePlayer.totalStartTimestamp = now;
    }

    const prevIdx = routinePlayer.stepIndex - 1;
    const prevStep = rtn.steps[prevIdx];
    routinePlayer.stepIndex = prevIdx;
    routinePlayer.stepTargetSeconds = Math.max(10, Number(prevStep.minutes || 1) * 60);
    routinePlayer.stepElapsedSeconds = 0;
    routinePlayer.stepBaseElapsedMs = 0;
    routinePlayer.stepStartTimestamp = now;
    routinePlayer.overtimeNotified = false;

    playChimeSound('chime');
    speakKorean(`이전 단계인 ${prevStep.title}로 돌아갑니다.`);
    updateRoutinePlayerUI();
    updateTopBannerUI();
    showToast(`이전 단계 '${prevStep.title}'로 이동했습니다.`);
  }

  function finishRoutineSuccess(rtn) {
    syncRoutinePlayerWallClock();
    clearInterval(routinePlayer.intervalId);
    routinePlayer.running = false;
    routinePlayer.paused = false;
    releaseWakeLock();

    const todayStr = getTodayStr();
    if (!Array.isArray(rtn.completedDates)) rtn.completedDates = [];
    if (!rtn.completedDates.includes(todayStr)) {
      rtn.completedDates.push(todayStr);
    }
    state.settings.streakDays = computeRoutineStreakDays();

    // 실제 소요 시간을 타임트래커 실제 기록에 자동 반영
    const plannedMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);
    const actualMins = Math.max(5, Math.round(routinePlayer.totalElapsedSeconds / 60) || plannedMins);
    let startTime = routinePlayer.routineStartTimeStr || getNowTimeStr();
    if (timeToMinutes(startTime) >= 23 * 60 + 55) {
      startTime = '23:54';
    }
    const endTime = minutesToTime(timeToMinutes(startTime) + actualMins);
    const recordDate = routinePlayer.startDateStr || todayStr;

    state.actualLogs.push({
      id: uid('act'),
      title: `${rtn.name} 완주`,
      date: recordDate,
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
    const prevId = routinePlayer.activeRoutineId;
    clearInterval(routinePlayer.intervalId);
    routinePlayer.running = false;
    routinePlayer.paused = false;
    routinePlayer.activeRoutineId = null;
    if (prevId) selectedPreviewRoutineId = prevId;
    releaseWakeLock();
    renderRoutinePlayerTab();
    updateTopBannerUI();
    showToast('루틴 실행을 종료했습니다.');
  }

  function updateRoutinePlayerUI() {
    const rtn = getTargetRoutineForPlayer();

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

    const btnPrev = document.getElementById('playerPrevStepBtn');
    const btnComplete = document.getElementById('playerCompleteStepBtn');
    const btnAdd5 = document.getElementById('playerAdd5MinBtn');
    const btnPause = document.getElementById('playerPauseResumeBtn');
    const btnSkip = document.getElementById('playerSkipStepBtn');
    const btnStop = document.getElementById('playerStopRoutineBtn');

    if (!rtn) {
      if (nameEl) nameEl.textContent = '등록된 루틴이 없습니다';
      if (badgeEl) badgeEl.textContent = '대기';
      if (stepCounterEl) stepCounterEl.textContent = '0 / 0 단계';
      if (totalRemainEl) totalRemainEl.textContent = '총 0분';
      if (stepTitleEl) stepTitleEl.textContent = '새 루틴을 추가해 보세요';
      if (countdownEl) countdownEl.textContent = '00:00';
      overtimeEl?.classList.add('hidden');
      if (tipEl) tipEl.textContent = '좌측 루틴 목록에서 새 루틴을 만들거나 AI 루틴 생성을 이용해 보세요.';
      if (nextStepEl) nextStepEl.textContent = '루틴을 시작하면 다음 단계가 이곳에 표시됩니다.';
      if (queueListEl) queueListEl.innerHTML = '';
      if (btnPrev) btnPrev.disabled = true;
      if (btnComplete) btnComplete.disabled = true;
      if (btnAdd5) btnAdd5.disabled = true;
      if (btnPause) btnPause.disabled = true;
      if (btnSkip) btnSkip.disabled = true;
      if (btnStop) btnStop.disabled = true;
      return;
    }

    const cat = getCategoryById(rtn.categoryId);
    const totalMins = rtn.steps.reduce((acc, s) => acc + Number(s.minutes || 0), 0);

    nameEl.textContent = rtn.name;
    badgeEl.textContent = cat.name;
    totalRemainEl.textContent = `총 ${totalMins}분`;

    const isRunning = routinePlayer.running && routinePlayer.activeRoutineId === rtn.id;
    const currentIdx = isRunning ? routinePlayer.stepIndex : 0;
    if (btnPrev) btnPrev.disabled = !isRunning || currentIdx <= 0;
    if (btnComplete) {
      btnComplete.disabled = false;
      btnComplete.textContent = isRunning ? '다음 단계' : '루틴 시작';
    }
    btnAdd5.disabled = !isRunning;
    btnPause.disabled = !isRunning;
    btnSkip.disabled = !isRunning;
    btnStop.disabled = !isRunning;
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
    const pauseBtn = document.getElementById('bannerPauseBtn');
    const completeBtn = document.getElementById('bannerCompleteBtn');

    if (routinePlayer.running) {
      const rtn = state.routines.find(r => r.id === routinePlayer.activeRoutineId);
      const step = rtn?.steps?.[routinePlayer.stepIndex];
      const remain = routinePlayer.stepTargetSeconds - routinePlayer.stepElapsedSeconds;
      banner.classList.remove('hidden');
      typeEl.textContent = routinePlayer.paused ? '루틴 일시정지' : '루틴 실행 중';
      titleEl.textContent = `${rtn ? rtn.name : ''} · ${step ? step.title : ''}`;
      if (remain >= 0) {
        const mm = String(Math.floor(remain / 60)).padStart(2, '0');
        const ss = String(remain % 60).padStart(2, '0');
        clockEl.textContent = `${mm}:${ss}`;
      } else {
        const over = Math.abs(remain);
        const mm = String(Math.floor(over / 60)).padStart(2, '0');
        const ss = String(over % 60).padStart(2, '0');
        clockEl.textContent = `+${mm}:${ss}`;
      }
      if (pauseBtn) {
        pauseBtn.classList.remove('hidden');
        pauseBtn.textContent = routinePlayer.paused ? '다시 시작' : '일시정지';
      }
      if (completeBtn) completeBtn.textContent = '단계 완료';
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
      if (pauseBtn) pauseBtn.classList.add('hidden');
      if (completeBtn) completeBtn.textContent = '측정 완료';
      return;
    }

    banner.classList.add('hidden');
  }

  // -------------------- 탭 3: 주간 · 월간 전체 조망 및 공통 주별/월별 렌더러 --------------------
  function syncCalendarPanelsUI() {
    const layoutEl = document.getElementById('calendarOverviewLayout');
    const sideEl = document.getElementById('calendarSidePanel');
    const backdropEl = document.getElementById('calendarSideBackdrop');
    const msBtn = document.getElementById('toggleMilestonePanelBtn');
    const toolsDrawer = document.getElementById('calToolsDrawer');
    const toolsBtn = document.getElementById('toggleCalToolsBtn');
    const isMobileModal = isMobileMilestoneModalViewport();

    layoutEl?.classList.toggle('with-side', calSideOpen && !isMobileModal);
    sideEl?.classList.toggle('hidden', !calSideOpen);
    backdropEl?.classList.toggle('hidden', !(calSideOpen && isMobileModal));

    if (msBtn) {
      msBtn.classList.toggle('active', calSideOpen);
      msBtn.setAttribute('aria-expanded', String(calSideOpen));
    }
    toolsDrawer?.classList.toggle('hidden', !calToolsOpen);
    if (toolsBtn) {
      toolsBtn.classList.toggle('active', calToolsOpen);
      toolsBtn.setAttribute('aria-expanded', String(calToolsOpen));
      toolsBtn.textContent = calToolsOpen ? '도구 ▴' : '도구 ▾';
    }
  }

  function renderCalendarOverviewTab() {
    const year = fullCalCursor.getFullYear();
    const month = fullCalCursor.getMonth();
    const titleEl = document.getElementById('calHeaderTitle');
    const monthView = document.getElementById('monthCalendarView');
    const weekView = document.getElementById('weekMatrixView');
    const monthToolbar = document.getElementById('calMonthToolbar');
    const weekToolbar = document.getElementById('calWeekToolbar');

    syncCalendarPanelsUI();

    // 상단 주별/월별 탭 버튼 동기화
    document.querySelectorAll('#calPrimaryViewTabs [data-calview]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.calview === currentCalView);
    });
    document.querySelectorAll('#calMonthFilterTabs [data-monthmode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.monthmode === calMonthMode);
    });
    document.querySelectorAll('#calWeekTrackTabs [data-weekmode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.weekmode === calWeekMode);
    });
    document.querySelectorAll('#calWeekLayoutTabs [data-weeklayout]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.weeklayout === calWeekLayout);
    });
    document.querySelectorAll('#milestoneFilterTabs [data-msfilter]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.msfilter === currentMilestoneFilter);
    });

    if (currentCalView === 'month') {
      monthView.classList.remove('hidden');
      weekView.classList.add('hidden');
      monthToolbar?.classList.remove('hidden');
      weekToolbar?.classList.add('hidden');

      titleEl.textContent = `${year}년 ${month + 1}월`;
      const monthGrid = document.getElementById('monthCalendarGrid');
      renderMonthlyGridInto(monthGrid, year, month, calMonthMode, false);
    } else {
      monthView.classList.add('hidden');
      weekView.classList.remove('hidden');
      monthToolbar?.classList.add('hidden');
      weekToolbar?.classList.remove('hidden');

      const weekInfo = getWeekRangeFromDateStr(selectedDate);
      titleEl.textContent = `${weekInfo.titleLabel}`;

      const boardScrollWrap = document.getElementById('weekBoardScrollWrap');
      const boardGrid = document.getElementById('weekMatrixGrid');
      const timetableWrap = document.getElementById('weekTimetableWrap');
      const weekResizeBtn = document.getElementById('calWeekResizeModeBtn');
      const effectiveWeekLayout = isMobileCalendarViewport() ? 'board' : calWeekLayout;
      weekResizeBtn?.classList.toggle('hidden', effectiveWeekLayout !== 'timetable');

      const formatWeekSummaryLine = wStats => {
        if (!wStats) return '';
        const ratePart =
          wStats.totalPlanMins > 0
            ? ` · 실행률 ${Math.min(999, Math.round((wStats.totalActualMins / wStats.totalPlanMins) * 100))}%`
            : '';
        return `계획 ${formatDurationKo(wStats.totalPlanMins)} · 실행 ${formatDurationKo(wStats.totalActualMins)}${ratePart} · 마감 ${wStats.totalTodos}건`;
      };

      if (effectiveWeekLayout === 'timetable') {
        boardScrollWrap?.classList.add('hidden');
        boardGrid.classList.add('hidden');
        timetableWrap.classList.remove('hidden');
        const wStats = renderWeeklyTimetableInto(timetableWrap, weekInfo, calWeekMode);
        const wSummaryEl = document.getElementById('calWeekSummaryBadges');
        if (wSummaryEl && wStats) {
          wSummaryEl.textContent = formatWeekSummaryLine(wStats);
        }
      } else {
        boardScrollWrap?.classList.remove('hidden');
        boardGrid.classList.remove('hidden');
        timetableWrap.classList.add('hidden');
        const wStats = renderWeeklyBoardInto(boardGrid, weekInfo, calWeekMode, false);
        const wSummaryEl = document.getElementById('calWeekSummaryBadges');
        if (wSummaryEl && wStats) {
          wSummaryEl.textContent = formatWeekSummaryLine(wStats);
        }
      }
    }

    renderUpcomingMilestones();
  }

  // 모바일 월간 달력 하단 — 선택한 날짜의 구글 캘린더 스타일 상세 일정·할 일 시트
  function renderMobileMonthDaySheet() {
    const sheetEl = document.getElementById('mobileMonthDaySheet');
    if (!sheetEl) return;
    if (!isMobileCalendarViewport()) {
      sheetEl.innerHTML = '';
      sheetEl.classList.add('hidden');
      return;
    }

    sheetEl.classList.remove('hidden');
    const todayStr = getTodayStr();
    const isToday = selectedDate === todayStr;
    const relLabel = getRelativeDateLabelKo(selectedDate) || '오늘';

    const dayTodos =
      calMonthMode === 'important'
        ? []
        : state.todos.filter(
            t => matchesSelectedProjectTag(t) && doesItemOccurOnDate(t, selectedDate, true)
          );

    const allDayPlans =
      calMonthMode === 'deadline'
        ? []
        : state.schedules
            .filter(s => matchesSelectedProjectTag(s) && doesItemOccurOnDate(s, selectedDate, false))
            .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const dayPlans =
      calMonthMode === 'important' ? allDayPlans.filter(s => s.important) : allDayPlans;

    const dayActuals =
      calMonthMode === 'important' || calMonthMode === 'deadline'
        ? []
        : state.actualLogs
            .filter(a => matchesSelectedProjectTag(a) && a.date === selectedDate)
            .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const headEl = document.createElement('div');
    headEl.className = 'mmds-head';
    headEl.innerHTML = `
      <div class="mmds-head-left">
        <strong class="mmds-date-title">${escapeHtml(formatDateHeadingKo(selectedDate))}</strong>
        <span class="date-rel-badge ${!isToday ? 'is-other-day' : ''}">${escapeHtml(relLabel)}</span>
      </div>
      <div class="mmds-head-actions">
        <button type="button" class="btn-xs btn-outline mmds-add-btn">+ 추가</button>
        <button type="button" class="btn-xs btn-ghost mmds-jump-btn">타임라인 ▸</button>
      </div>
    `;

    headEl.querySelector('.mmds-add-btn').addEventListener('click', () => {
      openItemModalForCreate(calMonthMode === 'deadline' ? 'todo' : 'schedule', '09:00', '10:00');
    });
    headEl.querySelector('.mmds-jump-btn').addEventListener('click', () => {
      syncCalCursorsToSelectedDate(false);
      switchTab('dashboard');
    });

    const listEl = document.createElement('div');
    listEl.className = 'mmds-list';

    dayTodos.forEach(todo => {
      const cat = getCategoryById(todo.categoryId);
      const isDone = isItemCompletedOnDate(todo, selectedDate);
      const isRecurring = todo.repeat && todo.repeat !== 'none';
      const row = document.createElement('div');
      row.className = `mmds-item mmds-todo ${isDone ? 'is-done' : ''}`;
      row.style.borderLeftColor = cat.color;
      row.innerHTML = `
        <input type="checkbox" class="mmds-check" ${isDone ? 'checked' : ''} aria-label="할 일 완료 체크" />
        <div class="mmds-main">
          <div class="mmds-meta">
            <span class="mc-tag-chip deadline">${isRecurring ? '정기 마감' : '마감'}</span>
            <span class="mmds-cat" style="color:${cat.color}">${escapeHtml(cat.name)}</span>
          </div>
          <div class="mmds-title">${escapeHtml(todo.title)}</div>
        </div>
        <button type="button" class="icon-play-btn mmds-play-btn" title="이 할 일 타이머 시작">▶</button>
      `;
      row.querySelector('.mmds-check').addEventListener('click', e => {
        e.stopPropagation();
        pushUndoSnapshot('할 일 완료 상태 변경');
        setItemCompletedOnDate(todo, selectedDate, Boolean(e.target.checked));
        saveState();
        renderAll();
      });
      row.querySelector('.mmds-play-btn').addEventListener('click', e => {
        e.stopPropagation();
        startLiveTrackerWith(todo.title, todo.categoryId, todo.projectTag || '', {
          type: 'todo',
          id: todo.id
        });
      });
      row.addEventListener('click', () => openItemModalForEdit('todo', todo));
      listEl.appendChild(row);
    });

    dayPlans.forEach(plan => {
      const cat = getCategoryById(plan.categoryId);
      const isDone = isItemCompletedOnDate(plan, selectedDate);
      const isRecurring = plan.repeat && plan.repeat !== 'none';
      const row = document.createElement('div');
      row.className = `mmds-item mmds-plan ${isDone ? 'is-done' : ''}`;
      row.style.borderLeftColor = cat.color;
      row.innerHTML = `
        <input type="checkbox" class="mmds-check" ${isDone ? 'checked' : ''} aria-label="일정 완료 체크" />
        <div class="mmds-main">
          <div class="mmds-meta">
            <span class="mmds-time" style="color:${cat.color}">${plan.startTime}~${plan.endTime}</span>
            ${plan.important ? '<span class="important-star">★</span>' : ''}
            ${isRecurring ? '<span class="wk-mini-flag">반복</span>' : ''}
            <span class="mmds-cat">${escapeHtml(cat.name)}</span>
          </div>
          <div class="mmds-title">${escapeHtml(plan.title)}</div>
        </div>
        <button type="button" class="icon-play-btn mmds-play-btn" title="이 일정 타이머 시작">▶</button>
      `;
      row.querySelector('.mmds-check').addEventListener('click', e => {
        e.stopPropagation();
        toggleScheduleCompletedWithActualSync(plan, selectedDate, Boolean(e.target.checked), true);
        saveState();
        renderAll();
      });
      row.querySelector('.mmds-play-btn').addEventListener('click', e => {
        e.stopPropagation();
        startLiveTrackerWith(plan.title, plan.categoryId, plan.projectTag || '', {
          type: 'schedule',
          id: plan.id
        });
      });
      row.addEventListener('click', () => openItemModalForEdit('schedule', plan));
      listEl.appendChild(row);
    });

    dayActuals.forEach(act => {
      const cat = getCategoryById(act.categoryId);
      const dur = durationMinutes(act.startTime, act.endTime);
      const row = document.createElement('div');
      row.className = 'mmds-item mmds-actual';
      row.style.borderLeftColor = cat.color;
      row.innerHTML = `
        <div class="mmds-main">
          <div class="mmds-meta">
            <span class="wk-type-tag actual">실행</span>
            <span class="mmds-time">${act.startTime}~${act.endTime} · ${dur}분</span>
            <span class="mmds-cat" style="color:${cat.color}">${escapeHtml(cat.name)}</span>
          </div>
          <div class="mmds-title">${escapeHtml(act.title)}</div>
        </div>
      `;
      row.addEventListener('click', () => openItemModalForEdit('actual', act));
      listEl.appendChild(row);
    });

    if (listEl.children.length === 0) {
      listEl.innerHTML = `<div class="mmds-empty">선택한 날짜에 등록된 일정이나 할 일이 없습니다.</div>`;
    }

    sheetEl.innerHTML = '';
    sheetEl.appendChild(headEl);
    sheetEl.appendChild(listEl);
  }

  // 월별 달력 렌더러 (PC 와이드 카드 / 모바일 구글 캘린더 스타일 7열 미니 바 지원)
  function renderMonthlyGridInto(grid, year, month, mode = 'focus', isCompact = false) {
    if (!grid) return null;
    grid.innerHTML = '';
    const isMobileMonth = !isCompact && isMobileCalendarViewport();
    grid.classList.toggle('is-mobile-month-grid', isMobileMonth);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const todayStr = getTodayStr();

    let impCount = 0;
    let regCount = 0;
    let todoCount = 0;

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

    cells.forEach((cell, idx) => {
      const dow = idx % 7;
      const div = document.createElement('div');
      div.className = [
        'month-cell',
        isMobileMonth ? 'is-mobile-cell' : '',
        cell.otherMonth ? 'other-month' : '',
        cell.dateStr === todayStr ? 'is-today' : '',
        cell.dateStr === selectedDate ? 'is-selected' : '',
        dow === 0 ? 'sun-cell' : dow === 6 ? 'sat-cell' : ''
      ]
        .filter(Boolean)
        .join(' ');
      makeSlotDroppable(div, { targetType: 'day', targetDate: cell.dateStr });

      const dayTodos = state.todos.filter(
        t => matchesSelectedProjectTag(t) && doesItemOccurOnDate(t, cell.dateStr, true)
      );
      const daySchedules = state.schedules
        .filter(s => matchesSelectedProjectTag(s) && doesItemOccurOnDate(s, cell.dateStr, false))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const importantPlans = daySchedules.filter(s => s.important);
      const regularPlans = daySchedules.filter(s => !s.important);
      const dayActuals = state.actualLogs.filter(
        a => matchesSelectedProjectTag(a) && a.date === cell.dateStr
      );
      const actualMins = dayActuals.reduce((acc, a) => acc + durationMinutes(a.startTime, a.endTime), 0);

      if (!cell.otherMonth) {
        impCount += importantPlans.length;
        regCount += regularPlans.length;
        todoCount += dayTodos.length;
      }

      if (isMobileMonth) {
        // 구글 캘린더 모바일 스타일: 중앙 숫자 원형 강조 + 초슬림 카테고리 컬러 바 최대 3줄
        const head = document.createElement('div');
        head.className = 'mc-date-head mc-mob-date-head';
        head.innerHTML = `<span class="mc-day-num mc-mob-day-num">${cell.day}</span>`;
        div.appendChild(head);

        const stack = document.createElement('div');
        stack.className = 'mc-items-stack mc-mob-stack';

        const mobEntries = [];
        if (mode !== 'important') {
          dayTodos.forEach(todo => {
            const cat = getCategoryById(todo.categoryId);
            mobEntries.push({
              title: todo.title,
              color: cat.color || '#E11D48',
              solid: true,
              isTodo: true,
              done: isItemCompletedOnDate(todo, cell.dateStr)
            });
          });
        }
        if (mode !== 'deadline') {
          importantPlans.forEach(plan => {
            const cat = getCategoryById(plan.categoryId);
            mobEntries.push({
              title: plan.title,
              color: cat.color,
              solid: true,
              isTodo: false,
              done: isItemCompletedOnDate(plan, cell.dateStr)
            });
          });
          if (mode === 'focus' || mode === 'all') {
            regularPlans.forEach(plan => {
              const cat = getCategoryById(plan.categoryId);
              mobEntries.push({
                title: plan.title,
                color: cat.color,
                solid: false,
                isTodo: false,
                done: isItemCompletedOnDate(plan, cell.dateStr)
              });
            });
          }
        }

        const mobMax = 3;
        mobEntries.slice(0, mobMax).forEach(entry => {
          const bar = document.createElement('div');
          bar.className = `mc-mob-bar ${entry.solid ? 'is-solid' : 'is-soft'} ${entry.done ? 'is-done' : ''}`;
          if (entry.solid) {
            bar.style.backgroundColor = entry.color;
            bar.style.color = '#FFFFFF';
          } else {
            bar.style.backgroundColor = `${entry.color}22`;
            bar.style.borderLeftColor = entry.color;
          }
          bar.textContent = entry.title;
          stack.appendChild(bar);
        });

        if (mobEntries.length > mobMax) {
          const more = document.createElement('div');
          more.className = 'mc-mob-more';
          more.textContent = `+${mobEntries.length - mobMax}`;
          stack.appendChild(more);
        }

        div.appendChild(stack);
        div.addEventListener('click', () => {
          selectedDate = cell.dateStr;
          if (cell.otherMonth) {
            syncCalCursorsToSelectedDate(true);
          }
          openDayDetailModal(cell.dateStr);
        });
        grid.appendChild(div);
        return;
      }

      // 상단 날짜 헤더 (PC · 태블릿)
      const head = document.createElement('div');
      head.className = 'mc-date-head';

      const pendingTodoCount = dayTodos.filter(t => !isItemCompletedOnDate(t, cell.dateStr)).length;
      let rightBadgeHtml = '';
      if (mode === 'all' && actualMins > 0) {
        rightBadgeHtml = `<span class="mc-actual-badge">진행 ${formatDurationKo(actualMins)}</span>`;
      } else if (pendingTodoCount > 0 && mode !== 'important') {
        rightBadgeHtml = `<span class="mc-deadline-badge">마감 ${pendingTodoCount}</span>`;
      } else if (importantPlans.length > 0 && mode !== 'deadline') {
        rightBadgeHtml = `<span class="mc-imp-badge">★ ${importantPlans.length}</span>`;
      }

      head.innerHTML = `
        <span class="mc-day-num">${cell.day}일</span>
        <div class="mc-head-right">
          ${rightBadgeHtml}
          <button type="button" class="mc-quick-add-btn" title="이 날짜에 일정 또는 할 일 마감 추가">+</button>
        </div>
      `;

      head.querySelector('.mc-quick-add-btn').addEventListener('click', e => {
        e.stopPropagation();
        selectedDate = cell.dateStr;
        openItemModalForCreate(mode === 'deadline' ? 'todo' : 'schedule', '09:00', '10:00');
      });

      div.appendChild(head);

      // 셀 내부 아이템 목록 구성
      const stack = document.createElement('div');
      stack.className = 'mc-items-stack';

      const maxVisible = isCompact ? 3 : Infinity;
      let renderedCount = 0;

      // 1. 할 일 마감 렌더링 (focus, all, deadline 모드)
      if (mode === 'focus' || mode === 'all' || mode === 'deadline') {
        dayTodos.forEach(todo => {
          if (renderedCount >= maxVisible) return;
          renderedCount++;
          const cat = getCategoryById(todo.categoryId);
          const isTodoDone = isItemCompletedOnDate(todo, cell.dateStr);
          const isRecurring = todo.repeat && todo.repeat !== 'none';
          const pill = document.createElement('div');
          pill.className = `mc-item-pill mc-todo-pill ${isTodoDone ? 'is-done' : ''}`;
          pill.style.borderLeftColor = cat.color;
          pill.innerHTML = `
            <input type="checkbox" class="mc-inline-check" ${isTodoDone ? 'checked' : ''} title="할 일 마감 완료 체크" />
            <span class="mc-tag-chip deadline">${isRecurring ? '정기' : '마감'}</span>
            <span class="mc-item-title">${escapeHtml(todo.title)}</span>
          `;
          pill.querySelector('.mc-inline-check').addEventListener('click', e => {
            e.stopPropagation();
            pushUndoSnapshot('할 일 완료 상태 변경');
            setItemCompletedOnDate(todo, cell.dateStr, Boolean(e.target.checked));
            saveState();
            renderAll();
          });
          if (isCompact) {
            pill.addEventListener('click', e => {
              e.stopPropagation();
              if (e.target.classList.contains('mc-inline-check') || isJustDraggedOrResized()) return;
              openItemModalForEdit('todo', todo);
            });
          }
          makeItemDraggable(pill, 'todo', todo, cell.dateStr);
          stack.appendChild(pill);
        });
      }

      // 2. 주요 일정 렌더링 (focus, all, important 모드)
      if (mode === 'focus' || mode === 'all' || mode === 'important') {
        importantPlans.forEach(plan => {
          if (renderedCount >= maxVisible) return;
          renderedCount++;
          const cat = getCategoryById(plan.categoryId);
          const isPlanDone = isItemCompletedOnDate(plan, cell.dateStr);
          const isRecurring = plan.repeat && plan.repeat !== 'none';
          const pill = document.createElement('div');
          pill.className = `mc-item-pill mc-imp-pill ${isPlanDone ? 'is-done' : ''}`;
          pill.style.background = `${cat.color}18`;
          pill.style.borderLeftColor = cat.color;
          pill.innerHTML = `
            <span class="mc-tag-chip imp" style="background:${cat.color};color:#FFFFFF;">${isRecurring ? '↻' : '★'} ${plan.startTime}</span>
            <span class="mc-item-title mc-imp-title">${escapeHtml(plan.title)}</span>
          `;
          if (isCompact) {
            pill.addEventListener('click', e => {
              e.stopPropagation();
              if (isJustDraggedOrResized()) return;
              openItemModalForEdit('schedule', plan);
            });
          }
          makeItemDraggable(pill, 'schedule', plan, cell.dateStr);
          stack.appendChild(pill);
        });
      }

      // 3. 일반 일정 처리
      if (mode === 'all') {
        regularPlans.forEach(plan => {
          if (renderedCount >= maxVisible) return;
          renderedCount++;
          const cat = getCategoryById(plan.categoryId);
          const isPlanDone = isItemCompletedOnDate(plan, cell.dateStr);
          const pill = document.createElement('div');
          pill.className = `mc-item-pill mc-reg-pill ${isPlanDone ? 'is-done' : ''}`;
          pill.style.background = `${cat.color}12`;
          pill.style.borderLeftColor = cat.color;
          pill.innerHTML = `
            <span class="mc-reg-time" style="color:${cat.color}">${plan.startTime}</span>
            <span class="mc-item-title">${escapeHtml(plan.title)}</span>
          `;
          if (isCompact) {
            pill.addEventListener('click', e => {
              e.stopPropagation();
              if (isJustDraggedOrResized()) return;
              openItemModalForEdit('schedule', plan);
            });
          }
          makeItemDraggable(pill, 'schedule', plan, cell.dateStr);
          stack.appendChild(pill);
        });
      } else if (mode === 'focus' && regularPlans.length > 0) {
        const summaryChip = document.createElement('div');
        summaryChip.className = 'mc-regular-summary';
        summaryChip.textContent = `일반 일정 ${regularPlans.length}건`;
        stack.appendChild(summaryChip);
      }

      // 초과 항목 안내
      const totalRelevant =
        mode === 'deadline'
          ? dayTodos.length
          : mode === 'important'
          ? importantPlans.length
          : mode === 'focus'
          ? dayTodos.length + importantPlans.length
          : dayTodos.length + daySchedules.length;

      if (totalRelevant > maxVisible) {
        const more = document.createElement('div');
        more.className = 'mc-more-count';
        more.textContent = `외 ${totalRelevant - maxVisible}건 더보기`;
        stack.appendChild(more);
      }

      div.appendChild(stack);

      div.addEventListener('click', e => {
        if (e.target.classList.contains('mc-inline-check') || e.target.closest('.mc-quick-add-btn') || isJustDraggedOrResized()) {
          return;
        }
        selectedDate = cell.dateStr;
        if (isCompact) {
          dashScope = 'day';
          renderAll();
          return;
        }
        openDayDetailModal(cell.dateStr);
      });

      grid.appendChild(div);
    });

    return { impCount, regCount, todoCount };
  }

  // 월간 캘린더 날짜 클릭 자세히 보기 모달 렌더러
  function openDayDetailModal(dateStr) {
    dayDetailDate = dateStr || selectedDate || getTodayStr();
    selectedDate = dayDetailDate;
    renderAll();
    renderDayDetailModalContent(dayDetailDate);
    openModalWindow('dayDetailModal');
  }

  function renderDayDetailModalContent(dateStr) {
    const titleEl = document.getElementById('dayDetailTitle');
    const relEl = document.getElementById('dayDetailRelBadge');
    const summaryEl = document.getElementById('dayDetailSummaryStrip');
    const bodyEl = document.getElementById('dayDetailBody');
    if (!titleEl || !summaryEl || !bodyEl || !dateStr) return;

    const todayStr = getTodayStr();
    const isToday = dateStr === todayStr;
    const [y] = dateStr.split('-').map(Number);
    const [ty] = todayStr.split('-').map(Number);
    titleEl.textContent = y !== ty ? `${y}년 ${formatDateHeadingKo(dateStr)}` : formatDateHeadingKo(dateStr);

    if (relEl) {
      relEl.textContent = getRelativeDateLabelKo(dateStr);
      relEl.classList.toggle('is-other-day', !isToday);
    }

    const daySchedules = state.schedules
      .filter(s => matchesSelectedProjectTag(s) && doesItemOccurOnDate(s, dateStr, false))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const dayTodos = state.todos.filter(
      t => matchesSelectedProjectTag(t) && doesItemOccurOnDate(t, dateStr, true)
    );
    const dayActuals = state.actualLogs
      .filter(a => matchesSelectedProjectTag(a) && a.date === dateStr)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const planMins = daySchedules.reduce((acc, s) => acc + durationMinutes(s.startTime, s.endTime), 0);
    const actualMins = dayActuals.reduce((acc, a) => acc + durationMinutes(a.startTime, a.endTime), 0);
    const doneTodoCount = dayTodos.filter(t => isItemCompletedOnDate(t, dateStr)).length;

    summaryEl.innerHTML = `
      <span class="dd-sum-chip plan">계획 ${daySchedules.length}건${planMins > 0 ? ` · ${formatShortDurationKo(planMins)}` : ''}</span>
      <span class="dd-sum-chip todo">할 일 ${dayTodos.length}건${dayTodos.length > 0 ? ` · 완료 ${doneTodoCount}` : ''}</span>
      <span class="dd-sum-chip actual">실행 ${formatShortDurationKo(actualMins)}</span>
    `;

    bodyEl.innerHTML = '';

    if (daySchedules.length === 0 && dayTodos.length === 0 && dayActuals.length === 0) {
      bodyEl.innerHTML = `
        <div class="dd-empty-box">
          <p class="empty-guide">이 날짜에 등록된 일정이나 할 일이 없습니다.</p>
          <p class="dd-empty-sub">하단 버튼으로 일정, 할 일, 실행 기록을 바로 추가할 수 있습니다.</p>
        </div>
      `;
      return;
    }

    // 1. 계획 일정 섹션
    if (daySchedules.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'dd-section';
      sec.innerHTML = `<div class="dd-sec-head"><span class="dd-sec-title">계획 일정</span><span class="dd-sec-count">${daySchedules.length}건</span></div>`;
      const list = document.createElement('div');
      list.className = 'dd-item-list';

      daySchedules.forEach(plan => {
        const cat = getCategoryById(plan.categoryId);
        const isDone = isItemCompletedOnDate(plan, dateStr);
        const pTag = cleanProjectTag(plan.projectTag);
        const repLabel = getRepeatLabelKo(plan.repeat, plan.date);
        const row = document.createElement('div');
        row.className = `dd-item-row ${isDone ? 'is-done' : ''}`;
        row.style.borderLeftColor = cat.color;
        row.innerHTML = `
          <input type="checkbox" class="dd-check" ${isDone ? 'checked' : ''} title="완료 상태 전환" />
          <div class="dd-info">
            <div class="dd-meta-top">
              <span class="dd-time-badge">${plan.startTime} ~ ${plan.endTime}</span>
              <span class="dd-cat-badge" style="color:${cat.color};background:${cat.color}18">${escapeHtml(cat.name)}</span>
              ${plan.important ? '<span class="dd-imp-flag">★ 주요</span>' : ''}
              ${repLabel ? `<span class="dd-sub-flag">${escapeHtml(repLabel)}</span>` : ''}
              ${pTag ? `<span class="dd-tag-flag">@${escapeHtml(pTag)}</span>` : ''}
            </div>
            <div class="dd-item-title">${escapeHtml(plan.title)}</div>
          </div>
          <div class="dd-actions">
            ${isToday && !isDone ? '<button type="button" class="icon-play-btn dd-play-btn" title="지금 바로 타이머 시작">▶</button>' : ''}
          </div>
        `;

        row.querySelector('.dd-check').addEventListener('click', e => {
          e.stopPropagation();
          toggleScheduleCompletedWithActualSync(plan, dateStr, Boolean(e.target.checked), true);
          saveState();
          renderAll();
        });

        row.querySelector('.dd-play-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          startLiveTrackerWith(plan.title, plan.categoryId, pTag, { type: 'schedule', id: plan.id });
        });

        row.addEventListener('click', e => {
          if (e.target.classList.contains('dd-check') || e.target.closest('.dd-play-btn')) return;
          selectedDate = dateStr;
          openItemModalForEdit('schedule', plan);
        });

        list.appendChild(row);
      });

      sec.appendChild(list);
      bodyEl.appendChild(sec);
    }

    // 2. 할 일 · 마감 섹션
    if (dayTodos.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'dd-section';
      sec.innerHTML = `<div class="dd-sec-head"><span class="dd-sec-title">할 일 · 마감</span><span class="dd-sec-count">${dayTodos.length}건</span></div>`;
      const list = document.createElement('div');
      list.className = 'dd-item-list';

      dayTodos.forEach(todo => {
        const cat = getCategoryById(todo.categoryId);
        const isDone = isItemCompletedOnDate(todo, dateStr);
        const pTag = cleanProjectTag(todo.projectTag);
        const repLabel = getRepeatLabelKo(todo.repeat, todo.dueDate);
        const isRecurring = todo.repeat && todo.repeat !== 'none';
        const row = document.createElement('div');
        row.className = `dd-item-row ${isDone ? 'is-done' : ''}`;
        row.style.borderLeftColor = cat.color;
        row.innerHTML = `
          <input type="checkbox" class="dd-check" ${isDone ? 'checked' : ''} title="완료 상태 전환" />
          <div class="dd-info">
            <div class="dd-meta-top">
              <span class="mc-tag-chip deadline">${isRecurring ? '정기 마감' : '할 일 마감'}</span>
              <span class="dd-cat-badge" style="color:${cat.color};background:${cat.color}18">${escapeHtml(cat.name)}</span>
              <span class="dd-sub-flag">예상 ${Number(todo.estimatedMinutes || 30)}분</span>
              ${todo.important ? '<span class="dd-imp-flag">★ 주요</span>' : ''}
              ${repLabel ? `<span class="dd-sub-flag">${escapeHtml(repLabel)}</span>` : ''}
              ${pTag ? `<span class="dd-tag-flag">@${escapeHtml(pTag)}</span>` : ''}
            </div>
            <div class="dd-item-title">${escapeHtml(todo.title)}</div>
          </div>
          <div class="dd-actions">
            ${isToday && !isDone ? '<button type="button" class="icon-play-btn dd-play-btn" title="지금 바로 타이머 시작">▶</button>' : ''}
          </div>
        `;

        row.querySelector('.dd-check').addEventListener('click', e => {
          e.stopPropagation();
          pushUndoSnapshot('할 일 완료 상태 변경');
          setItemCompletedOnDate(todo, dateStr, Boolean(e.target.checked));
          saveState();
          renderAll();
        });

        row.querySelector('.dd-play-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          startLiveTrackerWith(todo.title, todo.categoryId, pTag, { type: 'todo', id: todo.id });
        });

        row.addEventListener('click', e => {
          if (e.target.classList.contains('dd-check') || e.target.closest('.dd-play-btn')) return;
          selectedDate = dateStr;
          openItemModalForEdit('todo', todo);
        });

        list.appendChild(row);
      });

      sec.appendChild(list);
      bodyEl.appendChild(sec);
    }

    // 3. 실행 기록 섹션
    if (dayActuals.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'dd-section';
      sec.innerHTML = `<div class="dd-sec-head"><span class="dd-sec-title">실행 기록</span><span class="dd-sec-count">${dayActuals.length}건</span></div>`;
      const list = document.createElement('div');
      list.className = 'dd-item-list';

      dayActuals.forEach(act => {
        const cat = getCategoryById(act.categoryId);
        const dur = durationMinutes(act.startTime, act.endTime);
        const pTag = cleanProjectTag(act.projectTag);
        const row = document.createElement('div');
        row.className = 'dd-item-row is-actual';
        row.style.borderLeftColor = cat.color;
        row.innerHTML = `
          <div class="dd-info">
            <div class="dd-meta-top">
              <span class="dd-time-badge actual">${act.startTime} ~ ${act.endTime} · ${formatDurationKo(dur)}</span>
              <span class="dd-cat-badge" style="color:${cat.color};background:${cat.color}18">${escapeHtml(cat.name)}</span>
              ${pTag ? `<span class="dd-tag-flag">@${escapeHtml(pTag)}</span>` : ''}
            </div>
            <div class="dd-item-title">${escapeHtml(act.title)}</div>
          </div>
        `;

        row.addEventListener('click', () => {
          selectedDate = dateStr;
          openItemModalForEdit('actual', act);
        });

        list.appendChild(row);
      });

      sec.appendChild(list);
      bodyEl.appendChild(sec);
    }
  }

  // 주별 요일 보드 렌더러 (계획+진행 / 계획만 / 진행만 지원)
  function renderWeeklyBoardInto(grid, weekInfo, mode = 'both', isCompact = false) {
    if (!grid) return { totalPlanMins: 0, totalActualMins: 0, totalTodos: 0 };
    grid.innerHTML = '';

    const todayStr = getTodayStr();
    const showPlan = mode === 'both' || mode === 'plan';
    const showActual = mode === 'both' || mode === 'actual';

    let totalPlanMins = 0;
    let totalActualMins = 0;
    let totalTodos = 0;

    weekInfo.days.forEach(dayObj => {
      const dStr = dayObj.dateStr;
      const plans = state.schedules
        .filter(s => matchesSelectedProjectTag(s) && doesItemOccurOnDate(s, dStr, false))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const actuals = state.actualLogs
        .filter(a => matchesSelectedProjectTag(a) && a.date === dStr)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const todos = state.todos.filter(
        t => matchesSelectedProjectTag(t) && doesItemOccurOnDate(t, dStr, true)
      );

      const planMins = plans.reduce((acc, p) => acc + durationMinutes(p.startTime, p.endTime), 0);
      const actualMins = actuals.reduce((acc, a) => acc + durationMinutes(a.startTime, a.endTime), 0);

      totalPlanMins += planMins;
      totalActualMins += actualMins;
      totalTodos += todos.length;

      const col = document.createElement('div');
      col.className = [
        'week-day-col',
        dStr === todayStr ? 'is-today' : '',
        dStr === selectedDate ? 'is-selected' : ''
      ]
        .filter(Boolean)
        .join(' ');
      makeSlotDroppable(col, { targetType: mode === 'actual' ? 'actual' : 'schedule', targetDate: dStr });

      // 상단 요일 헤더
      const head = document.createElement('div');
      head.className = 'week-day-head';
      head.innerHTML = `
        <div class="wk-head-left">
          <span class="wk-day-title ${dayObj.dayIdx === 0 ? 'sun-text' : dayObj.dayIdx === 6 ? 'sat-text' : ''}">${dayObj.monthDayLabel} ${dayObj.dayName}</span>
          ${dStr === todayStr ? '<span class="wk-today-pill">오늘</span>' : ''}
        </div>
        <button type="button" class="mc-quick-add-btn" title="이 날짜에 항목 추가">+</button>
      `;
      head.querySelector('.mc-quick-add-btn').addEventListener('click', e => {
        e.stopPropagation();
        selectedDate = dStr;
        openItemModalForCreate(mode === 'actual' ? 'actual' : 'schedule', '09:00', '10:00');
      });
      col.appendChild(head);

      // 일일 시간 요약 배지 영역 (한 줄 컴팩트 표시 · 빈 시간 소음 제거)
      const statBox = document.createElement('div');
      statBox.className = 'wk-day-stats';
      if (mode === 'both') {
        const chips = [];
        if (planMins > 0) chips.push(`<span class="wk-stat-chip plan">계획 ${formatShortDurationKo(planMins)}</span>`);
        if (actualMins > 0) chips.push(`<span class="wk-stat-chip actual">실행 ${formatShortDurationKo(actualMins)}</span>`);
        statBox.innerHTML = chips.length > 0 ? chips.join('') : `<span class="wk-stat-empty">${todos.length > 0 ? `마감 ${todos.length}건` : '비어 있음'}</span>`;
      } else if (mode === 'plan') {
        statBox.innerHTML =
          planMins > 0 || plans.length > 0
            ? `<span class="wk-stat-chip plan">계획 ${formatShortDurationKo(planMins)} · ${plans.length}건</span>`
            : `<span class="wk-stat-empty">${todos.length > 0 ? `마감 ${todos.length}건` : '계획 없음'}</span>`;
      } else {
        statBox.innerHTML =
          actualMins > 0 || actuals.length > 0
            ? `<span class="wk-stat-chip actual">실행 ${formatShortDurationKo(actualMins)} · ${actuals.length}건</span>`
            : `<span class="wk-stat-empty">실행 기록 없음</span>`;
      }
      col.appendChild(statBox);

      const dayBody = document.createElement('div');
      dayBody.className = 'wk-day-body';

      const createTodoCard = todo => {
        const cat = getCategoryById(todo.categoryId);
        const isTodoDone = isItemCompletedOnDate(todo, dStr);
        const isRecurring = todo.repeat && todo.repeat !== 'none';
        const tCard = document.createElement('div');
        tCard.className = `wk-item-card wk-todo-card ${isTodoDone ? 'is-done' : ''}`;
        tCard.style.borderLeftColor = cat.color;
        tCard.innerHTML = `
          <div class="wk-card-top">
            <label class="wk-check-wrap">
              <input type="checkbox" class="wk-inline-check" ${isTodoDone ? 'checked' : ''} />
              <span class="wk-type-tag deadline">${isRecurring ? '정기 마감' : '마감'}</span>
            </label>
            ${todo.important ? '<span class="important-star">★</span>' : ''}
          </div>
          <div class="wk-card-title">${escapeHtml(todo.title)}</div>
        `;
        tCard.querySelector('.wk-inline-check').addEventListener('click', e => {
          e.stopPropagation();
          pushUndoSnapshot('할 일 완료 상태 변경');
          setItemCompletedOnDate(todo, dStr, Boolean(e.target.checked));
          saveState();
          renderAll();
        });
        tCard.addEventListener('click', e => {
          e.stopPropagation();
          if (e.target.tagName === 'INPUT' || e.target.closest('label') || isJustDraggedOrResized()) return;
          openItemModalForEdit('todo', todo);
        });
        makeItemDraggable(tCard, 'todo', todo, dStr);
        return tCard;
      };

      const createPlanCard = item => {
        const cat = getCategoryById(item.categoryId);
        const isPlanDone = isItemCompletedOnDate(item, dStr);
        const isRecurring = item.repeat && item.repeat !== 'none';
        const timeText = mode === 'both' ? item.startTime : `${item.startTime}~${item.endTime}`;
        const card = document.createElement('div');
        card.className = `wk-item-card wk-plan-card ${isPlanDone ? 'is-done' : ''}`;
        card.style.borderLeftColor = cat.color;
        card.title = `${item.startTime}~${item.endTime} ${item.title}`;
        card.innerHTML = `
          <div class="wk-card-top">
            <label class="wk-check-wrap" title="완료 체크 시 실행 시간에 자동 반영됩니다">
              <input type="checkbox" class="wk-inline-check" ${isPlanDone ? 'checked' : ''} />
              <span class="wk-time-range">${isRecurring && mode === 'both' ? '↻ ' : ''}${timeText}</span>
            </label>
            <span class="wk-card-flags">
              ${isRecurring && mode !== 'both' ? '<span class="wk-mini-flag">반복</span>' : ''}
              ${item.important ? '<span class="important-star">★</span>' : ''}
            </span>
          </div>
          <div class="wk-card-title">${escapeHtml(item.title)}</div>
        `;
        card.querySelector('.wk-inline-check').addEventListener('click', e => {
          e.stopPropagation();
          toggleScheduleCompletedWithActualSync(item, dStr, Boolean(e.target.checked), true);
          saveState();
          renderAll();
        });
        card.addEventListener('click', e => {
          e.stopPropagation();
          if (e.target.tagName === 'INPUT' || e.target.closest('label') || isJustDraggedOrResized()) return;
          openItemModalForEdit('schedule', item);
        });
        makeItemDraggable(card, 'schedule', item, dStr);
        return card;
      };

      const createActualCard = item => {
        const cat = getCategoryById(item.categoryId);
        const dur = durationMinutes(item.startTime, item.endTime);
        const timeText = mode === 'both' ? item.startTime : `${item.startTime}~${item.endTime}`;
        const card = document.createElement('div');
        card.className = 'wk-item-card wk-actual-card';
        card.style.borderLeftColor = cat.color;
        card.style.background = `${cat.color}14`;
        card.title = `${item.startTime}~${item.endTime} · ${dur}분 · ${item.title}`;
        card.innerHTML = `
          <div class="wk-card-top">
            <span class="wk-time-range">${timeText}</span>
            <span class="wk-dur-label" style="color:${cat.color}">${dur}분</span>
          </div>
          <div class="wk-card-title">${escapeHtml(item.title)}</div>
        `;
        card.addEventListener('click', e => {
          e.stopPropagation();
          if (isJustDraggedOrResized()) return;
          openItemModalForEdit('actual', item);
        });
        makeItemDraggable(card, 'actual', item, dStr);
        return card;
      };

      if (mode === 'both') {
        const hasAny = todos.length > 0 || plans.length > 0 || actuals.length > 0;
        if (!hasAny) {
          col.classList.add('is-empty-day');
          const empty = document.createElement('p');
          empty.className = 'wk-empty-hint';
          empty.textContent = '+ 클릭하여 추가';
          dayBody.appendChild(empty);
        } else {
          const splitGrid = document.createElement('div');
          splitGrid.className = 'wk-dual-split';

          const planCol = document.createElement('div');
          planCol.className = 'wk-split-col plan-col';
          makeSlotDroppable(planCol, { targetType: 'schedule', targetDate: dStr });
          planCol.innerHTML = `<div class="wk-split-head plan">계획 <span>${todos.length + plans.length}</span></div>`;
          const planList = document.createElement('div');
          planList.className = 'wk-items-list';
          if (todos.length === 0 && plans.length === 0) {
            planList.innerHTML = `<span class="wk-split-empty">없음</span>`;
          } else {
            todos.forEach(t => planList.appendChild(createTodoCard(t)));
            plans.forEach(p => planList.appendChild(createPlanCard(p)));
          }
          planCol.appendChild(planList);

          const actualCol = document.createElement('div');
          actualCol.className = 'wk-split-col actual-col';
          makeSlotDroppable(actualCol, { targetType: 'actual', targetDate: dStr });
          actualCol.innerHTML = `<div class="wk-split-head actual">실행 <span>${actuals.length}</span></div>`;
          const actualList = document.createElement('div');
          actualList.className = 'wk-items-list';
          if (actuals.length === 0) {
            actualList.innerHTML = `<span class="wk-split-empty">기록 없음</span>`;
          } else {
            actuals.forEach(a => actualList.appendChild(createActualCard(a)));
          }
          actualCol.appendChild(actualList);

          splitGrid.appendChild(planCol);
          splitGrid.appendChild(actualCol);
          dayBody.appendChild(splitGrid);
        }
      } else {
        const listWrap = document.createElement('div');
        listWrap.className = 'wk-items-list';
        if (showPlan) {
          todos.forEach(t => listWrap.appendChild(createTodoCard(t)));
          plans.forEach(p => listWrap.appendChild(createPlanCard(p)));
        }
        if (showActual) {
          actuals.forEach(a => listWrap.appendChild(createActualCard(a)));
        }
        if (listWrap.children.length === 0) {
          col.classList.add('is-empty-day');
          const empty = document.createElement('p');
          empty.className = 'wk-empty-hint';
          empty.textContent = '+ 클릭하여 추가';
          listWrap.appendChild(empty);
        }
        dayBody.appendChild(listWrap);
      }

      col.appendChild(dayBody);

      col.addEventListener('click', () => {
        selectedDate = dStr;
        if (isCompact) {
          dashScope = 'day';
        }
        renderAll();
      });

      col.addEventListener('dblclick', e => {
        if (e.target.closest('button') || e.target.closest('.wk-item-card')) return;
        selectedDate = dStr;
        syncCalCursorsToSelectedDate(false);
        switchTab('dashboard');
      });

      grid.appendChild(col);
    });

    return { totalPlanMins, totalActualMins, totalTodos };
  }

  // 주별 시간대별 표 (06:00~23:00 × 월~일 7일 · 요일별 계획/실행 2열 분리) 렌더러
  function renderWeeklyTimetableInto(container, weekInfo, mode = 'both') {
    if (!container) return { totalPlanMins: 0, totalActualMins: 0, totalTodos: 0 };
    container.innerHTML = '';

    const todayStr = getTodayStr();
    const nowHour = new Date().getHours();
    const showPlan = mode === 'both' || mode === 'plan';
    const showActual = mode === 'both' || mode === 'actual';

    let totalPlanMins = 0;
    let totalActualMins = 0;
    let totalTodos = 0;

    const table = document.createElement('div');
    table.className = `wk-timetable-grid ${mode === 'both' ? 'is-dual-mode' : 'is-single-mode'}`;

    // 1. 헤더 행 및 요일·시간대별 인덱스 사전 구성
    const headRow = document.createElement('div');
    headRow.className = 'wk-tt-row wk-tt-header-row';
    headRow.innerHTML = `<div class="wk-tt-time-cell">시간</div>`;

    let minWeekHour = 6;
    const plansByDayHour = new Map();
    const actualsByDayHour = new Map();
    const hasTodayInWeek = weekInfo.days.some(d => d.dateStr === todayStr);

    weekInfo.days.forEach(dayObj => {
      const dStr = dayObj.dateStr;
      const dayPlans = state.schedules.filter(
        s => matchesSelectedProjectTag(s) && doesItemOccurOnDate(s, dStr, false)
      );
      const dayActuals = state.actualLogs.filter(
        a => matchesSelectedProjectTag(a) && a.date === dStr
      );
      const dayTodos = state.todos.filter(
        t => matchesSelectedProjectTag(t) && doesItemOccurOnDate(t, dStr, true)
      );

      const pBuckets = Array.from({ length: 24 }, () => []);
      dayPlans.forEach(s => {
        const h = Math.max(0, Math.min(23, Math.floor(timeToMinutes(s.startTime) / 60)));
        pBuckets[h].push(s);
        if (showPlan && h < minWeekHour) minWeekHour = h;
      });
      plansByDayHour.set(dStr, pBuckets);

      const aBuckets = Array.from({ length: 24 }, () => []);
      dayActuals.forEach(a => {
        const h = Math.max(0, Math.min(23, Math.floor(timeToMinutes(a.startTime) / 60)));
        aBuckets[h].push(a);
        if (showActual && h < minWeekHour) minWeekHour = h;
      });
      actualsByDayHour.set(dStr, aBuckets);

      const pMins = dayPlans.reduce((s, x) => s + durationMinutes(x.startTime, x.endTime), 0);
      const aMins = dayActuals.reduce((s, x) => s + durationMinutes(x.startTime, x.endTime), 0);
      totalPlanMins += pMins;
      totalActualMins += aMins;
      totalTodos += dayTodos.length;

      const hCell = document.createElement('div');
      hCell.className = [
        'wk-tt-day-head',
        dStr === todayStr ? 'is-today' : '',
        dayObj.dayIdx === 0 ? 'is-sun' : dayObj.dayIdx === 6 ? 'is-sat' : ''
      ]
        .filter(Boolean)
        .join(' ');

      if (mode === 'both') {
        hCell.innerHTML = `
          <div class="wk-tt-day-top">
            <span class="wk-tt-day-label">${dayObj.monthDayLabel} ${dayObj.dayName}</span>
            ${dStr === todayStr ? '<span class="wk-tt-today-pill">오늘</span>' : ''}
          </div>
          <div class="wk-tt-subhead-split">
            <span class="wk-tt-subcol plan">계획${pMins > 0 ? ` ${formatShortDurationKo(pMins)}` : ''}</span>
            <span class="wk-tt-subcol actual">실행${aMins > 0 ? ` ${formatShortDurationKo(aMins)}` : ''}</span>
          </div>
        `;
      } else {
        const subStat =
          mode === 'plan'
            ? `계획 ${formatShortDurationKo(pMins)}`
            : `실행 ${formatShortDurationKo(aMins)}`;
        hCell.innerHTML = `
          <div class="wk-tt-day-top">
            <span class="wk-tt-day-label">${dayObj.monthDayLabel} ${dayObj.dayName}</span>
            ${dStr === todayStr ? '<span class="wk-tt-today-pill">오늘</span>' : ''}
          </div>
          <div class="wk-tt-day-sub">${subStat}</div>
        `;
      }
      headRow.appendChild(hCell);
    });
    table.appendChild(headRow);

    const buildPlanChip = (p, dStr, compactTime = false) => {
      const cat = getCategoryById(p.categoryId);
      const isPlanDone = isItemCompletedOnDate(p, dStr);
      const dur = durationMinutes(p.startTime, p.endTime);
      const chip = document.createElement('div');
      chip.className = `wk-tt-chip plan ${isPlanDone ? 'is-done' : ''}`;
      chip.style.borderLeftColor = cat.color;
      chip.title = `${p.startTime}~${p.endTime} · ${dur}분 · ${p.title}`;
      const timeLabel = compactTime
        ? `${p.repeat && p.repeat !== 'none' ? '↻ ' : ''}${p.startTime}~${p.endTime}`
        : `${p.repeat && p.repeat !== 'none' ? '↻' : '계획'} ${p.startTime}~${p.endTime} · ${dur}분`;
      chip.innerHTML = `
        <span class="wk-tt-chip-tag plan">${timeLabel}</span>
        <span class="wk-tt-chip-title">${p.important ? '★ ' : ''}${escapeHtml(p.title)}</span>
      `;
      chip.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target.closest('.tb-resize-handle') || isJustDraggedOrResized()) return;
        openItemModalForEdit('schedule', p);
      });
      makeItemDraggable(chip, 'schedule', p, dStr);
      const tagEl = chip.querySelector('.wk-tt-chip-tag');
      attachDurationResizeHandle(chip, p, (previewEnd, previewDur) => {
        if (tagEl) {
          tagEl.textContent = compactTime
            ? `${p.repeat && p.repeat !== 'none' ? '↻ ' : ''}${p.startTime}~${previewEnd}`
            : `${p.repeat && p.repeat !== 'none' ? '↻' : '계획'} ${p.startTime}~${previewEnd} · ${previewDur}분`;
        }
      });
      return chip;
    };

    const buildActualChip = (a, dStr, compactTime = false) => {
      const cat = getCategoryById(a.categoryId);
      const dur = durationMinutes(a.startTime, a.endTime);
      const chip = document.createElement('div');
      chip.className = 'wk-tt-chip actual';
      chip.style.borderLeftColor = cat.color;
      chip.style.background = `${cat.color}18`;
      chip.title = `${a.startTime}~${a.endTime} · ${dur}분 · ${a.title}`;
      const timeLabel = compactTime
        ? `${a.startTime}~${a.endTime}`
        : `실행 ${a.startTime}~${a.endTime} · ${dur}분`;
      chip.innerHTML = `
        <span class="wk-tt-chip-tag actual">${timeLabel}</span>
        <span class="wk-tt-chip-title">${escapeHtml(a.title)}</span>
      `;
      chip.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target.closest('.tb-resize-handle') || isJustDraggedOrResized()) return;
        openItemModalForEdit('actual', a);
      });
      makeItemDraggable(chip, 'actual', a, dStr);
      const tagEl = chip.querySelector('.wk-tt-chip-tag');
      attachDurationResizeHandle(chip, a, (previewEnd, previewDur) => {
        if (tagEl) {
          tagEl.textContent = compactTime
            ? `${a.startTime}~${previewEnd}`
            : `실행 ${a.startTime}~${previewEnd} · ${previewDur}분`;
        }
      });
      return chip;
    };

    // 2. 시간 행 (조기 일정이 있으면 06시 이전부터 자동 표시)
    const rowsFrag = document.createDocumentFragment();
    for (let hour = minWeekHour; hour <= 23; hour++) {
      const hourStr = `${String(hour).padStart(2, '0')}:00`;
      const nextHourStr = hour === 23 ? '23:59' : `${String(hour + 1).padStart(2, '0')}:00`;
      const row = document.createElement('div');
      row.className = `wk-tt-row ${hasTodayInWeek && hour === nowHour ? 'is-current-hour' : ''}`;

      const timeCell = document.createElement('div');
      timeCell.className = 'wk-tt-time-cell';
      timeCell.textContent = hourStr;
      row.appendChild(timeCell);

      weekInfo.days.forEach(dayObj => {
        const dStr = dayObj.dateStr;
        const plansInHour = plansByDayHour.get(dStr)?.[hour] || [];
        const actualsInHour = actualsByDayHour.get(dStr)?.[hour] || [];

        if (mode === 'both') {
          const dayPair = document.createElement('div');
          dayPair.className = `wk-tt-day-pair ${dStr === todayStr ? 'is-today-col' : ''}`;

          const planSlot = document.createElement('div');
          planSlot.className = 'wk-tt-subslot plan-slot';
          planSlot.title = `${dayObj.monthDayLabel} ${hourStr} 계획 일정 추가`;
          makeSlotDroppable(planSlot, {
            targetType: 'schedule',
            targetDate: dStr,
            targetHour: hour
          });
          plansInHour.forEach(p => planSlot.appendChild(buildPlanChip(p, dStr, true)));
          planSlot.addEventListener('click', () => {
            if (isJustDraggedOrResized()) return;
            selectedDate = dStr;
            openItemModalForCreate('schedule', hourStr, nextHourStr);
          });

          const actualSlot = document.createElement('div');
          actualSlot.className = 'wk-tt-subslot actual-slot';
          actualSlot.title = `${dayObj.monthDayLabel} ${hourStr} 실행 기록 추가`;
          makeSlotDroppable(actualSlot, {
            targetType: 'actual',
            targetDate: dStr,
            targetHour: hour
          });
          actualsInHour.forEach(a => actualSlot.appendChild(buildActualChip(a, dStr, true)));
          actualSlot.addEventListener('click', () => {
            if (isJustDraggedOrResized()) return;
            selectedDate = dStr;
            openItemModalForCreate('actual', hourStr, nextHourStr);
          });

          dayPair.appendChild(planSlot);
          dayPair.appendChild(actualSlot);
          row.appendChild(dayPair);
        } else {
          const slot = document.createElement('div');
          slot.className = `wk-tt-slot ${dStr === todayStr ? 'is-today-col' : ''}`;
          makeSlotDroppable(slot, {
            targetType: mode === 'actual' ? 'actual' : 'schedule',
            targetDate: dStr,
            targetHour: hour
          });
          if (showPlan) {
            plansInHour.forEach(p => slot.appendChild(buildPlanChip(p, dStr, false)));
          }
          if (showActual) {
            actualsInHour.forEach(a => slot.appendChild(buildActualChip(a, dStr, false)));
          }
          slot.addEventListener('click', () => {
            if (isJustDraggedOrResized()) return;
            selectedDate = dStr;
            openItemModalForCreate(mode === 'actual' ? 'actual' : 'schedule', hourStr, nextHourStr);
          });
          row.appendChild(slot);
        }
      });

      rowsFrag.appendChild(row);
    }

    table.appendChild(rowsFrag);
    container.appendChild(table);
    return { totalPlanMins, totalActualMins, totalTodos };
  }

  // 우측 주요 일정 및 할 일 마감 리스트 렌더링
  function renderUpcomingMilestones() {
    const container = document.getElementById('upcomingMilestoneList');
    if (!container) return;

    const scheduleItems = state.schedules
      .filter(s => matchesSelectedProjectTag(s))
      .filter(s => (currentMilestoneFilter === 'important' ? s.important : currentMilestoneFilter === 'all'))
      .map(s => {
        const nextDate = getNextOccurrenceDateStr(s, selectedDate, false);
        return {
          kind: 'schedule',
          ref: s,
          date: nextDate,
          time: `${s.startTime}~${s.endTime}`,
          title: s.title,
          categoryId: s.categoryId,
          projectTag: cleanProjectTag(s.projectTag),
          repeatLabel: getRepeatLabelKo(s.repeat, s.date),
          important: Boolean(s.important),
          completed: isItemCompletedOnDate(s, nextDate)
        };
      });

    const todoItems =
      currentMilestoneFilter === 'important'
        ? []
        : state.todos
            .filter(t => matchesSelectedProjectTag(t))
            .filter(t => Boolean(t.dueDate) || (t.repeat && t.repeat !== 'none'))
            .map(t => {
              const nextDate = getNextOccurrenceDateStr(t, selectedDate, true);
              return {
                kind: 'todo',
                ref: t,
                date: nextDate,
                time: '할 일 마감',
                title: t.title,
                categoryId: t.categoryId,
                projectTag: cleanProjectTag(t.projectTag),
                repeatLabel: getRepeatLabelKo(t.repeat, t.dueDate),
                important: Boolean(t.important),
                completed: isItemCompletedOnDate(t, nextDate)
              };
            });

    let combined = [];
    if (currentMilestoneFilter === 'deadline') {
      combined = todoItems;
    } else if (currentMilestoneFilter === 'important') {
      combined = scheduleItems;
    } else {
      const keySchedules = scheduleItems.filter(s => s.important);
      const otherSchedules = scheduleItems.filter(s => !s.important);
      combined = [...todoItems, ...keySchedules, ...otherSchedules];
    }

    combined.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return Number(b.important) - Number(a.important);
    });

    if (combined.length === 0) {
      container.innerHTML = `<p class="empty-guide">표시할 주요 일정이나 마감 할 일이 없습니다.</p>`;
      return;
    }

    container.innerHTML = '';
    combined.slice(0, 20).forEach(item => {
      const cat = getCategoryById(item.categoryId);
      const dday = getDdayBadgeInfo(item.date, item.completed);
      const el = document.createElement('div');
      el.className = `milestone-item ${item.completed ? 'is-done' : ''}`;
      el.innerHTML = `
        <div class="ms-item-top">
          <div class="ms-badges-left">
            <span class="ms-type-badge ${item.kind === 'todo' ? 'deadline' : item.important ? 'important' : 'normal'}">${item.kind === 'todo' ? '할 일 마감' : item.important ? '★ 주요 일정' : '일정'}</span>
            <span class="ms-dday-badge ${dday.cls}">${dday.text}</span>
          </div>
          <span class="ms-date-inline">${item.date}${item.kind === 'schedule' ? ` · ${item.time}` : ''}</span>
        </div>
        <div class="ms-item-body">
          <input type="checkbox" class="ms-check" ${item.completed ? 'checked' : ''} title="완료 상태 전환" />
          <div class="ms-title-wrap">
            <div class="ms-title-text">${escapeHtml(item.title)}</div>
            <div class="ms-sub-meta">
              <span class="ms-cat-chip" style="color:${cat.color}"><i class="ms-cat-dot" style="background:${cat.color}"></i>${escapeHtml(cat.name)}</span>
              ${item.repeatLabel ? `<span class="ms-meta-sep">·</span><span class="ms-repeat-text">${escapeHtml(item.repeatLabel)}</span>` : ''}
              ${item.projectTag ? `<span class="ms-meta-sep">·</span><span class="ms-ptag-text">@${escapeHtml(item.projectTag)}</span>` : ''}
            </div>
          </div>
        </div>
      `;

      el.querySelector('.ms-check').addEventListener('click', e => {
        e.stopPropagation();
        if (item.kind === 'schedule') {
          toggleScheduleCompletedWithActualSync(item.ref, item.date, Boolean(e.target.checked), true);
        } else {
          pushUndoSnapshot('할 일 완료 상태 변경');
          setItemCompletedOnDate(item.ref, item.date, Boolean(e.target.checked));
        }
        saveState();
        renderAll();
      });

      el.addEventListener('click', e => {
        if (e.target.classList.contains('ms-check')) return;
        selectedDate = item.date;
        openItemModalForEdit(item.kind === 'todo' ? 'todo' : 'schedule', item.ref);
      });

      container.appendChild(el);
    });
  }

  // -------------------- 탭 4: 타임트래커 분석 보고서 & 다음 달 목표 설계 --------------------
  function getReportDateRange(period, baseDateStr) {
    const todayStr = getTodayStr();
    const refStr = baseDateStr || todayStr;
    const [ty, tm] = todayStr.split('-').map(Number);
    const thisYm = `${ty}-${String(tm).padStart(2, '0')}`;
    const prevDateObj = new Date(ty, tm - 2, 1);
    const lastYm = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, '0')}`;

    if (period === 'today') {
      return {
        startDate: refStr,
        endDate: refStr,
        dateList: [refStr],
        periodKey: `today:${refStr}`,
        periodLabel: '오늘',
        periodFullLabel: `오늘 · ${formatShortMonthDayKo(refStr)}`
      };
    }

    if (period === 'last7Days') {
      const startDate = addDaysStr(refStr, -6);
      const dateList = [];
      for (let i = 0; i < 7; i++) {
        dateList.push(addDaysStr(startDate, i));
      }
      return {
        startDate,
        endDate: refStr,
        dateList,
        periodKey: `last7Days:${refStr}`,
        periodLabel: '최근 7일',
        periodFullLabel: `최근 7일 · ${formatShortMonthDayKo(startDate)}~${formatShortMonthDayKo(refStr)}`
      };
    }

    let targetYear = reportCursor.getFullYear();
    let targetMonthIdx = reportCursor.getMonth();

    if (period === 'thisMonth') {
      targetYear = ty;
      targetMonthIdx = tm - 1;
      reportCursor = new Date(targetYear, targetMonthIdx, 1);
    } else if (period === 'lastMonth') {
      targetYear = prevDateObj.getFullYear();
      targetMonthIdx = prevDateObj.getMonth();
      reportCursor = new Date(targetYear, targetMonthIdx, 1);
    }

    const ymKey = `${targetYear}-${String(targetMonthIdx + 1).padStart(2, '0')}`;
    const lastDay = new Date(targetYear, targetMonthIdx + 1, 0).getDate();
    const dateList = [];
    for (let d = 1; d <= lastDay; d++) {
      dateList.push(toDateStr(new Date(targetYear, targetMonthIdx, d)));
    }

    const shortLabel =
      ymKey === thisYm ? '이번 달' : ymKey === lastYm ? '지난달' : `${targetMonthIdx + 1}월`;

    return {
      startDate: dateList[0],
      endDate: dateList[dateList.length - 1],
      dateList,
      periodKey: `month:${ymKey}`,
      ymKey,
      periodLabel: shortLabel,
      periodFullLabel: `${targetYear}년 ${targetMonthIdx + 1}월`
    };
  }

  function computeReportStatistics() {
    const baseDateStr = selectedDate || getTodayStr();
    const range = getReportDateRange(currentReportPeriod, baseDateStr);
    const dateSet = new Set(range.dateList);

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

    // 정기 반복 일정을 포함해 선택 기간 내 모든 발생 날짜의 계획 시간 합산 (리포트는 프로젝트 태그 필터와 무관하게 전체 기간 집계)
    state.schedules.forEach(p => {
      const bucket = byCategory[p.categoryId] || Object.values(byCategory)[0];
      if (!bucket) return;
      const dur = durationMinutes(p.startTime, p.endTime);
      if (!p.repeat || p.repeat === 'none') {
        if (p.date && dateSet.has(p.date)) {
          bucket.planMinutes += dur;
        }
      } else {
        let occCount = 0;
        for (let i = 0; i < range.dateList.length; i++) {
          if (doesItemOccurOnDate(p, range.dateList[i], false)) {
            occCount += 1;
          }
        }
        bucket.planMinutes += dur * occCount;
      }
    });

    const filteredActuals = state.actualLogs.filter(a => a.date && dateSet.has(a.date));

    filteredActuals.forEach(a => {
      const bucket = byCategory[a.categoryId] || Object.values(byCategory)[0];
      if (bucket) bucket.actualMinutes += durationMinutes(a.startTime, a.endTime);
    });

    const totalPlanMinutes = Object.values(byCategory).reduce((s, x) => s + x.planMinutes, 0);
    const totalActualMinutes = Object.values(byCategory).reduce((s, x) => s + x.actualMinutes, 0);

    // 시간대별 실제 집중 분석
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
      goldenTimeLabel,
      dateList: range.dateList,
      dateSet,
      periodKey: range.periodKey,
      ymKey: range.ymKey || '',
      periodLabel: range.periodLabel,
      periodFullLabel: range.periodFullLabel || range.periodLabel
    };
  }

  function applyAiReportDataToPlan(reportData) {
    if (!reportData) return;
    pushUndoSnapshot('AI 리포트 목표 반영');
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
    reportCardOpenMap.reviewNote = true;
    reportCardOpenMap.timeBudget = true;
    reportCardOpenMap.monthlyGoal = true;
    saveReportCardOpenMap();
    saveState();
    renderReportAndGoalsTab();
    showToast('AI 분석 결과가 회고 노트와 다음 달 시간 예산·목표에 반영되었습니다.', { withUndo: true });
  }

  function renderSavedAiReportForPeriod(stats) {
    const box = document.getElementById('aiReportResultBox');
    const genBtn = document.getElementById('generateAiReportBtn');
    const badgeEl = document.getElementById('aiReportPeriodBadge');
    if (badgeEl) {
      badgeEl.textContent = stats.periodFullLabel;
    }
    if (!box) return;

    const saved =
      state.aiReportsByPeriod && stats.periodKey ? state.aiReportsByPeriod[stats.periodKey] : null;

    if (genBtn && !genBtn.disabled) {
      genBtn.textContent = saved ? '다시 분석' : '리포트 생성';
    }

    if (!saved) {
      box.innerHTML = `<p class="empty-guide">${escapeHtml(stats.periodFullLabel)} 데이터를 바탕으로 리포트 생성을 누르면 맞춤 회고 초안과 다음 달 시간 예산을 제안합니다.</p>`;
      return;
    }

    box.innerHTML = `
      <div class="ai-report-block">
        <h4>${escapeHtml(stats.periodFullLabel)} 시간 사용 총평</h4>
        <p><strong>${escapeHtml(saved.headline || '')}</strong></p>
      </div>
      <div class="ai-report-block">
        <h4>계획 대비 실행 및 시간 누수 진단</h4>
        <p>${escapeHtml(saved.timeLeakAnalysis || '')}</p>
      </div>
      <div class="ai-report-block">
        <h4>골든타임 및 루틴 강점 분석</h4>
        <p>${escapeHtml(saved.goldenTimeAnalysis || '')}</p>
      </div>
      <div class="ai-report-block">
        <h4>추천 회고 초안 및 다음 달 액션 플랜</h4>
        <p>• 유지할 점: ${escapeHtml(saved.keep || '')}<br/>
           • 개선할 점: ${escapeHtml(saved.problem || '')}<br/>
           • 다음 달 전략: ${escapeHtml(saved.tryAction || '')}</p>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;">
        <button type="button" id="applyAiReportToPlanBtn" class="btn-primary btn-xs">회고 노트 및 다음 달 목표 예산에 즉시 반영</button>
      </div>
    `;

    document.getElementById('applyAiReportToPlanBtn')?.addEventListener('click', () => {
      applyAiReportDataToPlan(saved);
    });
  }

  function renderReportAndGoalsTab() {
    syncReportToggleCardsUI();
    const stats = computeReportStatistics();
    const todayStr = getTodayStr();
    const [ty, tm] = todayStr.split('-').map(Number);
    const thisYm = `${ty}-${String(tm).padStart(2, '0')}`;
    const prevDateObj = new Date(ty, tm - 2, 1);
    const lastYm = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, '0')}`;

    document.querySelectorAll('#reportPeriodTabs .filter-pill').forEach(btn => {
      const p = btn.dataset.period;
      let isActive = p === currentReportPeriod;
      if (currentReportPeriod === 'customMonth') {
        if (p === 'thisMonth' && stats.ymKey === thisYm) isActive = true;
        else if (p === 'lastMonth' && stats.ymKey === lastYm) isActive = true;
        else isActive = false;
      }
      btn.classList.toggle('active', isActive);
    });

    const monthLabelEl = document.getElementById('reportMonthLabel');
    if (monthLabelEl) {
      monthLabelEl.textContent = stats.periodFullLabel;
    }

    const totalActualHours = (stats.totalActualMinutes / 60).toFixed(1);
    document.getElementById('reportTotalActualText').textContent = `총 ${totalActualHours}시간`;
    renderSavedAiReportForPeriod(stats);

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
          <circle cx="85" cy="85" r="${radius}" fill="none" stroke="var(--border-color)" stroke-width="24" />
          ${segmentsSvg}
          <text x="85" y="80" text-anchor="middle" font-size="12" fill="var(--text-sub)" font-weight="700">${escapeHtml(stats.periodLabel)} 기록</text>
          <text x="85" y="100" text-anchor="middle" font-size="17" fill="var(--text-main)" font-weight="800">${totalActualHours}h</text>
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
              <td style="color:${diffMins < 0 ? 'var(--amber)' : 'var(--success)'};font-weight:700;">
                ${diffSign}${formatDurationKo(Math.abs(diffMins))}
              </td>
              <td><span class="kpi-badge">${execRate}%</span></td>
            </tr>
          `;
        })
        .join('');
    }

    // 2-2. 프로젝트 태그별 투입 시간 및 진행 현황 테이블 (선택 기간 및 정기 일정 발생 횟수 반영)
    const projTbody = document.getElementById('reportProjectTagTableBody');
    if (projTbody) {
      const allTags = getAllProjectTags();
      if (allTags.length === 0) {
        projTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-sub);">등록된 @프로젝트태그가 없습니다. 일정이나 할 일에 프로젝트 태그를 지정해 보세요.</td></tr>`;
      } else {
        projTbody.innerHTML = allTags
          .map(tag => {
            const tagSch = state.schedules.filter(s => cleanProjectTag(s.projectTag) === tag);
            const recSchCount = tagSch.filter(s => s.repeat && s.repeat !== 'none').length;
            let occTotalCount = 0;
            let planMins = 0;
            tagSch.forEach(s => {
              const dur = durationMinutes(s.startTime, s.endTime);
              if (!s.repeat || s.repeat === 'none') {
                if (s.date && stats.dateSet.has(s.date)) {
                  occTotalCount += 1;
                  planMins += dur;
                }
              } else {
                let occ = 0;
                for (let i = 0; i < stats.dateList.length; i++) {
                  if (doesItemOccurOnDate(s, stats.dateList[i], false)) occ += 1;
                }
                occTotalCount += occ;
                planMins += dur * occ;
              }
            });
            const tagTodos = state.todos.filter(t => cleanProjectTag(t.projectTag) === tag);
            const doneTodos = tagTodos.filter(t => {
              if (t.repeat && t.repeat !== 'none') {
                return Array.isArray(t.completedDates) && t.completedDates.some(d => stats.dateSet.has(d));
              }
              return Boolean(t.completed);
            }).length;
            const actMins = state.actualLogs
              .filter(a => cleanProjectTag(a.projectTag) === tag && a.date && stats.dateSet.has(a.date))
              .reduce((sum, a) => sum + durationMinutes(a.startTime, a.endTime), 0);
            return `
              <tr>
                <td><span class="pg-tag-badge">@${escapeHtml(tag)}</span></td>
                <td>기간 내 ${occTotalCount}회${recSchCount > 0 ? ` · 정기 ${recSchCount}종` : ''}</td>
                <td>${doneTodos}/${tagTodos.length} 완료</td>
                <td>${formatDurationKo(planMins)}</td>
                <td><strong>${formatDurationKo(actMins)}</strong></td>
              </tr>
            `;
          })
          .join('');
      }
    }

    // 3. 우측: 회고 노트 반영 (입력 포커스 중에는 덮어쓰지 않음)
    const keepEl = document.getElementById('reviewKeepInput');
    const probEl = document.getElementById('reviewProblemInput');
    const tryEl = document.getElementById('reviewTryInput');
    if (keepEl && document.activeElement !== keepEl) keepEl.value = state.reviewNotes.keep || '';
    if (probEl && document.activeElement !== probEl) probEl.value = state.reviewNotes.problem || '';
    if (tryEl && document.activeElement !== tryEl) tryEl.value = state.reviewNotes.tryAction || '';

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
              <span style="font-size:0.75rem;color:var(--text-sub);font-weight:500;">${escapeHtml(stats.periodLabel)} 실제 ${currentHours}시간</span>
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
        pushUndoSnapshot('월간 목표 삭제');
        state.monthlyGoals = state.monthlyGoals.filter(g => g.id !== goal.id);
        saveState();
        renderMonthlyGoalList();
        showToast(`'${goal.title}' 목표가 삭제되었습니다.`, { withUndo: true });
      });

      container.appendChild(card);
    });
  }

  // -------------------- 알람 감시 · 사전 알림 · 절전 복귀 보정 엔진 --------------------
  function checkScheduledAlarms() {
    const todayStr = getTodayStr();
    const nowMins = timeToMinutes(getNowTimeStr());

    // 이미 알람 모달이 떠 있는 상태면 중복 호출 방지
    const modalEl = document.getElementById('alarmModal');
    if (modalEl && !modalEl.classList.contains('hidden')) return;

    // 1. 오늘 일정 알람 확인 (정기 반복 일정 + 사전 예고 알림 + 절전 복귀 10분 이내 놓친 알람 보정)
    for (let i = 0; i < state.schedules.length; i++) {
      const s = state.schedules[i];
      if (!s.alarm || !s.startTime) continue;
      if (!doesItemOccurOnDate(s, todayStr, false) || isItemCompletedOnDate(s, todayStr)) continue;

      const targetMins = timeToMinutes(s.startTime);
      const leadMins = Math.max(0, Number(s.alarmLeadMinutes || 0));

      // 사전 예고 알림 확인 (사전 예고 시각~시작 시각 직전 구간 보정 포함)
      if (leadMins > 0) {
        const preTarget = targetMins - leadMins;
        if (nowMins >= preTarget && nowMins < targetMins) {
          const preKey = `pre_sch_${s.id}_${todayStr}_${s.startTime}_${leadMins}`;
          if (!triggeredAlarmKeys.has(preKey)) {
            markAlarmKeyTriggered(preKey);
            triggerAlarmModal({
              type: 'schedule',
              alarmKind: 'pre',
              leadMinutes: Math.max(1, targetMins - nowMins),
              title: s.title,
              time: s.startTime,
              categoryId: s.categoryId,
              projectTag: s.projectTag || '',
              refId: s.id
            });
            return;
          }
        }
      }

      // 정각 및 절전 복귀 후 10분 이내 놓친 알람 확인
      const diffMins = nowMins - targetMins;
      if (diffMins >= 0 && diffMins <= 10) {
        const mainKey = `sch_${s.id}_${todayStr}_${s.startTime}`;
        if (!triggeredAlarmKeys.has(mainKey)) {
          markAlarmKeyTriggered(mainKey);
          triggerAlarmModal({
            type: 'schedule',
            alarmKind: diffMins > 1 ? 'catchup' : 'ontime',
            lateMinutes: diffMins,
            title: s.title,
            time: s.startTime,
            categoryId: s.categoryId,
            projectTag: s.projectTag || '',
            refId: s.id
          });
          return;
        }
      }
    }

    // 2. 루틴 시작 알람 확인 (요일별 개별 시작 시각 + 실천 요일 반영 + 사전 예고 알림 + 절전 복귀 10분 보정)
    for (let i = 0; i < state.routines.length; i++) {
      const r = state.routines[i];
      if (!r.alarm) continue;
      if (!doesRoutineOccurOnDate(r, todayStr)) continue;
      const doneToday = Array.isArray(r.completedDates) && r.completedDates.includes(todayStr);
      if (doneToday) continue;

      const rStartTime = getRoutineStartTimeForDate(r, todayStr);
      if (!rStartTime) continue;

      const targetMins = timeToMinutes(rStartTime);
      const leadMins = Math.max(0, Number(r.alarmLeadMinutes || 0));

      if (leadMins > 0) {
        const preTarget = targetMins - leadMins;
        if (nowMins >= preTarget && nowMins < targetMins) {
          const preKey = `pre_rtn_${r.id}_${todayStr}_${rStartTime}_${leadMins}`;
          if (!triggeredAlarmKeys.has(preKey)) {
            markAlarmKeyTriggered(preKey);
            triggerAlarmModal({
              type: 'routine',
              alarmKind: 'pre',
              leadMinutes: Math.max(1, targetMins - nowMins),
              title: r.name,
              time: rStartTime,
              categoryId: r.categoryId,
              refId: r.id
            });
            return;
          }
        }
      }

      const diffMins = nowMins - targetMins;
      if (diffMins >= 0 && diffMins <= 10) {
        const mainKey = `rtn_${r.id}_${todayStr}_${rStartTime}`;
        if (!triggeredAlarmKeys.has(mainKey)) {
          markAlarmKeyTriggered(mainKey);
          triggerAlarmModal({
            type: 'routine',
            alarmKind: diffMins > 1 ? 'catchup' : 'ontime',
            lateMinutes: diffMins,
            title: r.name,
            time: rStartTime,
            categoryId: r.categoryId,
            refId: r.id
          });
          return;
        }
      }
    }
  }

  function triggerAlarmModal(alarmObj) {
    activeAlarmItem = alarmObj;
    const modal = document.getElementById('alarmModal');
    const badgeEl = document.getElementById('alarmModalBadge');
    const descEl = document.getElementById('alarmModalDesc');

    document.getElementById('alarmModalTitle').textContent = alarmObj.title;

    if (alarmObj.alarmKind === 'pre') {
      if (badgeEl) badgeEl.textContent = '사전 예고 알림';
      document.getElementById('alarmModalTime').textContent = `${alarmObj.leadMinutes}분 뒤 시작 예정 · ${alarmObj.time}`;
      if (descEl) descEl.textContent = '곧 시작할 일정이나 루틴을 미리 준비하세요.';
    } else if (alarmObj.alarmKind === 'catchup') {
      if (badgeEl) badgeEl.textContent = '절전 복귀 보정 알림';
      document.getElementById('alarmModalTime').textContent = `예정 시각 ${alarmObj.time} · ${alarmObj.lateMinutes}분 경과`;
      if (descEl) descEl.textContent = '화면 대기 중 지나간 알람을 놓치지 않도록 즉시 알려드립니다.';
    } else {
      if (badgeEl) badgeEl.textContent = '정각 알람 및 리마인드';
      document.getElementById('alarmModalTime').textContent = `예정 시각 ${alarmObj.time}`;
      if (descEl) descEl.textContent = '확인을 누르지 않으면 놓치지 않도록 3분 뒤 다시 알림이 울립니다.';
    }

    openModalWindow('alarmModal');

    const announceAlarm = () => {
      playChimeSound('alarm');
      if (alarmObj.alarmKind === 'pre') {
        speakKorean(`사전 알림입니다. ${alarmObj.leadMinutes}분 뒤 ${alarmObj.title} 시작 예정입니다.`);
        sendBrowserNotification('타임플로우 사전 예고 알림', `${alarmObj.leadMinutes}분 뒤 ${alarmObj.title} · ${alarmObj.time}`);
      } else {
        speakKorean(`알람 시간입니다. ${alarmObj.title}을 시작할 시간입니다.`);
        sendBrowserNotification('타임플로우 정각 알람', `${alarmObj.title} · ${alarmObj.time} 시작할 시간입니다!`);
      }
    };

    announceAlarm();

    // 미확인 시 3분 간격으로 반복 리마인드
    clearInterval(alarmRepeatIntervalId);
    if (alarmObj.alarmKind !== 'pre') {
      alarmRepeatIntervalId = setInterval(() => {
        if (!modal.classList.contains('hidden')) {
          announceAlarm();
        } else {
          clearInterval(alarmRepeatIntervalId);
        }
      }, 180000);
    }
  }

  function closeAlarmModal() {
    closeModalWindow('alarmModal');
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

    const resetQuickBar = () => {
      inputEl.value = '';
      document.getElementById('quickInputSection')?.classList.remove('has-value');
      const previewEl = document.getElementById('quickParsePreview');
      if (previewEl) {
        previewEl.textContent = '시간이나 @프로젝트태그, 매주·매일 키워드를 포함하면 자동 분류됩니다.';
      }
      inputEl.blur();
    };

    try {
      const aiRes = await callCloudflareAi('parse_quick_input', {
        text,
        todayDate: selectedDate,
        currentTime: getNowTimeStr(),
        categories: state.categories
      });

      pushUndoSnapshot('스마트 다중 등록');
      const validCatIds = new Set(state.categories.map(c => c.id));
      const resolveCatId = cid => (cid && validCatIds.has(cid) ? cid : state.categories[0].id);

      if (aiRes) {
        let addedCount = 0;
        const fallbackTag = getActiveRealProjectTag();
        if (Array.isArray(aiRes.schedules)) {
          aiRes.schedules.forEach(s => {
            const st = s.startTime || '09:00';
            let et = s.endTime || '10:00';
            if (timeToMinutes(et) <= timeToMinutes(st)) {
              et = minutesToTime(timeToMinutes(st) + 30);
            }
            state.schedules.push({
              id: uid('sch'),
              title: s.title || '새 일정',
              date: s.date || selectedDate,
              startTime: st,
              endTime: et,
              categoryId: resolveCatId(s.categoryId),
              projectTag: cleanProjectTag(s.projectTag || fallbackTag),
              repeat: s.repeat || 'none',
              completedDates: [],
              alarm: s.alarm !== false,
              alarmLeadMinutes: Number(s.alarmLeadMinutes || 0),
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
              categoryId: resolveCatId(t.categoryId),
              projectTag: cleanProjectTag(t.projectTag || fallbackTag),
              repeat: t.repeat || 'none',
              completedDates: [],
              estimatedMinutes: Math.max(15, Number(t.estimatedMinutes || 30)),
              important: Boolean(t.important),
              completed: false
            });
            addedCount++;
          });
        }
        if (Array.isArray(aiRes.actualLogs)) {
          aiRes.actualLogs.forEach(a => {
            const st = a.startTime || '14:00';
            let et = a.endTime || '15:00';
            if (timeToMinutes(et) <= timeToMinutes(st)) {
              et = minutesToTime(timeToMinutes(st) + 30);
            }
            state.actualLogs.push({
              id: uid('act'),
              title: a.title || '실제 기록',
              date: a.date || selectedDate,
              startTime: st,
              endTime: et,
              categoryId: resolveCatId(a.categoryId),
              projectTag: cleanProjectTag(a.projectTag || fallbackTag)
            });
            addedCount++;
          });
        }
        resetQuickBar();
        saveState();
        renderAll();
        showToast(aiRes.summary || `AI가 총 ${addedCount}건의 항목을 분류해 등록했습니다.`, { withUndo: true });
      } else {
        // 로컬 다중 문장 폴백 파서 (쉼표 또는 '그리고'로 분리)
        const segments = text.split(/,|그리고|및/).map(s => s.trim()).filter(Boolean);
        segments.forEach(seg => {
          const parsed = parseNaturalQuickInput(seg, 'auto', document.getElementById('quickCategorySelect').value);
          if (parsed) applyParsedQuickItem(parsed);
        });
        resetQuickBar();
        saveState();
        renderAll();
        showToast(`${segments.length}건의 항목을 스마트 분류해 등록했습니다.`, { withUndo: true });
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  function applyParsedQuickItem(parsed) {
    if (!parsed) return;
    const tag = cleanProjectTag(parsed.projectTag || getActiveRealProjectTag());
    const repeat = parsed.repeat || 'none';
    if (parsed.type === 'actual') {
      state.actualLogs.push({
        id: uid('act'),
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        categoryId: parsed.categoryId,
        projectTag: tag
      });
    } else if (parsed.type === 'schedule') {
      state.schedules.push({
        id: uid('sch'),
        title: parsed.title,
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        categoryId: parsed.categoryId,
        projectTag: tag,
        repeat,
        completedDates: [],
        alarm: true,
        alarmLeadMinutes: 0,
        important: parsed.important,
        completed: false
      });
    } else {
      state.todos.push({
        id: uid('todo'),
        title: parsed.title,
        dueDate: parsed.date,
        categoryId: parsed.categoryId,
        projectTag: tag,
        repeat,
        completedDates: [],
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
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '설계 중...';

    try {
      const aiRes = await callCloudflareAi('generate_routine', {
        requestText,
        categories: state.categories
      });

      const validCatIds = new Set(state.categories.map(c => c.id));
      const defaultRtnCatId = validCatIds.has('cat_routine') ? 'cat_routine' : state.categories[0].id;

      let newRoutine = null;
      if (aiRes && Array.isArray(aiRes.steps) && aiRes.steps.length > 0) {
        newRoutine = {
          id: uid('rtn'),
          name: aiRes.name || 'AI 맞춤 루틴',
          categoryId: aiRes.categoryId && validCatIds.has(aiRes.categoryId) ? aiRes.categoryId : defaultRtnCatId,
          startTime: aiRes.startTime || '08:00',
          alarm: true,
          alarmLeadMinutes: 0,
          activeDays: [0, 1, 2, 3, 4, 5, 6],
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
          categoryId: defaultRtnCatId,
          startTime: '08:00',
          alarm: true,
          alarmLeadMinutes: 0,
          activeDays: [0, 1, 2, 3, 4, 5, 6],
          completedDates: [],
          steps: [
            { id: uid('st'), title: '주변 환경 정리 및 물 한 잔 준비', minutes: 3, tip: '시작 신호를 몸에 보내는 가벼운 첫 단계입니다.' },
            { id: uid('st'), title: `${requestText} 핵심 행동 집중 실행`, minutes: 15, tip: '타이머가 도는 동안 한 가지에만 몰입합니다.' },
            { id: uid('st'), title: '마무리 점검 및 기록 체크', minutes: 3, tip: '가볍게 성취감을 느끼며 마무리하세요.' }
          ]
        };
      }

      pushUndoSnapshot('AI 루틴 생성');
      state.routines.unshift(newRoutine);
      inputEl.value = '';
      saveState();
      renderAll();
      startRoutinePlayer(newRoutine.id);
      showToast(`'${newRoutine.name}' 루틴이 생성되어 플레이어에 준비되었습니다.`, { withUndo: true });
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  // AI 남은 일정 원클릭 재배치 (정기 반복 일정은 고정 시간으로 보호, 할 일 타임블로킹 및 실행 취소 지원)
  async function handleAiRescheduleDay() {
    const movableSchedules = state.schedules.filter(
      s => s.date === selectedDate && (!s.repeat || s.repeat === 'none') && !isItemCompletedOnDate(s, selectedDate)
    );
    const fixedSchedules = state.schedules.filter(
      s =>
        doesItemOccurOnDate(s, selectedDate, false) &&
        ((s.repeat && s.repeat !== 'none') || isItemCompletedOnDate(s, selectedDate))
    );
    const pendingTodos = state.todos.filter(
      t => !isItemCompletedOnDate(t, selectedDate) && (doesItemOccurOnDate(t, selectedDate, true) || !t.dueDate)
    );

    if (movableSchedules.length === 0 && pendingTodos.length === 0) {
      showToast('선택한 날짜에 재배치할 미완료 일정이나 할 일이 없습니다.');
      return;
    }

    const btn = document.getElementById('aiRescheduleBtn');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '재배치 중...';

    try {
      const aiRes = await callCloudflareAi('reschedule_day', {
        currentTime: selectedDate === getTodayStr() ? getNowTimeStr() : '09:00',
        todayDate: selectedDate,
        schedules: movableSchedules,
        fixedSchedules,
        todos: pendingTodos
      });

      pushUndoSnapshot('AI 일정 재배치');
      const movableMapById = new Map(movableSchedules.map(s => [s.id, s]));
      const movableMapByTitle = new Map(movableSchedules.map(s => [s.title, s]));
      const todoMapById = new Map(pendingTodos.map(t => [t.id, t]));
      const todoMapByTitle = new Map(pendingTodos.map(t => [t.title, t]));
      const movableIdSet = new Set(movableSchedules.map(s => s.id));
      const validCatIds = new Set(state.categories.map(c => c.id));

      if (aiRes && Array.isArray(aiRes.rearrangedSchedules) && aiRes.rearrangedSchedules.length > 0) {
        state.schedules = state.schedules.filter(s => !movableIdSet.has(s.id));
        const convertedTodoIds = new Set();

        aiRes.rearrangedSchedules.forEach(rs => {
          const origSch = movableMapById.get(rs.id) || movableMapByTitle.get(rs.title);
          const origTodo =
            (rs.sourceTodoId && todoMapById.get(rs.sourceTodoId)) ||
            (!origSch ? todoMapById.get(rs.id) || todoMapByTitle.get(rs.title) : null);

          if (origTodo && (!origTodo.repeat || origTodo.repeat === 'none')) {
            convertedTodoIds.add(origTodo.id);
          }

          const st = rs.startTime || '15:00';
          let et = rs.endTime || '16:00';
          if (timeToMinutes(et) <= timeToMinutes(st)) {
            et = minutesToTime(timeToMinutes(st) + Number(origTodo?.estimatedMinutes || 30));
          }
          const rawCat = rs.categoryId || origSch?.categoryId || origTodo?.categoryId || state.categories[0].id;
          state.schedules.push({
            id: origSch?.id || uid('sch'),
            title: rs.title || origSch?.title || origTodo?.title || '재배치 일정',
            date: selectedDate,
            startTime: st,
            endTime: et,
            categoryId: validCatIds.has(rawCat) ? rawCat : state.categories[0].id,
            projectTag: cleanProjectTag(
              rs.projectTag || origSch?.projectTag || origTodo?.projectTag || getActiveRealProjectTag()
            ),
            repeat: 'none',
            completedDates: [],
            alarm: origSch ? origSch.alarm !== false : true,
            alarmLeadMinutes: Number(origSch?.alarmLeadMinutes || 0),
            important:
              rs.important !== undefined
                ? Boolean(rs.important)
                : Boolean(origSch?.important || origTodo?.important),
            completed: false
          });
        });

        if (convertedTodoIds.size > 0) {
          state.todos = state.todos.filter(t => !convertedTodoIds.has(t.id));
        }

        if (Array.isArray(aiRes.postponedTodoIds) && aiRes.postponedTodoIds.length > 0) {
          const nextDay = addDaysStr(selectedDate, 1);
          const postponeSet = new Set(aiRes.postponedTodoIds);
          state.todos.forEach(t => {
            if (postponeSet.has(t.id) && (!t.repeat || t.repeat === 'none')) {
              t.dueDate = nextDay;
            }
          });
        }

        saveState();
        renderAll();
        showToast(aiRes.advice || '남은 하루 시간대에 맞춰 일정과 할 일을 최적 재배치했습니다.', { withUndo: true });
      } else {
        // 내장 스마트 재배치 알고리즘: 고정·정기 일정 구간을 피해 미완료 일정과 할 일을 순차 배치
        const occupiedIntervals = fixedSchedules
          .map(fs => ({
            start: timeToMinutes(fs.startTime),
            end: timeToMinutes(fs.endTime)
          }))
          .sort((a, b) => a.start - b.start);

        const baseMins =
          selectedDate === getTodayStr() ? Math.max(9 * 60, timeToMinutes(getNowTimeStr())) : 9 * 60;
        let cursorMins = Math.ceil(baseMins / 15) * 15;
        const sortedSchedules = [...movableSchedules].sort((a, b) => Number(b.important) - Number(a.important));
        const sortedTodos = [...pendingTodos].sort((a, b) => Number(b.important) - Number(a.important));

        const findNextFreeSlot = (fromMins, durMins) => {
          let candidate = fromMins;
          let conflict = true;
          while (conflict && candidate + durMins <= 23 * 60 + 30) {
            conflict = false;
            for (let i = 0; i < occupiedIntervals.length; i++) {
              const occ = occupiedIntervals[i];
              if (candidate < occ.end && candidate + durMins > occ.start) {
                candidate = Math.ceil((occ.end + 10) / 15) * 15;
                conflict = true;
                break;
              }
            }
          }
          return candidate;
        };

        sortedSchedules.forEach(s => {
          const dur = durationMinutes(s.startTime, s.endTime);
          const slotStart = findNextFreeSlot(cursorMins, dur);
          if (slotStart + dur <= 23 * 60 + 30) {
            s.startTime = minutesToTime(slotStart);
            s.endTime = minutesToTime(slotStart + dur);
            occupiedIntervals.push({ start: slotStart, end: slotStart + dur });
            cursorMins = slotStart + dur + 15;
          } else {
            s.date = addDaysStr(selectedDate, 1);
          }
        });

        const convertedTodoIds = new Set();
        sortedTodos.forEach(td => {
          const dur = Math.max(15, Math.min(180, Number(td.estimatedMinutes || 30)));
          const slotStart = findNextFreeSlot(cursorMins, dur);
          if (slotStart + dur <= 22 * 60 + 45) {
            const alreadyScheduled = state.schedules.some(
              s => doesItemOccurOnDate(s, selectedDate, false) && s.title === td.title
            );
            if (!alreadyScheduled) {
              state.schedules.push({
                id: uid('sch'),
                title: td.title,
                date: selectedDate,
                startTime: minutesToTime(slotStart),
                endTime: minutesToTime(slotStart + dur),
                categoryId: td.categoryId || state.categories[0].id,
                projectTag: cleanProjectTag(td.projectTag),
                repeat: 'none',
                completedDates: [],
                alarm: true,
                alarmLeadMinutes: 0,
                important: Boolean(td.important),
                completed: false
              });
              occupiedIntervals.push({ start: slotStart, end: slotStart + dur });
              cursorMins = slotStart + dur + 15;
              if (!td.repeat || td.repeat === 'none') {
                convertedTodoIds.add(td.id);
              }
            }
          } else if (!td.repeat || td.repeat === 'none') {
            td.dueDate = addDaysStr(selectedDate, 1);
          }
        });

        if (convertedTodoIds.size > 0) {
          state.todos = state.todos.filter(t => !convertedTodoIds.has(t.id));
        }

        saveState();
        renderAll();
        showToast('고정 일정을 피해 남은 일정과 할 일을 15분 여유 간격으로 재배치했습니다.', { withUndo: true });
      }
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  // AI 심층 시간 분석 보고서 & 다음 달 목표 역산 설계
  async function handleGenerateAiReport(isReverseGoalDesign = false) {
    if (!isReverseGoalDesign) {
      setReportCardOpen('aiCoaching', true);
    } else {
      setReportCardOpen('timeBudget', true);
    }
    const stats = computeReportStatistics();
    const wishInput = document.getElementById('nextMonthWishInput');
    const userGoalWish = wishInput ? wishInput.value.trim() : '';

    const btn = document.getElementById(isReverseGoalDesign ? 'aiDesignNextMonthBtn' : 'generateAiReportBtn');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'AI 분석 중...';

    try {
      const compactStats = {
        periodLabel: stats.periodFullLabel,
        dayCount: stats.dateList.length,
        totalPlanMinutes: stats.totalPlanMinutes,
        totalActualMinutes: stats.totalActualMinutes,
        goldenTimeLabel: stats.goldenTimeLabel,
        byCategory: stats.byCategory.map(c => ({
          id: c.id,
          name: c.name,
          planMinutes: c.planMinutes,
          actualMinutes: c.actualMinutes
        }))
      };

      const aiRes = await callCloudflareAi('analyze_report', {
        monthLabel: stats.periodFullLabel,
        statsSummary: compactStats,
        userGoalWish,
        categories: state.categories
      });

      const reportData = aiRes || buildLocalSmartReport(stats, userGoalWish);
      if (!state.aiReportsByPeriod || typeof state.aiReportsByPeriod !== 'object') {
        state.aiReportsByPeriod = {};
      }
      if (stats.periodKey) {
        state.aiReportsByPeriod[stats.periodKey] = reportData;
      }
      saveState();
      renderSavedAiReportForPeriod(stats);

      if (isReverseGoalDesign) {
        applyAiReportDataToPlan(reportData);
      } else {
        showToast(`${stats.periodFullLabel} AI 코칭 리포트가 완성되었습니다.`);
      }
    } finally {
      btn.disabled = false;
      const latestStats = computeReportStatistics();
      const hasSaved =
        state.aiReportsByPeriod && latestStats.periodKey && state.aiReportsByPeriod[latestStats.periodKey];
      btn.textContent = isReverseGoalDesign ? origText : hasSaved ? '다시 분석' : '리포트 생성';
    }
  }

  function buildLocalSmartReport(stats, userGoalWish) {
    const pLabel = stats.periodFullLabel || stats.periodLabel || '이번 기간';
    if (stats.totalActualMinutes === 0) {
      return {
        headline: `${pLabel}에는 아직 기록된 실행 시간이 없습니다. 핵심 과업부터 타임트래킹을 시작해 보세요.`,
        timeLeakAnalysis: `${pLabel} 계획 시간은 ${formatDurationKo(stats.totalPlanMinutes)}이며, 실제 타이머 기록이 쌓이면 계획 대비 누수 구간을 정밀 진단할 수 있습니다.`,
        goldenTimeAnalysis: `오전 집중 블록과 루틴 플레이어를 연동하면 별도 입력 없이도 실행 기록이 자동으로 축적됩니다.`,
        keep: `정기 일정과 할 일 계획을 세워 시간 구조를 먼저 설계하려는 시도`,
        problem: `계획 완료 후 실제 소요 시간 기록이 누락되어 실행 데이터 비교가 어려운 점`,
        tryAction: userGoalWish
          ? `'${userGoalWish}' 달성을 위해 주 3회 핵심 블록을 타임라인에 먼저 고정 배치하기`
          : `하루 1건 이상 핵심 일정에 타이머를 켜서 실제 몰입 시간 기록 남기기`,
        recommendedBudgets: stats.byCategory.map(c => ({
          categoryId: c.id,
          monthlyHours: Math.max(10, Math.round(c.planMinutes / 60) || 20),
          reason: `${pLabel} 초기 권장 배분`
        })),
        recommendedGoals: [
          userGoalWish ? `${userGoalWish} 주간 고정 시간 확보` : '핵심 프로젝트 주간 집중 시간 10시간 확보',
          '평일 오전 첫 일정 시작 시 타이머 연동 습관화',
          '주간 요일 보드에서 매주 일요일 계획 대비 실행 점검'
        ]
      };
    }

    const sortedActual = [...stats.byCategory].sort((a, b) => b.actualMinutes - a.actualMinutes);
    const topCat = sortedActual[0] || { name: '업무', actualMinutes: 120 };
    const lowCat = sortedActual[sortedActual.length - 1] || { name: '자기계발', actualMinutes: 30 };
    const totalHrs = (stats.totalActualMinutes / 60).toFixed(1);

    return {
      headline: `${pLabel} 총 ${totalHrs}시간의 실행 기록 중 '${topCat.name}' 비중이 가장 높으며, ${stats.goldenTimeLabel}에 최고의 몰입도를 보였습니다.`,
      timeLeakAnalysis: `${pLabel} 기준 '${topCat.name}' 영역은 안정적으로 실행되고 있으나, 오후 일정이 길어질 때 '${lowCat.name}' 실행 시간이 줄어드는 경향이 관찰됩니다.`,
      goldenTimeAnalysis: `${stats.goldenTimeLabel} 구간의 계획 일치율이 가장 높습니다. 에너지가 필요한 핵심 과업을 이 시간대에 우선 배치하면 달성률을 높일 수 있습니다.`,
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
  function openItemModalForCreate(type, startTime = '09:00', endTime = '10:00', defaultTag = '', defaultRepeat = 'none') {
    document.getElementById('itemModalHeading').textContent =
      type === 'actual' ? '실제 사용 시간 기록 추가' : type === 'todo' ? '할 일 추가' : '계획 일정 추가';
    document.getElementById('itemModalId').value = '';
    document.getElementById('itemModalType').value = type;
    document.getElementById('itemModalTitle').value = '';
    document.getElementById('itemModalDate').value = selectedDate;
    document.getElementById('itemModalStartTime').value = startTime;
    document.getElementById('itemModalEndTime').value = endTime;
    const tagInput = document.getElementById('itemModalProjectTag');
    if (tagInput) {
      const fallbackTag = selectedProjectTag && selectedProjectTag !== '__UNTAGGED__' ? selectedProjectTag : '';
      tagInput.value = cleanProjectTag(defaultTag || fallbackTag);
    }
    const repeatSel = document.getElementById('itemModalRepeat');
    if (repeatSel) repeatSel.value = defaultRepeat || 'none';
    const alarmLeadSel = document.getElementById('itemModalAlarmLead');
    if (alarmLeadSel) alarmLeadSel.value = '0';
    const estSel = document.getElementById('itemModalEstMinutes');
    if (estSel) estSel.value = '30';
    document.getElementById('itemModalAlarm').checked = true;
    document.getElementById('itemModalImportant').checked = false;
    document.getElementById('itemModalDeleteBtn').classList.add('hidden');
    toggleItemModalTimeVisibility(type);
    openModalWindow('itemModal');
  }

  function openItemModalForEdit(type, item) {
    document.getElementById('itemModalHeading').textContent = '항목 상세 편집';
    document.getElementById('itemModalId').value = item.id;
    document.getElementById('itemModalType').value = type;
    document.getElementById('itemModalTitle').value = item.title || '';
    document.getElementById('itemModalDate').value = item.date || item.dueDate || selectedDate;
    document.getElementById('itemModalCategory').value = item.categoryId || state.categories[0].id;
    const tagInput = document.getElementById('itemModalProjectTag');
    if (tagInput) tagInput.value = cleanProjectTag(item.projectTag || '');
    const repeatSel = document.getElementById('itemModalRepeat');
    if (repeatSel) repeatSel.value = item.repeat || 'none';
    document.getElementById('itemModalStartTime').value = item.startTime || '09:00';
    document.getElementById('itemModalEndTime').value = item.endTime || '10:00';
    const estSel = document.getElementById('itemModalEstMinutes');
    if (estSel) {
      const estVal = String(item.estimatedMinutes || 30);
      estSel.value = ['15', '30', '45', '60', '90', '120'].includes(estVal) ? estVal : '30';
    }
    document.getElementById('itemModalAlarm').checked = item.alarm !== false;
    document.getElementById('itemModalImportant').checked = Boolean(item.important);
    const alarmLeadSel = document.getElementById('itemModalAlarmLead');
    if (alarmLeadSel) alarmLeadSel.value = String(item.alarmLeadMinutes || 0);
    document.getElementById('itemModalDeleteBtn').classList.remove('hidden');
    toggleItemModalTimeVisibility(type);
    openModalWindow('itemModal');
  }

  function toggleItemModalTimeVisibility(type) {
    const estRow = document.getElementById('itemModalEstMinutesRow');
    if (estRow) {
      estRow.classList.toggle('hidden', type !== 'todo');
    }
    const timeRow = document.getElementById('itemModalTimeRow');
    if (timeRow) {
      timeRow.classList.toggle('hidden', type === 'todo');
    }
    const shiftRow = document.getElementById('itemModalShiftRow');
    if (shiftRow) {
      shiftRow.classList.toggle('hidden', type === 'todo');
    }
    const repeatWrap = document.getElementById('itemModalRepeatWrap');
    if (repeatWrap) {
      repeatWrap.classList.toggle('hidden', type === 'actual');
    }
    const alarmRow = document.getElementById('itemModalAlarmRow');
    if (alarmRow) {
      alarmRow.classList.toggle('hidden', type === 'actual');
    }
    const alarmLeadWrap = document.getElementById('itemModalAlarmLeadWrap');
    if (alarmLeadWrap) {
      alarmLeadWrap.classList.toggle('hidden', type !== 'schedule');
    }
  }

  function renderRoutineModalDayTimesGrid() {
    const toggleEl = document.getElementById('routineCustomDayTimeToggle');
    const gridEl = document.getElementById('routineCustomDayTimesGrid');
    const quickBtnsEl = document.getElementById('routineDayTimeQuickBtns');
    if (!toggleEl || !gridEl) return;

    const enabled = Boolean(toggleEl.checked);
    gridEl.classList.toggle('hidden', !enabled);
    if (quickBtnsEl) quickBtnsEl.classList.toggle('hidden', !enabled);
    if (!enabled) return;

    const baseTime = document.getElementById('routineModalTime')?.value || '07:00';
    let activeDows = Array.from(document.querySelectorAll('#routineActiveDaysGroup .day-toggle-btn.active'))
      .map(btn => Number(btn.dataset.dow))
      .sort((a, b) => a - b);
    if (activeDows.length === 0) activeDows = [0, 1, 2, 3, 4, 5, 6];

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    gridEl.innerHTML = '';

    activeDows.forEach(dow => {
      if (!modalRoutineDayTimes[dow]) {
        modalRoutineDayTimes[dow] = baseTime;
      }
      const item = document.createElement('div');
      item.className = 'routine-day-time-cell';
      item.innerHTML = `
        <span class="rdt-day-label ${dow === 0 ? 'sun-text' : dow === 6 ? 'sat-text' : ''}">${dayNames[dow]}</span>
        <input type="time" class="rdt-time-input" data-daytime-dow="${dow}" value="${modalRoutineDayTimes[dow]}" aria-label="${dayNames[dow]}요일 시작 시각" />
      `;
      item.querySelector('.rdt-time-input').addEventListener('change', e => {
        modalRoutineDayTimes[dow] = e.target.value || baseTime;
      });
      gridEl.appendChild(item);
    });
  }

  // 루틴 생성·편집 모달
  function openRoutineModalForEdit(rtn = null) {
    const isEdit = Boolean(rtn);
    const defaultTime = isEdit ? rtn.startTime || '07:00' : '07:00';
    document.getElementById('routineModalHeading').textContent = isEdit ? '루틴 편집' : '새 루틴 만들기';
    document.getElementById('routineModalId').value = isEdit ? rtn.id : '';
    document.getElementById('routineModalName').value = isEdit ? rtn.name : '';
    document.getElementById('routineModalCategory').value = isEdit ? rtn.categoryId : state.categories[0].id;
    document.getElementById('routineModalTime').value = defaultTime;
    document.getElementById('routineModalAlarm').checked = isEdit ? rtn.alarm !== false : true;
    const rtnLeadSel = document.getElementById('routineModalAlarmLead');
    if (rtnLeadSel) rtnLeadSel.value = String(isEdit ? rtn.alarmLeadMinutes || 0 : 0);

    const activeDays =
      isEdit && Array.isArray(rtn.activeDays) && rtn.activeDays.length > 0
        ? rtn.activeDays.map(Number)
        : [0, 1, 2, 3, 4, 5, 6];
    document.querySelectorAll('#routineActiveDaysGroup .day-toggle-btn').forEach(btn => {
      const dow = Number(btn.dataset.dow);
      btn.classList.toggle('active', activeDays.includes(dow));
    });

    modalRoutineDayTimes = {};
    for (let d = 0; d <= 6; d++) {
      const savedT = isEdit && rtn.dayTimes && (rtn.dayTimes[d] || rtn.dayTimes[String(d)]);
      modalRoutineDayTimes[d] = savedT && /^\d{2}:\d{2}$/.test(savedT) ? savedT : defaultTime;
    }
    const customToggle = document.getElementById('routineCustomDayTimeToggle');
    if (customToggle) {
      customToggle.checked = Boolean(isEdit && rtn.useCustomDayTimes);
    }
    renderRoutineModalDayTimesGrid();

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

    openModalWindow('routineModal');
  }

  function appendRoutineStepEditorRow(title = '', minutes = 5, tip = '') {
    const container = document.getElementById('routineStepRowsContainer');
    const row = document.createElement('div');
    row.className = 'step-edit-row';
    row.innerHTML = `
      <div class="step-row-top">
        <div class="step-reorder-btns">
          <button type="button" class="step-move-btn step-up-btn" title="위로 이동">↑</button>
          <button type="button" class="step-move-btn step-down-btn" title="아래로 이동">↓</button>
        </div>
        <input type="text" class="step-row-title" placeholder="행동 이름" value="${escapeHtml(title)}" required />
        <div class="step-mins-wrap">
          <input type="number" class="step-row-mins" min="1" max="180" value="${Number(minutes || 5)}" title="목표 시간 분 단위" />
          <span class="step-mins-unit">분</span>
        </div>
        <button type="button" class="btn-xs btn-danger-ghost step-row-del" title="단계 삭제">&times;</button>
      </div>
      <input type="text" class="step-row-tip" placeholder="음성 안내 멘트 또는 실천 팁" value="${escapeHtml(tip || '')}" />
    `;
    row.querySelector('.step-up-btn').addEventListener('click', () => {
      const prev = row.previousElementSibling;
      if (prev) container.insertBefore(row, prev);
    });
    row.querySelector('.step-down-btn').addEventListener('click', () => {
      const next = row.nextElementSibling;
      if (next) container.insertBefore(next, row);
    });
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
        pushUndoSnapshot('카테고리 삭제');
        const remaining = state.categories.filter(c => c.id !== cat.id);
        const fallbackCatId = remaining[0].id;
        state.categories = remaining;
        state.schedules.forEach(s => {
          if (s.categoryId === cat.id) s.categoryId = fallbackCatId;
        });
        state.actualLogs.forEach(a => {
          if (a.categoryId === cat.id) a.categoryId = fallbackCatId;
        });
        state.todos.forEach(t => {
          if (t.categoryId === cat.id) t.categoryId = fallbackCatId;
        });
        state.routines.forEach(r => {
          if (r.categoryId === cat.id) r.categoryId = fallbackCatId;
        });
        state.monthlyGoals.forEach(mg => {
          if (mg.categoryId === cat.id) mg.categoryId = fallbackCatId;
        });
        delete state.timeBudgets[cat.id];
        saveState();
        renderCategoryEditorModal();
        renderAll();
        showToast(`'${cat.name}' 카테고리가 삭제되었습니다.`, { withUndo: true });
      });

      list.appendChild(row);
    });
  }

  function normalizeImportedState(rawState) {
    const fallback = createInitialState();
    if (!rawState || typeof rawState !== 'object') return fallback;
    const rawCats =
      Array.isArray(rawState.categories) && rawState.categories.length > 0
        ? rawState.categories.map(c => ({
            ...c,
            id: String(c.id || uid('cat')),
            name: String(c.name || '카테고리').trim() || '카테고리',
            color: sanitizeHexColor(c.color)
          }))
        : fallback.categories;
    const validCatIds = new Set(rawCats.map(c => c.id));
    const defaultCatId = rawCats[0].id;
    const safeCat = cid => (cid && validCatIds.has(cid) ? cid : defaultCatId);

    const safeSchedules = Array.isArray(rawState.schedules)
      ? rawState.schedules
          .filter(s => s && typeof s === 'object')
          .map(s => {
            const st = minutesToTime(timeToMinutes(s.startTime || '09:00'));
            let et = minutesToTime(timeToMinutes(s.endTime || '10:00'));
            if (timeToMinutes(et) <= timeToMinutes(st)) {
              et = minutesToTime(timeToMinutes(st) + 30);
            }
            return {
              ...s,
              id: String(s.id || uid('sch')),
              title: String(s.title || '일정').trim() || '일정',
              date: String(s.date || getTodayStr()),
              startTime: st,
              endTime: et,
              categoryId: safeCat(s.categoryId),
              projectTag: cleanProjectTag(s.projectTag || ''),
              repeat: s.repeat || 'none',
              completedDates: Array.isArray(s.completedDates) ? s.completedDates : [],
              alarm: s.alarm !== false,
              alarmLeadMinutes: Number(s.alarmLeadMinutes || 0),
              important: Boolean(s.important),
              completed: Boolean(s.completed)
            };
          })
      : fallback.schedules;

    const safeActuals = Array.isArray(rawState.actualLogs)
      ? rawState.actualLogs
          .filter(a => a && typeof a === 'object')
          .map(a => {
            const st = minutesToTime(timeToMinutes(a.startTime || '09:00'));
            let et = minutesToTime(timeToMinutes(a.endTime || '10:00'));
            if (timeToMinutes(et) <= timeToMinutes(st)) {
              et = minutesToTime(timeToMinutes(st) + 30);
            }
            return {
              ...a,
              id: String(a.id || uid('act')),
              title: String(a.title || '실행 기록').trim() || '실행 기록',
              date: String(a.date || getTodayStr()),
              startTime: st,
              endTime: et,
              categoryId: safeCat(a.categoryId),
              projectTag: cleanProjectTag(a.projectTag || '')
            };
          })
      : fallback.actualLogs;

    const safeTodos = Array.isArray(rawState.todos)
      ? rawState.todos
          .filter(t => t && typeof t === 'object')
          .map(t => ({
            ...t,
            id: String(t.id || uid('todo')),
            title: String(t.title || '할 일').trim() || '할 일',
            dueDate: typeof t.dueDate === 'string' ? t.dueDate : '',
            categoryId: safeCat(t.categoryId),
            projectTag: cleanProjectTag(t.projectTag || ''),
            repeat: t.repeat || 'none',
            completedDates: Array.isArray(t.completedDates) ? t.completedDates : [],
            estimatedMinutes: Math.max(15, Number(t.estimatedMinutes || 30)),
            important: Boolean(t.important),
            completed: Boolean(t.completed)
          }))
      : fallback.todos;

    const safeRoutines = Array.isArray(rawState.routines)
      ? rawState.routines
          .filter(r => r && typeof r === 'object')
          .map(r => {
            const baseSt = minutesToTime(timeToMinutes(r.startTime || '07:00'));
            const cleanDayTimes = {};
            if (r.dayTimes && typeof r.dayTimes === 'object') {
              for (let d = 0; d <= 6; d++) {
                const rawVal = r.dayTimes[d] || r.dayTimes[String(d)];
                if (typeof rawVal === 'string' && rawVal.trim()) {
                  cleanDayTimes[d] = minutesToTime(timeToMinutes(rawVal));
                }
              }
            }
            return {
              ...r,
              id: String(r.id || uid('rtn')),
              name: String(r.name || '루틴').trim() || '루틴',
              categoryId: safeCat(r.categoryId),
              startTime: baseSt,
              useCustomDayTimes: Boolean(r.useCustomDayTimes),
              dayTimes: cleanDayTimes,
              alarm: r.alarm !== false,
              alarmLeadMinutes: Number(r.alarmLeadMinutes || 0),
              activeDays:
                Array.isArray(r.activeDays) && r.activeDays.length > 0
                  ? r.activeDays.map(Number)
                  : [0, 1, 2, 3, 4, 5, 6],
              completedDates: Array.isArray(r.completedDates) ? r.completedDates : [],
              steps:
                Array.isArray(r.steps) && r.steps.length > 0
                  ? r.steps.map(st => ({
                      id: String(st?.id || uid('st')),
                      title: String(st?.title || '단계 행동').trim() || '단계 행동',
                      minutes: Math.max(1, Number(st?.minutes || 5)),
                      tip: String(st?.tip || '')
                    }))
                  : [{ id: uid('st'), title: '핵심 행동', minutes: 5, tip: '' }]
            };
          })
      : fallback.routines;

    const safeGoals = Array.isArray(rawState.monthlyGoals)
      ? rawState.monthlyGoals
          .filter(g => g && typeof g === 'object')
          .map(g => ({
            id: String(g.id || uid('mg')),
            title: String(g.title || '목표').trim() || '목표',
            categoryId: safeCat(g.categoryId),
            done: Boolean(g.done)
          }))
      : fallback.monthlyGoals;

    const safeAiReports =
      rawState.aiReportsByPeriod && typeof rawState.aiReportsByPeriod === 'object'
        ? rawState.aiReportsByPeriod
        : {};

    return {
      ...fallback,
      ...rawState,
      updatedAt: rawState.updatedAt || '',
      settings: { ...fallback.settings, ...(rawState.settings || {}) },
      reviewNotes: { ...fallback.reviewNotes, ...(rawState.reviewNotes || {}) },
      timeBudgets: { ...fallback.timeBudgets, ...(rawState.timeBudgets || {}) },
      aiReportsByPeriod: safeAiReports,
      categories: rawCats,
      schedules: safeSchedules,
      actualLogs: safeActuals,
      todos: safeTodos,
      routines: safeRoutines,
      monthlyGoals: safeGoals
    };
  }

  // -------------------- 클라우드 동기화 상태 표시 --------------------
  function updateSyncHeaderUI(statusMode = 'idle') {
    const dotEl = document.getElementById('headerSyncDot');
    const labelEl = document.getElementById('headerSyncLabel');
    const hasCode = Boolean(state.settings.syncCode && state.settings.syncCode.trim().length >= 3);

    if (dotEl) {
      dotEl.classList.toggle('hidden', !hasCode);
      dotEl.classList.toggle('syncing', hasCode && statusMode === 'syncing');
      dotEl.classList.toggle('error', hasCode && statusMode === 'error');
    }
    if (labelEl) {
      labelEl.textContent = hasCode && statusMode === 'syncing' ? '동기화 중' : '설정';
    }
  }

  async function pushStateToCloudRaw(rawCode, useKeepalive = false) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (code.length < 3) throw new Error('동기화 코드 부족');
    const dbKey = `TIMEFLOW:${code}`;

    let savedOk = false;
    let cloudUpdatedAt = state.updatedAt || new Date().toISOString();
    const workerBody = JSON.stringify({ action: 'save', syncCode: code, state });
    const canKeepalive = useKeepalive && workerBody.length < 60000;

    try {
      const workerRes = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: workerBody,
        keepalive: canKeepalive
      });
      if (workerRes.ok) {
        const wData = await workerRes.json().catch(() => null);
        if (wData && wData.ok) {
          savedOk = true;
          if (wData.updatedAt) cloudUpdatedAt = wData.updatedAt;
        }
      }
    } catch (_) {}

    if (!savedOk) {
      const nowIso = new Date().toISOString();
      const sbBody = JSON.stringify({
        code: dbKey,
        room_data: state,
        updated_at: nowIso
      });
      const res = await fetch(`${SUPABASE_URL}/rest/v1/escape_rooms`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: sbBody,
        keepalive: useKeepalive && sbBody.length < 60000
      });
      if (!res.ok) throw new Error('업로드 실패');
      cloudUpdatedAt = nowIso;
    }

    return cloudUpdatedAt;
  }

  async function pullStateFromCloudRaw(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (code.length < 3) return null;
    const dbKey = `TIMEFLOW:${code}`;

    try {
      const workerRes = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load', syncCode: code })
      });
      if (workerRes.ok) {
        const wData = await workerRes.json().catch(() => null);
        if (wData && wData.ok && wData.found && wData.state) {
          return {
            state: wData.state,
            updatedAt: wData.updatedAt || wData.state.updatedAt || ''
          };
        }
      }
    } catch (_) {}

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
    if (Array.isArray(rows) && rows.length > 0 && rows[0].room_data) {
      return {
        state: rows[0].room_data,
        updatedAt: rows[0].updated_at || rows[0].room_data.updatedAt || ''
      };
    }
    return null;
  }

  function scheduleAutoCloudSave() {
    const rawCode = String(state.settings.syncCode || '').trim().toUpperCase();
    if (rawCode.length < 3 || state.settings.autoSync === false) return;

    clearTimeout(autoSyncTimerId);
    autoSyncTimerId = setTimeout(async () => {
      autoSyncTimerId = null;
      if (isSyncInFlight) {
        scheduleAutoCloudSave();
        return;
      }
      isSyncInFlight = true;
      try {
        updateSyncHeaderUI('syncing');
        const cloudUpdatedAt = await pushStateToCloudRaw(rawCode, false);
        state.updatedAt = cloudUpdatedAt || state.updatedAt;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {}
        updateSyncHeaderUI('idle');
        const statusEl = document.getElementById('cloudSyncStatusText');
        if (statusEl) {
          statusEl.textContent = `자동 클라우드 동기화 완료 · ${new Date().toLocaleTimeString()}`;
        }
      } catch (_) {
        updateSyncHeaderUI('error');
      } finally {
        isSyncInFlight = false;
      }
    }, 2200);
  }

  function flushPendingAutoCloudSave() {
    if (!autoSyncTimerId) return;
    clearTimeout(autoSyncTimerId);
    autoSyncTimerId = null;
    const rawCode = String(state.settings.syncCode || '').trim().toUpperCase();
    if (rawCode.length < 3 || state.settings.autoSync === false || isSyncInFlight) return;
    pushStateToCloudRaw(rawCode, true).catch(() => {});
  }

  async function checkCloudLatestOnStartup(silent = true) {
    const rawCode = String(state.settings.syncCode || '').trim().toUpperCase();
    if (rawCode.length < 3 || state.settings.autoSync === false) return;
    if (isSyncInFlight || autoSyncTimerId) return;

    lastAutoCloudPullAt = Date.now();
    isSyncInFlight = true;
    try {
      updateSyncHeaderUI('syncing');
      const pulled = await pullStateFromCloudRaw(rawCode);
      updateSyncHeaderUI('idle');
      if (!pulled || !pulled.state) return;

      const remoteTime = pulled.updatedAt ? Date.parse(pulled.updatedAt) : 0;
      const localTime = state.updatedAt ? Date.parse(state.updatedAt) : 0;

      // 원격 데이터가 로컬보다 최신일 때 자동 반영
      if (remoteTime && (!localTime || remoteTime > localTime + 1500)) {
        const keepDark = state.settings.darkMode;
        const keepAutoSync = state.settings.autoSync;
        state = normalizeImportedState(pulled.state);
        state.settings.syncCode = rawCode;
        state.settings.autoSync = keepAutoSync;
        if (typeof pulled.state?.settings?.darkMode !== 'boolean') {
          state.settings.darkMode = keepDark;
        }
        state.updatedAt = pulled.updatedAt || new Date().toISOString();
        saveState({ skipAutoSync: true, touchTimestamp: false });
        renderAll();
        const statusEl = document.getElementById('cloudSyncStatusText');
        if (statusEl) {
          statusEl.textContent = `최신 클라우드 데이터 자동 반영 · ${new Date().toLocaleTimeString()}`;
        }
        if (!silent) {
          showToast('클라우드의 최신 데이터를 자동으로 불러왔습니다.');
        }
      }
    } catch (_) {
      updateSyncHeaderUI('error');
    } finally {
      isSyncInFlight = false;
    }
  }

  async function syncToCloud(action = 'save') {
    const codeInput = document.getElementById('cloudSyncCodeInput');
    const statusEl = document.getElementById('cloudSyncStatusText');
    const rawCode = String((codeInput && codeInput.value) || state.settings.syncCode || '').trim().toUpperCase();

    if (rawCode.length < 3) {
      showToast('동기화 코드를 3글자 이상 입력해 주세요.');
      return;
    }

    state.settings.syncCode = rawCode;
    saveState({ skipAutoSync: true });
    updateSyncHeaderUI('syncing');

    if (statusEl) {
      statusEl.textContent = action === 'save' ? '클라우드에 업로드 중...' : '클라우드에서 불러오는 중...';
    }

    try {
      if (action === 'save') {
        clearTimeout(autoSyncTimerId);
        const cloudUpdatedAt = await pushStateToCloudRaw(rawCode);
        state.updatedAt = cloudUpdatedAt || state.updatedAt;
        saveState({ skipAutoSync: true, touchTimestamp: false });
        updateSyncHeaderUI('idle');
        if (statusEl) {
          statusEl.textContent = `클라우드 업로드 완료 · ${new Date().toLocaleTimeString()}`;
        }
        showToast(`동기화 코드 '${rawCode}'로 클라우드 저장이 완료되었습니다.`);
      } else {
        const pulled = await pullStateFromCloudRaw(rawCode);
        if (!pulled || !pulled.state) {
          updateSyncHeaderUI('idle');
          if (statusEl) statusEl.textContent = '해당 동기화 코드로 저장된 데이터가 없습니다.';
          showToast('해당 코드로 저장된 클라우드 데이터를 찾지 못했습니다.');
          return;
        }
        state = normalizeImportedState(pulled.state);
        state.settings.syncCode = rawCode;
        state.updatedAt = pulled.updatedAt || new Date().toISOString();
        saveState({ skipAutoSync: true, touchTimestamp: false });
        updateSyncHeaderUI('idle');
        renderAll();
        if (statusEl) {
          statusEl.textContent = `클라우드 동기화 완료 · ${new Date().toLocaleTimeString()}`;
        }
        showToast('클라우드에서 최신 일정 · 루틴 · 타임트래커 데이터를 불러왔습니다!');
      }
    } catch (_) {
      updateSyncHeaderUI('error');
      if (statusEl) {
        statusEl.textContent = '네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
      }
      showToast('클라우드 동기화 중 일시적인 통신 오류가 발생했습니다.');
    }
  }

  // -------------------- 구글 캘린더 등록 & 표준 캘린더 파일(.ics) 내보내기 · 가져오기 --------------------
  function escapeIcsText(str) {
    return String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function unescapeIcsText(str) {
    return String(str || '')
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  function toIcsDateCompact(dateStr) {
    return String(dateStr || getTodayStr()).replace(/-/g, '');
  }

  function toIcsTimeCompact(timeStr) {
    const clean = String(timeStr || '09:00').replace(':', '');
    return `${clean.padStart(4, '0')}00`;
  }

  function getIcsRruleString(repeat) {
    if (repeat === 'daily') return 'FREQ=DAILY';
    if (repeat === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    if (repeat === 'weekly') return 'FREQ=WEEKLY';
    if (repeat === 'monthly') return 'FREQ=MONTHLY';
    return '';
  }

  function openGoogleCalendarFromModal() {
    const type = document.getElementById('itemModalType')?.value || 'schedule';
    const rawTitle = document.getElementById('itemModalTitle')?.value.trim() || '타임플로우 일정';
    const date = document.getElementById('itemModalDate')?.value || selectedDate;
    const catId = document.getElementById('itemModalCategory')?.value;
    const cat = getCategoryById(catId);
    const pTag = cleanProjectTag(document.getElementById('itemModalProjectTag')?.value || '');
    const repeat = document.getElementById('itemModalRepeat')?.value || 'none';
    const startTime = document.getElementById('itemModalStartTime')?.value || '09:00';
    let endTime = document.getElementById('itemModalEndTime')?.value || '10:00';
    if (type !== 'todo' && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      endTime = minutesToTime(timeToMinutes(startTime) + 30);
    }

    const displayTitle = pTag ? `@${pTag} ${rawTitle}` : rawTitle;
    let datesParam = '';
    if (type === 'todo') {
      const dStart = toIcsDateCompact(date);
      const dEnd = toIcsDateCompact(addDaysStr(date, 1));
      datesParam = `${dStart}/${dEnd}`;
    } else {
      const dCompact = toIcsDateCompact(date);
      datesParam = `${dCompact}T${toIcsTimeCompact(startTime)}/${dCompact}T${toIcsTimeCompact(endTime)}`;
    }

    const detailLines = [`카테고리: ${cat.name}`];
    if (pTag) detailLines.push(`프로젝트 태그: @${pTag}`);
    detailLines.push('타임플로우 플래너에서 등록됨');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: displayTitle,
      dates: datesParam,
      details: detailLines.join('\n'),
      ctz: 'Asia/Seoul'
    });

    const rrule = type !== 'actual' ? getIcsRruleString(repeat) : '';
    if (rrule) {
      params.set('recur', `RRULE:${rrule}`);
    }

    const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    showToast('구글 캘린더 일정 등록 화면을 새 창으로 열었습니다.');
  }

  function exportCalendarIcsFile() {
    const includeTodosEl = document.getElementById('icsIncludeTodos');
    const includeActualsEl = document.getElementById('icsIncludeActuals');
    const includeTodos = includeTodosEl ? includeTodosEl.checked : true;
    const includeActuals = includeActualsEl ? includeActualsEl.checked : false;

    const nowUtc = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeFlow Planner//TimeFlow Calendar 1.0//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:타임플로우 일정',
      'X-WR-TIMEZONE:Asia/Seoul',
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Seoul',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0900',
      'TZOFFSETTO:+0900',
      'TZNAME:KST',
      'DTSTART:19700101T000000',
      'END:STANDARD',
      'END:VTIMEZONE'
    ];

    let exportedCount = 0;

    state.schedules.forEach(sch => {
      if (!matchesSelectedProjectTag(sch)) return;
      const cat = getCategoryById(sch.categoryId);
      const pTag = cleanProjectTag(sch.projectTag);
      const dCompact = toIcsDateCompact(sch.date || selectedDate);
      const dtStart = `${dCompact}T${toIcsTimeCompact(sch.startTime || '09:00')}`;
      const dtEnd = `${dCompact}T${toIcsTimeCompact(sch.endTime || '10:00')}`;
      const summary = pTag ? `@${pTag} ${sch.title}` : sch.title;
      const descParts = [`카테고리: ${cat.name}`];
      if (pTag) descParts.push(`프로젝트 태그: @${pTag}`);
      if (sch.important) descParts.push('중요 일정');

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${sch.id || uid('sch')}@timeflow-planner.h1s.workers.dev`);
      lines.push(`DTSTAMP:${nowUtc}`);
      lines.push(`DTSTART;TZID=Asia/Seoul:${dtStart}`);
      lines.push(`DTEND;TZID=Asia/Seoul:${dtEnd}`);
      const rrule = getIcsRruleString(sch.repeat);
      if (rrule) {
        lines.push(`RRULE:${rrule}`);
      }
      lines.push(`SUMMARY:${escapeIcsText(summary)}`);
      lines.push(`CATEGORIES:${escapeIcsText(cat.name)}`);
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
      lines.push('END:VEVENT');
      exportedCount++;
    });

    if (includeTodos) {
      state.todos.forEach(todo => {
        if (!matchesSelectedProjectTag(todo)) return;
        const baseDate = todo.dueDate || (todo.repeat && todo.repeat !== 'none' ? selectedDate : '');
        if (!baseDate) return;
        const cat = getCategoryById(todo.categoryId);
        const pTag = cleanProjectTag(todo.projectTag);
        const dStart = toIcsDateCompact(baseDate);
        const dEnd = toIcsDateCompact(addDaysStr(baseDate, 1));
        const summary = `${pTag ? `@${pTag} ` : ''}마감: ${todo.title}`;
        const descParts = [`구분: 할 일 마감`, `카테고리: ${cat.name}`];
        if (pTag) descParts.push(`프로젝트 태그: @${pTag}`);

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${todo.id || uid('todo')}@timeflow-planner.h1s.workers.dev`);
        lines.push(`DTSTAMP:${nowUtc}`);
        lines.push(`DTSTART;VALUE=DATE:${dStart}`);
        lines.push(`DTEND;VALUE=DATE:${dEnd}`);
        const rrule = getIcsRruleString(todo.repeat);
        if (rrule) {
          lines.push(`RRULE:${rrule}`);
        }
        lines.push(`SUMMARY:${escapeIcsText(summary)}`);
        lines.push(`CATEGORIES:${escapeIcsText(cat.name)}`);
        lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
        lines.push('END:VEVENT');
        exportedCount++;
      });
    }

    if (includeActuals) {
      state.actualLogs.forEach(act => {
        if (!matchesSelectedProjectTag(act)) return;
        const cat = getCategoryById(act.categoryId);
        const pTag = cleanProjectTag(act.projectTag);
        const dCompact = toIcsDateCompact(act.date || selectedDate);
        const dtStart = `${dCompact}T${toIcsTimeCompact(act.startTime || '09:00')}`;
        const dtEnd = `${dCompact}T${toIcsTimeCompact(act.endTime || '10:00')}`;
        const summary = `[진행 기록] ${pTag ? `@${pTag} ` : ''}${act.title}`;

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${act.id || uid('act')}@timeflow-planner.h1s.workers.dev`);
        lines.push(`DTSTAMP:${nowUtc}`);
        lines.push(`DTSTART;TZID=Asia/Seoul:${dtStart}`);
        lines.push(`DTEND;TZID=Asia/Seoul:${dtEnd}`);
        lines.push(`SUMMARY:${escapeIcsText(summary)}`);
        lines.push(`CATEGORIES:${escapeIcsText(cat.name)}`);
        lines.push(`DESCRIPTION:${escapeIcsText(`구분: 타임트래커 실제 기록\n카테고리: ${cat.name}`)}`);
        lines.push('END:VEVENT');
        exportedCount++;
      });
    }

    lines.push('END:VCALENDAR');

    const icsContent = lines.join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const tagSuffix = selectedProjectTag && selectedProjectTag !== '__UNTAGGED__' ? `_${selectedProjectTag}` : '';
    triggerSafeFileDownload(blob, `timeflow_calendar${tagSuffix}_${getTodayStr()}.ics`);

    const statusEl = document.getElementById('icsSyncStatusText');
    if (statusEl) {
      statusEl.textContent = `총 ${exportedCount}건의 항목이 표준 캘린더 파일로 다운로드되었습니다.`;
    }
    showToast(`총 ${exportedCount}건의 일정을 표준 캘린더 파일로 내보냈습니다.`);
  }

  function parseIcsDateTimeValue(propKey, rawVal) {
    const val = String(rawVal || '').trim();
    if (!val) return null;

    if (/VALUE=DATE/i.test(propKey) || /^\d{8}$/.test(val)) {
      const y = val.slice(0, 4);
      const m = val.slice(4, 6);
      const d = val.slice(6, 8);
      return {
        isAllDay: true,
        dateStr: `${y}-${m}-${d}`,
        timeStr: '09:00'
      };
    }

    const match = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
    if (!match) return null;

    const [, yStr, mStr, dStr, hhStr, mmStr, , isUtc] = match;
    if (isUtc) {
      const utcDate = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr), Number(hhStr), Number(mmStr)));
      return {
        isAllDay: false,
        dateStr: toDateStr(utcDate),
        timeStr: `${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`
      };
    }

    return {
      isAllDay: false,
      dateStr: `${yStr}-${mStr}-${dStr}`,
      timeStr: `${hhStr}:${mmStr}`
    };
  }

  function parseIcsRruleToRepeat(rruleStr) {
    const raw = String(rruleStr || '').toUpperCase();
    if (!raw) return 'none';
    if (raw.includes('BYDAY=MO,TU,WE,TH,FR')) return 'weekdays';
    if (raw.includes('FREQ=DAILY')) return 'daily';
    if (raw.includes('FREQ=WEEKLY')) return 'weekly';
    if (raw.includes('FREQ=MONTHLY')) return 'monthly';
    return 'none';
  }

  function importCalendarIcsText(icsText) {
    const unfolded = String(icsText || '').replace(/\r?\n[ \t]/g, '');
    const eventBlocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
    if (eventBlocks.length === 0) {
      showToast('캘린더 파일에서 가져올 수 있는 일정 항목을 찾지 못했습니다.');
      return;
    }

    pushUndoSnapshot('외부 캘린더 가져오기');
    let addedSchedules = 0;
    let addedTodos = 0;
    let addedActuals = 0;

    eventBlocks.forEach(rawBlock => {
      const blockBody = rawBlock.split(/END:VEVENT/i)[0] || '';
      const lines = blockBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      let summary = '';
      let description = '';
      let categoriesText = '';
      let rrule = '';
      let dtStartInfo = null;
      let dtEndInfo = null;

      lines.forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return;
        const propKey = line.slice(0, colonIdx).trim();
        const propVal = line.slice(colonIdx + 1).trim();
        const baseName = propKey.split(';')[0].toUpperCase();

        if (baseName === 'SUMMARY') summary = unescapeIcsText(propVal);
        else if (baseName === 'DESCRIPTION') description = unescapeIcsText(propVal);
        else if (baseName === 'CATEGORIES') categoriesText = unescapeIcsText(propVal);
        else if (baseName === 'RRULE') rrule = propVal;
        else if (baseName === 'DTSTART') dtStartInfo = parseIcsDateTimeValue(propKey, propVal);
        else if (baseName === 'DTEND') dtEndInfo = parseIcsDateTimeValue(propKey, propVal);
      });

      if (!summary || !dtStartInfo) return;

      let cleanTitle = summary.trim();
      let projectTag =
        selectedProjectTag && selectedProjectTag !== '__UNTAGGED__' ? selectedProjectTag : '';

      const titleTagMatch = cleanTitle.match(/@([^\s#,]+)/);
      if (titleTagMatch) {
        projectTag = cleanProjectTag(titleTagMatch[1]);
        cleanTitle = cleanTitle.replace(titleTagMatch[0], '').trim();
      } else {
        const descTagMatch = description.match(/프로젝트\s*태그\s*:\s*@?([^\s\n]+)/);
        if (descTagMatch) {
          projectTag = cleanProjectTag(descTagMatch[1]);
        }
      }

      let categoryId = state.categories[0]?.id || 'cat_work';
      if (categoriesText) {
        const foundCat = state.categories.find(
          c => c.name === categoriesText || categoriesText.includes(c.name) || c.name.includes(categoriesText)
        );
        if (foundCat) categoryId = foundCat.id;
      }

      const repeat = parseIcsRruleToRepeat(rrule);

      if (/^\[진행 기록\]|^\[실제 기록\]/.test(cleanTitle) || /구분:\s*타임트래커 실제 기록/.test(description)) {
        cleanTitle = cleanTitle.replace(/^\[진행 기록\]|^\[실제 기록\]/, '').trim() || '진행 기록';
        const startTime = dtStartInfo.timeStr || '09:00';
        let endTime =
          dtEndInfo && !dtEndInfo.isAllDay
            ? dtEndInfo.timeStr
            : minutesToTime(timeToMinutes(startTime) + 60);
        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
          endTime = minutesToTime(timeToMinutes(startTime) + 30);
        }
        const exists = state.actualLogs.some(
          a => a.date === dtStartInfo.dateStr && a.startTime === startTime && a.title === cleanTitle
        );
        if (!exists) {
          state.actualLogs.push({
            id: uid('act'),
            title: cleanTitle,
            date: dtStartInfo.dateStr,
            startTime,
            endTime,
            categoryId,
            projectTag
          });
          addedActuals++;
        }
        return;
      }

      if (dtStartInfo.isAllDay && (/^마감:/.test(cleanTitle) || /구분:\s*할 일 마감/.test(description))) {
        cleanTitle = cleanTitle.replace(/^마감:\s*/, '').trim() || '할 일';
        const exists = state.todos.some(
          t => t.dueDate === dtStartInfo.dateStr && t.title === cleanTitle
        );
        if (!exists) {
          state.todos.push({
            id: uid('todo'),
            title: cleanTitle,
            dueDate: dtStartInfo.dateStr,
            categoryId,
            projectTag,
            repeat,
            completedDates: [],
            estimatedMinutes: 30,
            important: true,
            completed: false
          });
          addedTodos++;
        }
        return;
      }

      const startTime = dtStartInfo.isAllDay ? '09:00' : dtStartInfo.timeStr || '09:00';
      let endTime =
        dtEndInfo && !dtEndInfo.isAllDay
          ? dtEndInfo.timeStr
          : minutesToTime(timeToMinutes(startTime) + 60);
      if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        endTime = minutesToTime(timeToMinutes(startTime) + 60);
      }

      const exists = state.schedules.some(
        s => s.date === dtStartInfo.dateStr && s.startTime === startTime && s.title === cleanTitle
      );
      if (!exists) {
        state.schedules.push({
          id: uid('sch'),
          title: cleanTitle,
          date: dtStartInfo.dateStr,
          startTime,
          endTime,
          categoryId,
          projectTag,
          repeat,
          completedDates: [],
          alarm: true,
          important: /중요 일정|★/.test(description) || dtStartInfo.isAllDay,
          completed: false
        });
        addedSchedules++;
      }
    });

    const totalAdded = addedSchedules + addedTodos + addedActuals;
    if (totalAdded === 0) {
      undoStack.pop();
      showToast('모든 항목이 이미 등록되어 있어 새로 추가된 일정이 없습니다.');
      return;
    }

    saveState();
    renderAll();

    const statusEl = document.getElementById('icsSyncStatusText');
    const summaryMsg = `일정 ${addedSchedules}건, 할 일 마감 ${addedTodos}건, 진행 기록 ${addedActuals}건을 가져왔습니다.`;
    if (statusEl) {
      statusEl.textContent = summaryMsg;
    }
    showToast(`캘린더 가져오기 완료 · ${summaryMsg}`, { withUndo: true });
  }

  // -------------------- 예시 기록 풍부하게 채우기 & 데이터 정리 --------------------
  function populateRichSampleReportLogs() {
    const today = getTodayStr();
    const range = getReportDateRange(currentReportPeriod, selectedDate || today);
    const isCurrentMonthOrRecent =
      currentReportPeriod === 'thisMonth' ||
      currentReportPeriod === 'last7Days' ||
      currentReportPeriod === 'today' ||
      (range.ymKey && range.ymKey === today.slice(0, 7));
    const anchorDate = isCurrentMonthOrRecent
      ? today
      : range.dateList[Math.min(14, range.dateList.length - 1)] || today;

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

    pushUndoSnapshot('예시 기록 추가');
    let addedCount = 0;
    sampleItems.forEach(item => {
      const dStr = addDaysStr(anchorDate, -item.daysAgo);
      const planExists = state.schedules.some(
        s => s.date === dStr && s.title === item.title && s.startTime === item.start
      );
      if (!planExists) {
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
      }
      const actualExists = state.actualLogs.some(
        a => a.date === dStr && a.title === item.title && a.startTime === item.start
      );
      if (!actualExists) {
        state.actualLogs.push({
          id: uid('act'),
          title: item.title,
          date: dStr,
          startTime: item.start,
          endTime: item.end,
          categoryId: item.cat
        });
        addedCount++;
      }
    });

    if (addedCount === 0) {
      undoStack.pop();
      showToast(`${range.periodFullLabel || '선택 기간'}에 이미 예시 기록이 반영되어 있습니다.`);
      return;
    }

    saveState();
    renderAll();
    showToast(`${range.periodFullLabel || '선택 기간'} 예시 기록 ${addedCount}건이 추가되었습니다.`, { withUndo: true });
  }

  function clearSampleDataOnly() {
    const hasSampleSch = state.schedules.some(
      s => SAMPLE_ITEM_IDS.has(s.id) || SAMPLE_REPORT_TITLES.has(s.title)
    );
    const hasSampleAct = state.actualLogs.some(
      a => SAMPLE_ITEM_IDS.has(a.id) || SAMPLE_REPORT_TITLES.has(a.title)
    );
    const hasSampleTodo = state.todos.some(t => SAMPLE_ITEM_IDS.has(t.id));

    if (!hasSampleSch && !hasSampleAct && !hasSampleTodo) {
      showToast('비울 수 있는 초기 예시 항목이 없습니다.');
      return;
    }

    pushUndoSnapshot('예시 데이터 비우기');
    const prevCount = state.schedules.length + state.actualLogs.length + state.todos.length;
    state.schedules = state.schedules.filter(
      s => !SAMPLE_ITEM_IDS.has(s.id) && !SAMPLE_REPORT_TITLES.has(s.title)
    );
    state.actualLogs = state.actualLogs.filter(
      a => !SAMPLE_ITEM_IDS.has(a.id) && !SAMPLE_REPORT_TITLES.has(a.title)
    );
    state.todos = state.todos.filter(t => !SAMPLE_ITEM_IDS.has(t.id));
    const removed = prevCount - (state.schedules.length + state.actualLogs.length + state.todos.length);

    if (selectedProjectTag) {
      const stillHasTag =
        state.schedules.some(s => cleanProjectTag(s.projectTag) === selectedProjectTag) ||
        state.todos.some(t => cleanProjectTag(t.projectTag) === selectedProjectTag) ||
        state.actualLogs.some(a => cleanProjectTag(a.projectTag) === selectedProjectTag);
      if (!stillHasTag) selectedProjectTag = '';
    }

    saveState();
    renderAll();
    closeModalWindow('syncModal');
    showToast(`초기 예시 항목 ${removed}건을 비웠습니다.`, { withUndo: true });
  }

  function clearAllRecordsWithConfirm() {
    const totalCount = state.schedules.length + state.actualLogs.length + state.todos.length;
    if (totalCount === 0) {
      showToast('초기화할 일정이나 기록이 없습니다.');
      return;
    }
    const ok = window.confirm('카테고리와 루틴 설정은 유지하고 모든 일정, 할 일, 실제 기록을 비우시겠습니까?');
    if (!ok) return;

    pushUndoSnapshot('전체 기록 초기화');
    state.schedules = [];
    state.actualLogs = [];
    state.todos = [];
    selectedProjectTag = '';

    saveState();
    renderAll();
    closeModalWindow('syncModal');
    showToast('모든 일정, 할 일, 진행 기록이 초기화되었습니다.', { withUndo: true });
  }

  // -------------------- 다크 모드 테마 & 통합 검색 --------------------
  function applyThemeUI() {
    const isDark = Boolean(state.settings && state.settings.darkMode);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const metaTheme = document.getElementById('metaThemeColor');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#0F172A' : '#4F46E5');
    }
    const btn = document.getElementById('themeToggleBtn');
    const label = document.getElementById('themeToggleLabel');
    if (btn) btn.classList.toggle('active', isDark);
    if (label) label.textContent = isDark ? '다크 모드 켜짐' : '라이트 모드 켜짐';
  }

  function openGlobalSearchModal() {
    const modal = document.getElementById('searchModal');
    const inp = document.getElementById('globalSearchInput');
    if (!modal) return;
    openModalWindow('searchModal');
    renderGlobalSearchResults();
    setTimeout(() => inp?.focus(), 40);
  }

  function renderGlobalSearchResults() {
    const container = document.getElementById('globalSearchResults');
    const inp = document.getElementById('globalSearchInput');
    if (!container) return;

    const rawQuery = String(inp?.value || '').trim().toLowerCase();
    const cleanQuery = rawQuery.replace(/^[@#]+/, '');
    const results = [];

    const matchesQuery = (title, tag, catName) => {
      if (!cleanQuery) return true;
      return (
        String(title || '').toLowerCase().includes(cleanQuery) ||
        String(tag || '').toLowerCase().includes(cleanQuery) ||
        String(catName || '').toLowerCase().includes(cleanQuery)
      );
    };

    if (currentSearchTypeFilter === 'all' || currentSearchTypeFilter === 'schedule') {
      state.schedules.forEach(s => {
        const cat = getCategoryById(s.categoryId);
        const tag = cleanProjectTag(s.projectTag);
        if (!matchesQuery(s.title, tag, cat.name)) return;
        results.push({
          kind: 'schedule',
          badgeText: '계획 일정',
          badgeCls: 'plan',
          title: s.title,
          dateStr: s.date || getTodayStr(),
          subText: `${s.date || '날짜 미정'} · ${s.startTime}~${s.endTime}${s.repeat && s.repeat !== 'none' ? ` · ${getRepeatLabelKo(s.repeat, s.date)}` : ''} · ${cat.name}`,
          projectTag: tag,
          color: cat.color,
          rawItem: s
        });
      });
    }

    if (currentSearchTypeFilter === 'all' || currentSearchTypeFilter === 'todo') {
      state.todos.forEach(t => {
        const cat = getCategoryById(t.categoryId);
        const tag = cleanProjectTag(t.projectTag);
        if (!matchesQuery(t.title, tag, cat.name)) return;
        results.push({
          kind: 'todo',
          badgeText: '할 일',
          badgeCls: 'deadline',
          title: t.title,
          dateStr: t.dueDate || getTodayStr(),
          subText: `${t.dueDate ? `마감 ${t.dueDate}` : '기한 자유'}${t.repeat && t.repeat !== 'none' ? ` · ${getRepeatLabelKo(t.repeat, t.dueDate)}` : ''} · ${cat.name}`,
          projectTag: tag,
          color: cat.color,
          rawItem: t
        });
      });
    }

    if (currentSearchTypeFilter === 'all' || currentSearchTypeFilter === 'actual') {
      state.actualLogs.forEach(a => {
        const cat = getCategoryById(a.categoryId);
        const tag = cleanProjectTag(a.projectTag);
        if (!matchesQuery(a.title, tag, cat.name)) return;
        results.push({
          kind: 'actual',
          badgeText: '실제 기록',
          badgeCls: 'actual',
          title: a.title,
          dateStr: a.date || getTodayStr(),
          subText: `${a.date} · ${a.startTime}~${a.endTime} · ${formatDurationKo(durationMinutes(a.startTime, a.endTime))} · ${cat.name}`,
          projectTag: tag,
          color: cat.color,
          rawItem: a
        });
      });
    }

    if (currentSearchTypeFilter === 'all' || currentSearchTypeFilter === 'routine') {
      state.routines.forEach(r => {
        const cat = getCategoryById(r.categoryId);
        const stepJoined = (r.steps || []).map(st => st.title).join(' ');
        if (cleanQuery && !matchesQuery(`${r.name} ${stepJoined}`, '', cat.name)) return;
        const totalMin = (r.steps || []).reduce((acc, st) => acc + Number(st.minutes || 0), 0);
        results.push({
          kind: 'routine',
          badgeText: '루틴',
          badgeCls: 'plan',
          title: r.name,
          dateStr: getTodayStr(),
          subText: `${formatRoutineScheduleSummaryKo(r)} · 총 ${totalMin}분 · ${cat.name}`,
          projectTag: '',
          color: cat.color,
          rawItem: r
        });
      });
    }

    results.sort((a, b) => String(b.dateStr || '').localeCompare(String(a.dateStr || '')));
    const sliced = results.slice(0, 45);

    container.innerHTML = '';
    if (sliced.length === 0) {
      container.innerHTML = '<p class="empty-guide">조건에 일치하는 항목이 없습니다.</p>';
      return;
    }

    sliced.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'search-result-card';
      const tagBadge = entry.projectTag ? `<span class="project-tag-pill">@${escapeHtml(entry.projectTag)}</span>` : '';
      const actionPrimaryLabel = entry.kind === 'routine' ? '루틴 시작' : '날짜 이동';
      const actionSecondaryLabel = entry.kind === 'routine' ? '루틴 편집' : '상세 편집';

      card.innerHTML = `
        <div class="sr-left">
          <div class="sr-badges">
            <span class="wk-type-tag ${entry.badgeCls}">${entry.badgeText}</span>
            ${tagBadge}
          </div>
          <div class="sr-title">${escapeHtml(entry.title)}</div>
          <div class="sr-sub">${escapeHtml(entry.subText)}</div>
        </div>
        <div class="sr-actions">
          <button type="button" class="btn-xs btn-outline sr-go-btn">${actionPrimaryLabel}</button>
          <button type="button" class="btn-xs btn-primary sr-edit-btn">${actionSecondaryLabel}</button>
        </div>
      `;

      card.querySelector('.sr-go-btn').addEventListener('click', () => {
        closeModalWindow('searchModal');
        if (entry.kind === 'routine') {
          switchTab('routines');
          startRoutinePlayer(entry.rawItem.id);
        } else {
          selectedDate = entry.dateStr || getTodayStr();
          dashScope = 'day';
          syncCalCursorsToSelectedDate(true);
          switchTab('dashboard');
          renderAll();
        }
      });

      card.querySelector('.sr-edit-btn').addEventListener('click', () => {
        closeModalWindow('searchModal');
        if (entry.kind === 'routine') {
          openRoutineModalForEdit(entry.rawItem);
        } else {
          openItemModalForEdit(entry.kind, entry.rawItem);
        }
      });

      container.appendChild(card);
    });
  }

  // -------------------- 탭 전환 및 유틸리티 --------------------
  function switchTab(tabName) {
    if (!tabName) return;
    const changed = currentActiveTab !== tabName;
    currentActiveTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-view').forEach(sec => {
      sec.classList.toggle('active', sec.id === `tab-${tabName}`);
    });
    syncProjectTagBarVisibility();
    if (changed) {
      renderActiveTabViews(false);
    }
    if (window.innerWidth <= 768) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
      });
    });

    // 통합 검색 모달 & 다크 모드 토글
    document.getElementById('openSearchModalBtn')?.addEventListener('click', openGlobalSearchModal);
    document.getElementById('globalSearchInput')?.addEventListener('input', renderGlobalSearchResults);
    document.querySelectorAll('#globalSearchTypeTabs [data-stype]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#globalSearchTypeTabs .filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSearchTypeFilter = btn.dataset.stype || 'all';
        renderGlobalSearchResults();
      });
    });

    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
      state.settings.darkMode = !state.settings.darkMode;
      saveState();
      applyThemeUI();
      showToast(state.settings.darkMode ? '다크 모드가 적용되었습니다.' : '라이트 모드가 적용되었습니다.');
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
      closeModalWindow('syncModal');
      unlockAudioOnUserGesture();
      requestNotificationPermissionFromGesture();
      triggerAlarmModal({
        type: 'schedule',
        title: '알람 사운드 및 한국어 음성 안내 테스트',
        time: getNowTimeStr(),
        categoryId: state.categories[0].id,
        refId: ''
      });
    });

    document.getElementById('itemModalAlarm')?.addEventListener('change', e => {
      if (e.target.checked) requestNotificationPermissionFromGesture();
    });
    document.getElementById('routineModalAlarm')?.addEventListener('change', e => {
      if (e.target.checked) requestNotificationPermissionFromGesture();
    });

    // 빠른 입력 바 포커스/입력 감지 및 프리뷰
    const quickSectionEl = document.getElementById('quickInputSection');
    const quickInputEl = document.getElementById('quickInputText');
    const quickModeEl = document.getElementById('quickInputMode');
    const quickCatEl = document.getElementById('quickCategorySelect');
    const previewEl = document.getElementById('quickParsePreview');

    const updatePreview = () => {
      const val = quickInputEl.value;
      quickSectionEl?.classList.toggle('has-value', val.trim().length > 0);
      const parsed = parseNaturalQuickInput(val, quickModeEl.value, quickCatEl.value);
      if (!parsed) {
        previewEl.textContent = '시간이나 @프로젝트태그, 매주·매일 키워드를 포함하면 자동 분류됩니다.';
        return;
      }
      const cat = getCategoryById(parsed.categoryId);
      const typeLabel =
        parsed.type === 'actual' ? '실행 기록' : parsed.type === 'schedule' ? '계획 일정' : '할 일';
      const tagPart = parsed.projectTag ? ` · @${parsed.projectTag}` : '';
      const repeatPart = parsed.repeat && parsed.repeat !== 'none' ? ` · ${getRepeatLabelKo(parsed.repeat, parsed.date)}` : '';
      previewEl.textContent = `${typeLabel} · ${parsed.date} ${parsed.type !== 'todo' ? `${parsed.startTime}~${parsed.endTime}` : ''}${repeatPart}${tagPart} · ${parsed.title} · ${cat.name}`;
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
      quickSectionEl?.classList.remove('has-value');
      quickInputEl.blur();
      updatePreview();
      saveState();
      renderAll();
      showToast(`'${parsed.title}' 등록 완료`);
    });

    document.getElementById('aiSmartParseBtn').addEventListener('click', handleAiSmartParse);

    // 날짜 이동 및 날짜 바로 선택
    document.getElementById('prevDayBtn').addEventListener('click', () => {
      selectedDate = addDaysStr(selectedDate, -1);
      syncCalCursorsToSelectedDate(true);
      renderAll();
    });
    document.getElementById('nextDayBtn').addEventListener('click', () => {
      selectedDate = addDaysStr(selectedDate, 1);
      syncCalCursorsToSelectedDate(true);
      renderAll();
    });
    document.getElementById('goTodayBtn').addEventListener('click', () => {
      selectedDate = getTodayStr();
      miniCalCursor = new Date();
      fullCalCursor = new Date();
      renderAll();
    });
    document.getElementById('quickDatePicker')?.addEventListener('change', e => {
      if (!e.target.value) return;
      selectedDate = e.target.value;
      syncCalCursorsToSelectedDate(true);
      renderAll();
    });

    // 모바일 안 B 상단 할 일·루틴 접이식 드로어 토글
    document.getElementById('mobileDrawerToggleBtn')?.addEventListener('click', () => {
      mobileTodoFolded = !mobileTodoFolded;
      syncMobileDrawerUI();
    });
    document.getElementById('mobileQuickAddTodoBtn')?.addEventListener('click', () => {
      openItemModalForCreate('todo');
    });

    // 타임라인 나란히 / 계획 / 실행 전환 탭
    document.querySelectorAll('#dashTrackModeTabs [data-dashtrack]').forEach(btn => {
      btn.addEventListener('click', () => {
        dashTrackMode = btn.dataset.dashtrack;
        calWeekMode = dashTrackMode;
        renderDualTimeline();
      });
    });

    // 1줄 실시간 타이머 바 열기·닫기
    document.getElementById('toggleQuickTimerBtn')?.addEventListener('click', () => {
      const bar = document.getElementById('quickTimerBar');
      if (!bar) return;
      const willShow = bar.classList.contains('hidden');
      bar.classList.toggle('hidden');
      if (willShow) {
        setTimeout(() => document.getElementById('liveTrackerTitle')?.focus(), 30);
      }
    });

    // 할 일 필터 탭 및 프로젝트 태그 묶음 보기 토글
    document.getElementById('toggleTodoGroupByTagBtn')?.addEventListener('click', () => {
      todoGroupByTag = !todoGroupByTag;
      renderTodoList();
    });

    document.querySelectorAll('#todoFilterTabs .filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#todoFilterTabs .filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTodoFilter = btn.dataset.filter;
        renderTodoList();
      });
    });

    // 일정 / 실제 기록 / 할 일 모달 열기 버튼 및 시간 늘리기 모드 토글
    document.querySelectorAll('.js-toggle-resize-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        durationResizeEnabled = !durationResizeEnabled;
        syncDurationResizeModeUI();
        if (durationResizeEnabled) {
          showToast('시간 늘리기 모드가 켜졌습니다. 일정 하단 바를 당겨 시간을 조절하세요.');
        }
      });
    });

    document.getElementById('openAddTodoModalBtn').addEventListener('click', () => openItemModalForCreate('todo'));
    document.getElementById('openAddScheduleBtn').addEventListener('click', () => openItemModalForCreate('schedule'));
    document.getElementById('openAddActualBtn').addEventListener('click', () => openItemModalForCreate('actual'));
    document.getElementById('aiRescheduleBtn').addEventListener('click', handleAiRescheduleDay);

    document.getElementById('itemModalType').addEventListener('change', e => {
      toggleItemModalTimeVisibility(e.target.value);
    });

    // 항목 모달 내 빠른 시간·날짜 이동 버튼
    const shiftModalTimeInputs = deltaMinutes => {
      const startEl = document.getElementById('itemModalStartTime');
      const endEl = document.getElementById('itemModalEndTime');
      if (!startEl || !endEl) return;
      const curStart = timeToMinutes(startEl.value || '09:00');
      const curEnd = timeToMinutes(endEl.value || '10:00');
      const dur = Math.max(15, curEnd - curStart);
      const nextStart = Math.max(0, Math.min(23 * 60 + 45 - dur, curStart + deltaMinutes));
      const nextEnd = Math.min(23 * 60 + 59, nextStart + dur);
      startEl.value = minutesToTime(nextStart);
      endEl.value = minutesToTime(nextEnd);
    };

    document.getElementById('shiftTimeBack30Btn')?.addEventListener('click', () => shiftModalTimeInputs(-30));
    document.getElementById('shiftTimeFwd30Btn')?.addEventListener('click', () => shiftModalTimeInputs(30));
    document.getElementById('shiftTimeFwd60Btn')?.addEventListener('click', () => shiftModalTimeInputs(60));
    document.getElementById('shiftDateNextDayBtn')?.addEventListener('click', () => {
      const dateEl = document.getElementById('itemModalDate');
      if (!dateEl) return;
      dateEl.value = addDaysStr(dateEl.value || selectedDate, 1);
      showToast(`기준 날짜가 ${dateEl.value}로 변경되었습니다.`);
    });

    // 할 일 모달에서 빈 시간대 일정 자동 배치 버튼
    document.getElementById('itemModalTimeblockTodoBtn')?.addEventListener('click', () => {
      const targetDate = document.getElementById('itemModalDate')?.value || selectedDate;
      const estMins = Math.max(15, Number(document.getElementById('itemModalEstMinutes')?.value || 30));
      const slot = findNextFreeSlotOnDate(targetDate, estMins);
      document.getElementById('itemModalType').value = 'schedule';
      document.getElementById('itemModalStartTime').value = slot.startTime;
      document.getElementById('itemModalEndTime').value = slot.endTime;
      toggleItemModalTimeVisibility('schedule');
      showToast(`${targetDate} ${slot.startTime}~${slot.endTime} 빈 시간대가 지정되었습니다. 저장을 누르면 확정됩니다.`);
    });

    // 항목 저장 및 삭제
    document.getElementById('itemModalForm').addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('itemModalId').value;
      const type = document.getElementById('itemModalType').value;
      const title = document.getElementById('itemModalTitle').value.trim();
      const date = document.getElementById('itemModalDate').value || selectedDate;
      const categoryId = document.getElementById('itemModalCategory').value;
      const projectTag = cleanProjectTag(document.getElementById('itemModalProjectTag')?.value || '');
      const repeat = document.getElementById('itemModalRepeat')?.value || 'none';
      const startTime = document.getElementById('itemModalStartTime').value || '09:00';
      let endTime = document.getElementById('itemModalEndTime').value || '10:00';
      const alarm = document.getElementById('itemModalAlarm').checked;
      const important = document.getElementById('itemModalImportant').checked;
      const alarmLeadMinutes = Number(document.getElementById('itemModalAlarmLead')?.value || 0);
      const selectedEstMinutes = Math.max(15, Number(document.getElementById('itemModalEstMinutes')?.value || 30));

      // 종료 시각이 시작 시각보다 빠르거나 같을 경우 자동으로 30분 뒤로 보정
      if (type !== 'todo' && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        endTime = minutesToTime(timeToMinutes(startTime) + 30);
      }

      pushUndoSnapshot(id ? '항목 수정' : '항목 추가');

      // 기존 항목이면 완료 여부, 반복 완료 날짜 목록을 보존한 뒤 교체
      let prevCompleted = false;
      let prevCompletedDates = [];
      if (id) {
        const prevItem =
          state.schedules.find(x => x.id === id) ||
          state.todos.find(x => x.id === id);
        if (prevItem) {
          prevCompleted = Boolean(prevItem.completed);
          if (Array.isArray(prevItem.completedDates)) {
            prevCompletedDates = [...prevItem.completedDates];
          }
        }
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
          projectTag,
          repeat,
          completedDates: prevCompletedDates,
          alarm,
          alarmLeadMinutes,
          important,
          completed: prevCompleted
        });
      } else if (type === 'actual') {
        state.actualLogs.push({
          id: id || uid('act'),
          title,
          date,
          startTime,
          endTime,
          categoryId,
          projectTag
        });
      } else {
        state.todos.push({
          id: id || uid('todo'),
          title,
          dueDate: date,
          categoryId,
          projectTag,
          repeat,
          completedDates: prevCompletedDates,
          estimatedMinutes: selectedEstMinutes,
          important,
          completed: prevCompleted
        });
      }

      closeModalWindow('itemModal');
      saveState();
      renderAll();
      showToast(`'${title}' 항목이 저장되었습니다.`, { withUndo: true });
    });

    document.getElementById('itemModalDeleteBtn').addEventListener('click', () => {
      const id = document.getElementById('itemModalId').value;
      if (!id) return;
      pushUndoSnapshot('항목 삭제');
      state.schedules = state.schedules.filter(x => x.id !== id);
      state.actualLogs = state.actualLogs.filter(x => x.id !== id);
      state.todos = state.todos.filter(x => x.id !== id);
      closeModalWindow('itemModal');
      saveState();
      renderAll();
      showToast('항목이 삭제되었습니다.', { withUndo: true });
    });

    document.getElementById('itemModalGcalBtn')?.addEventListener('click', openGoogleCalendarFromModal);

    // 실시간 타임트래커 스톱워치 버튼
    document.getElementById('startLiveTrackerBtn').addEventListener('click', () => {
      const title = document.getElementById('liveTrackerTitle').value.trim() || '집중 업무 및 학습';
      const catId = document.getElementById('liveTrackerCategory').value;
      const tag = cleanProjectTag(document.getElementById('liveTrackerProjectTag')?.value || '');
      startLiveTrackerWith(title, catId, tag);
    });
    document.getElementById('stopLiveTrackerBtn').addEventListener('click', stopLiveTrackerAndRecord);

    // 루티너리 플레이어 컨트롤 버튼
    document.getElementById('playerPrevStepBtn')?.addEventListener('click', goToPreviousRoutineStep);
    document.getElementById('playerCompleteStepBtn').addEventListener('click', () => {
      if (!routinePlayer.running) {
        const targetRtn = getTargetRoutineForPlayer();
        if (targetRtn) {
          startRoutinePlayer(targetRtn.id);
          renderRoutinePlayerTab();
        }
        return;
      }
      completeCurrentRoutineStep(false);
    });
    document.getElementById('playerSkipStepBtn').addEventListener('click', () => completeCurrentRoutineStep(true));
    document.getElementById('playerAdd5MinBtn').addEventListener('click', () => {
      if (!routinePlayer.running) return;
      routinePlayer.stepTargetSeconds += 300;
      routinePlayer.overtimeNotified = false;
      updateRoutinePlayerUI();
      showToast('현재 행동 목표 시간을 5분 연장했습니다.');
    });
    document.getElementById('playerPauseResumeBtn').addEventListener('click', () => {
      toggleRoutinePlayerPause();
    });
    document.getElementById('playerStopRoutineBtn').addEventListener('click', stopRoutinePlayerEarly);

    // 상단 플로팅 배너 버튼
    document.getElementById('bannerCompleteBtn').addEventListener('click', () => {
      if (routinePlayer.running) completeCurrentRoutineStep(false);
      else if (liveTracker.running) stopLiveTrackerAndRecord();
    });
    document.getElementById('bannerPauseBtn').addEventListener('click', () => {
      if (routinePlayer.running) {
        toggleRoutinePlayerPause();
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
    document.getElementById('aiRoutinePromptInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAiGenerateRoutine();
      }
    });
    document.getElementById('addRoutineStepRowBtn').addEventListener('click', () => appendRoutineStepEditorRow('', 5, ''));

    // 루틴 요일 선택 · 프리셋 · 요일별 시작 시간 설정
    document.querySelectorAll('#routineActiveDaysGroup .day-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        renderRoutineModalDayTimesGrid();
      });
    });

    document.querySelectorAll('.routine-day-preset').forEach(presetBtn => {
      presetBtn.addEventListener('click', () => {
        const preset = presetBtn.dataset.preset;
        const targetSet =
          preset === 'weekdays'
            ? new Set([1, 2, 3, 4, 5])
            : preset === 'weekend'
            ? new Set([0, 6])
            : new Set([0, 1, 2, 3, 4, 5, 6]);
        document.querySelectorAll('#routineActiveDaysGroup .day-toggle-btn').forEach(btn => {
          btn.classList.toggle('active', targetSet.has(Number(btn.dataset.dow)));
        });
        renderRoutineModalDayTimesGrid();
      });
    });

    document.getElementById('routineCustomDayTimeToggle')?.addEventListener('change', () => {
      renderRoutineModalDayTimesGrid();
    });

    document.getElementById('applyWeekdayTimeBtn')?.addEventListener('click', () => {
      const baseTime = document.getElementById('routineModalTime')?.value || '07:00';
      [1, 2, 3, 4, 5].forEach(d => {
        modalRoutineDayTimes[d] = baseTime;
      });
      renderRoutineModalDayTimesGrid();
    });

    document.getElementById('applyWeekendTimeBtn')?.addEventListener('click', () => {
      [0, 6].forEach(d => {
        modalRoutineDayTimes[d] = '09:00';
      });
      renderRoutineModalDayTimesGrid();
    });

    document.getElementById('routineModalForm').addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('routineModalId').value;
      const name = document.getElementById('routineModalName').value.trim();
      const categoryId = document.getElementById('routineModalCategory').value;
      const startTime = document.getElementById('routineModalTime').value || '07:00';
      const alarm = document.getElementById('routineModalAlarm').checked;
      const alarmLeadMinutes = Number(document.getElementById('routineModalAlarmLead')?.value || 0);
      const useCustomDayTimes = Boolean(document.getElementById('routineCustomDayTimeToggle')?.checked);

      let activeDays = Array.from(document.querySelectorAll('#routineActiveDaysGroup .day-toggle-btn.active'))
        .map(btn => Number(btn.dataset.dow))
        .sort((a, b) => a - b);
      if (activeDays.length === 0) {
        activeDays = [0, 1, 2, 3, 4, 5, 6];
      }

      const dayTimes = {};
      if (useCustomDayTimes) {
        document.querySelectorAll('#routineCustomDayTimesGrid .rdt-time-input').forEach(inp => {
          const dow = Number(inp.dataset.daytimeDow);
          if (!Number.isNaN(dow) && inp.value) {
            modalRoutineDayTimes[dow] = inp.value;
          }
        });
        activeDays.forEach(dow => {
          dayTimes[dow] = modalRoutineDayTimes[dow] || startTime;
        });
      }

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
          target.useCustomDayTimes = useCustomDayTimes;
          target.dayTimes = dayTimes;
          target.alarm = alarm;
          target.alarmLeadMinutes = alarmLeadMinutes;
          target.activeDays = activeDays;
          target.steps = steps.length > 0 ? steps : [{ id: uid('st'), title: '핵심 행동', minutes: 5, tip: '' }];
          if (routinePlayer.activeRoutineId === id && routinePlayer.stepIndex >= target.steps.length) {
            routinePlayer.stepIndex = Math.max(0, target.steps.length - 1);
          }
        }
      } else {
        const newRtnId = uid('rtn');
        state.routines.push({
          id: newRtnId,
          name,
          categoryId,
          startTime,
          useCustomDayTimes,
          dayTimes,
          alarm,
          alarmLeadMinutes,
          activeDays,
          completedDates: [],
          steps: steps.length > 0 ? steps : [{ id: uid('st'), title: '핵심 행동', minutes: 5, tip: '' }]
        });
        selectedPreviewRoutineId = newRtnId;
      }

      closeModalWindow('routineModal');
      saveState();
      renderAll();
      showToast(`'${name}' 루틴이 저장되었습니다.`);
    });

    document.getElementById('routineModalDeleteBtn').addEventListener('click', () => {
      const id = document.getElementById('routineModalId').value;
      if (!id) return;
      pushUndoSnapshot('루틴 삭제');
      if (routinePlayer.running && routinePlayer.activeRoutineId === id) {
        stopRoutinePlayerEarly();
      }
      state.routines = state.routines.filter(r => r.id !== id);
      closeModalWindow('routineModal');
      saveState();
      renderAll();
      showToast('루틴이 삭제되었습니다.', { withUndo: true });
    });

    // 탭 3: 주간·월간 달력 네비게이션 및 보기 옵션
    document.querySelectorAll('#calPrimaryViewTabs [data-calview]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextView = btn.dataset.calview;
        if (nextView === 'month') {
          syncCalCursorsToSelectedDate(true);
        } else if (nextView === 'week') {
          const [sy, sm] = selectedDate.split('-').map(Number);
          if (sy !== fullCalCursor.getFullYear() || sm - 1 !== fullCalCursor.getMonth()) {
            selectedDate = toDateStr(new Date(fullCalCursor.getFullYear(), fullCalCursor.getMonth(), 1));
            syncCalCursorsToSelectedDate(false);
          }
        }
        currentCalView = nextView;
        renderCalendarOverviewTab();
      });
    });

    document.querySelectorAll('#calMonthFilterTabs [data-monthmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        calMonthMode = btn.dataset.monthmode;
        dashMonthMode = calMonthMode;
        renderCalendarOverviewTab();
      });
    });

    document.querySelectorAll('#calWeekTrackTabs [data-weekmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        calWeekMode = btn.dataset.weekmode;
        dashTrackMode = calWeekMode;
        renderCalendarOverviewTab();
      });
    });

    document.querySelectorAll('#calWeekLayoutTabs [data-weeklayout]').forEach(btn => {
      btn.addEventListener('click', () => {
        calWeekLayout = btn.dataset.weeklayout;
        renderCalendarOverviewTab();
      });
    });

    document.querySelectorAll('#milestoneFilterTabs [data-msfilter]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMilestoneFilter = btn.dataset.msfilter;
        renderCalendarOverviewTab();
      });
    });

    document.getElementById('calPrevBtn').addEventListener('click', () => {
      if (currentCalView === 'month') {
        fullCalCursor = new Date(fullCalCursor.getFullYear(), fullCalCursor.getMonth() - 1, 1);
        const todayStr = getTodayStr();
        const [ty, tm] = todayStr.split('-').map(Number);
        selectedDate =
          fullCalCursor.getFullYear() === ty && fullCalCursor.getMonth() === tm - 1
            ? todayStr
            : toDateStr(new Date(fullCalCursor.getFullYear(), fullCalCursor.getMonth(), 1));
      } else {
        selectedDate = addDaysStr(selectedDate, -7);
        syncCalCursorsToSelectedDate(true);
      }
      renderCalendarOverviewTab();
    });
    document.getElementById('calNextBtn').addEventListener('click', () => {
      if (currentCalView === 'month') {
        fullCalCursor = new Date(fullCalCursor.getFullYear(), fullCalCursor.getMonth() + 1, 1);
        const todayStr = getTodayStr();
        const [ty, tm] = todayStr.split('-').map(Number);
        selectedDate =
          fullCalCursor.getFullYear() === ty && fullCalCursor.getMonth() === tm - 1
            ? todayStr
            : toDateStr(new Date(fullCalCursor.getFullYear(), fullCalCursor.getMonth(), 1));
      } else {
        selectedDate = addDaysStr(selectedDate, 7);
        syncCalCursorsToSelectedDate(true);
      }
      renderCalendarOverviewTab();
    });
    document.getElementById('calTodayBtn')?.addEventListener('click', () => {
      selectedDate = getTodayStr();
      fullCalCursor = new Date();
      miniCalCursor = new Date();
      renderAll();
    });

    document.getElementById('toggleMilestonePanelBtn')?.addEventListener('click', () => {
      if (isMobileMilestoneModalViewport()) {
        if (calSideOpen) {
          closeModalWindow('calendarSidePanel');
        } else {
          renderUpcomingMilestones();
          openModalWindow('calendarSidePanel');
        }
      } else {
        calSideOpen = !calSideOpen;
        syncCalendarPanelsUI();
      }
    });
    document.getElementById('closeMilestonePanelBtn')?.addEventListener('click', () => {
      if (overlayHistoryStack.includes('calendarSidePanel')) {
        closeModalWindow('calendarSidePanel');
      } else {
        calSideOpen = false;
        syncCalendarPanelsUI();
      }
    });
    document.getElementById('calendarSideBackdrop')?.addEventListener('click', () => {
      closeModalWindow('calendarSidePanel');
    });
    document.getElementById('toggleCalToolsBtn')?.addEventListener('click', () => {
      calToolsOpen = !calToolsOpen;
      syncCalendarPanelsUI();
    });

    // 월간 날짜 자세히 보기 모달 내부 네비게이션 및 빠른 추가 버튼
    document.getElementById('dayDetailPrevBtn')?.addEventListener('click', () => {
      dayDetailDate = addDaysStr(dayDetailDate || selectedDate, -1);
      selectedDate = dayDetailDate;
      syncCalCursorsToSelectedDate(true);
      renderAll();
    });
    document.getElementById('dayDetailNextBtn')?.addEventListener('click', () => {
      dayDetailDate = addDaysStr(dayDetailDate || selectedDate, 1);
      selectedDate = dayDetailDate;
      syncCalCursorsToSelectedDate(true);
      renderAll();
    });
    document.getElementById('dayDetailGoTimelineBtn')?.addEventListener('click', () => {
      if (dayDetailDate) selectedDate = dayDetailDate;
      syncCalCursorsToSelectedDate(false);
      closeModalWindow('dayDetailModal');
      switchTab('dashboard');
      renderAll();
    });
    document.getElementById('dayDetailAddScheduleBtn')?.addEventListener('click', () => {
      if (dayDetailDate) selectedDate = dayDetailDate;
      openItemModalForCreate('schedule', '09:00', '10:00');
    });
    document.getElementById('dayDetailAddTodoBtn')?.addEventListener('click', () => {
      if (dayDetailDate) selectedDate = dayDetailDate;
      openItemModalForCreate('todo');
    });
    document.getElementById('dayDetailAddActualBtn')?.addEventListener('click', () => {
      if (dayDetailDate) selectedDate = dayDetailDate;
      openItemModalForCreate('actual', '09:00', '10:00');
    });

    document.getElementById('calAddScheduleBtn')?.addEventListener('click', () => openItemModalForCreate('schedule'));
    document.getElementById('calAddTodoBtn')?.addEventListener('click', () => openItemModalForCreate('todo'));
    document.getElementById('calAddActualBtn')?.addEventListener('click', () => openItemModalForCreate('actual'));
    document.getElementById('calExportIcsBtn')?.addEventListener('click', exportCalendarIcsFile);
    document.getElementById('calImportIcsInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          importCalendarIcsText(String(ev.target.result || ''));
        } catch (_) {
          showToast('캘린더 파일을 읽는 중 오류가 발생했습니다.');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    });

    // 탭 4: 타임트래커 보고서 및 다음 달 목표 이벤트
    document.querySelectorAll('#reportPeriodTabs .filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        currentReportPeriod = btn.dataset.period;
        renderReportAndGoalsTab();
      });
    });

    document.getElementById('reportPrevMonthBtn')?.addEventListener('click', () => {
      reportCursor = new Date(reportCursor.getFullYear(), reportCursor.getMonth() - 1, 1);
      currentReportPeriod = 'customMonth';
      renderReportAndGoalsTab();
    });

    document.getElementById('reportNextMonthBtn')?.addEventListener('click', () => {
      reportCursor = new Date(reportCursor.getFullYear(), reportCursor.getMonth() + 1, 1);
      currentReportPeriod = 'customMonth';
      renderReportAndGoalsTab();
    });

    // 프로젝트 태그 필터 바 토글 (오늘 · 캘린더 탭 전용)
    document.querySelectorAll('.js-toggle-ptag-bar').forEach(btn => {
      btn.addEventListener('click', () => {
        projectTagBarOpen = !projectTagBarOpen;
        syncProjectTagBarVisibility();
      });
    });
    document.getElementById('closeProjectTagBarBtn')?.addEventListener('click', () => {
      projectTagBarOpen = false;
      syncProjectTagBarVisibility();
    });

    // 리포트 6개 카드 개별 토글 & 전체 펼치기/접기
    document.querySelectorAll('.report-toggle-card[data-report-card]').forEach(card => {
      const key = card.dataset.reportCard;
      const head = card.querySelector('.report-toggle-head');
      if (!head || !key) return;
      const toggleFn = () => {
        reportCardOpenMap[key] = !reportCardOpenMap[key];
        saveReportCardOpenMap();
        syncReportToggleCardsUI();
      };
      head.addEventListener('click', e => {
        if (e.target.closest('button, a, input, select, textarea')) return;
        toggleFn();
      });
      head.addEventListener('keydown', e => {
        if (e.target !== head) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFn();
        }
      });
    });

    document.getElementById('toggleAllReportCardsBtn')?.addEventListener('click', () => {
      const keys = Object.keys(reportCardOpenMap);
      const allOpen = keys.every(k => Boolean(reportCardOpenMap[k]));
      const nextVal = !allOpen;
      keys.forEach(k => {
        reportCardOpenMap[k] = nextVal;
      });
      saveReportCardOpenMap();
      syncReportToggleCardsUI();
    });

    // 모바일/PC 해상도 전환 시 캘린더 반응형 레이아웃 동기화
    window.addEventListener('resize', () => {
      const nowMob = isMobileCalendarViewport();
      if (nowMob !== lastMobileCalViewport) {
        lastMobileCalViewport = nowMob;
        if (currentActiveTab === 'calendar') {
          renderCalendarOverviewTab();
        }
      }
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
        const linked = item.type === 'schedule' && item.refId ? { type: 'schedule', id: item.refId } : null;
        startLiveTrackerWith(item.title, item.categoryId, item.projectTag || '', linked);
      }
    });

    document.getElementById('alarmSnooze5Btn').addEventListener('click', () => {
      const item = activeAlarmItem;
      closeAlarmModal();
      showToast('5분 뒤에 다시 알람이 울립니다.');
      if (item) {
        clearTimeout(alarmSnoozeTimeoutId);
        alarmSnoozeTimeoutId = setTimeout(() => {
          alarmSnoozeTimeoutId = null;
          const todayStr = getTodayStr();
          if (item.type === 'schedule' && item.refId) {
            const sch = state.schedules.find(s => s.id === item.refId);
            if (!sch || isItemCompletedOnDate(sch, todayStr)) return;
          } else if (item.type === 'routine' && item.refId) {
            const rtn = state.routines.find(r => r.id === item.refId);
            if (!rtn || (Array.isArray(rtn.completedDates) && rtn.completedDates.includes(todayStr))) return;
            if (routinePlayer.running && routinePlayer.activeRoutineId === rtn.id) return;
          }
          triggerAlarmModal({ ...item, alarmKind: 'ontime' });
        }, 300000);
      }
    });

    document.getElementById('alarmDismissBtn').addEventListener('click', closeAlarmModal);

    // 카테고리 편집 모달 (설정 모달에서 연결)
    document.getElementById('openCategoryModalBtn').addEventListener('click', () => {
      closeModalWindow('syncModal');
      renderCategoryEditorModal();
      openModalWindow('categoryModal');
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
      const autoCheck = document.getElementById('autoSyncToggleCheck');
      if (autoCheck) autoCheck.checked = state.settings.autoSync !== false;
      openModalWindow('syncModal');
    });
    document.getElementById('cloudSaveBtn').addEventListener('click', () => syncToCloud('save'));
    document.getElementById('cloudLoadBtn').addEventListener('click', () => syncToCloud('load'));

    document.getElementById('autoSyncToggleCheck')?.addEventListener('change', e => {
      state.settings.autoSync = Boolean(e.target.checked);
      saveState({ skipAutoSync: !state.settings.autoSync });
      updateSyncHeaderUI('idle');
      showToast(state.settings.autoSync ? '자동 클라우드 동기화가 켜졌습니다.' : '자동 클라우드 동기화가 꺼졌습니다.');
    });

    document.getElementById('clearSampleDataBtn')?.addEventListener('click', clearSampleDataOnly);
    document.getElementById('clearAllRecordsBtn')?.addEventListener('click', clearAllRecordsWithConfirm);

    document.getElementById('exportIcsBtn')?.addEventListener('click', exportCalendarIcsFile);
    document.getElementById('importIcsInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          importCalendarIcsText(String(ev.target.result || ''));
        } catch (_) {
          showToast('캘린더 파일을 읽는 중 오류가 발생했습니다.');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      triggerSafeFileDownload(blob, `timeflow_backup_${getTodayStr()}.json`);
      showToast('백업 파일이 다운로드되었습니다.');
    });

    document.getElementById('importJsonInput').addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const imported = JSON.parse(String(ev.target.result));
          pushUndoSnapshot('백업 불러오기');
          state = normalizeImportedState(imported);
          saveState();
          renderAll();
          closeModalWindow('syncModal');
          showToast('백업 파일을 성공적으로 불러왔습니다!', { withUndo: true });
        } catch (_) {
          showToast('유효한 JSON 백업 파일이 아닙니다.');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    });

    // 공통 모달 닫기 버튼 + 배경 클릭 및 단축키 지원
    const closableModalIds = ['itemModal', 'routineModal', 'categoryModal', 'syncModal', 'searchModal', 'dayDetailModal'];

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.close;
        if (targetId) closeModalWindow(targetId);
      });
    });

    closableModalIds.forEach(modalId => {
      const backdropEl = document.getElementById(modalId);
      backdropEl?.addEventListener('click', e => {
        if (e.target === backdropEl) {
          closeModalWindow(modalId);
        }
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (closeTopModalWindow()) {
          e.preventDefault();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openGlobalSearchModal();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const activeTag = (document.activeElement?.tagName || '').toUpperCase();
        const isTyping =
          activeTag === 'INPUT' ||
          activeTag === 'TEXTAREA' ||
          activeTag === 'SELECT' ||
          document.activeElement?.isContentEditable;
        if (!isTyping && undoStack.length > 0) {
          e.preventDefault();
          performUndo();
        }
      }
    });
  }

  // -------------------- 절전 복귀 및 백그라운드 깨어남 동기화 --------------------
  function handleAppWakeup() {
    if (liveTracker.running && liveTracker.startTimestamp) {
      liveTracker.elapsedSeconds = Math.floor((Date.now() - liveTracker.startTimestamp) / 1000);
      updateLiveTrackerClockUI();
      updateTopBannerUI();
    }
    if (routinePlayer.running && !routinePlayer.paused) {
      tickRoutinePlayer();
    }
    checkScheduledAlarms();
    if (Date.now() - lastAutoCloudPullAt > 45000) {
      checkCloudLatestOnStartup(true);
    }
  }

  // -------------------- 초기화 실행 --------------------
  function init() {
    try {
      history.replaceState({ timeflowBase: true }, '', location.href);
    } catch (_) {}
    window.addEventListener('popstate', handleOverlayPopState);
    window.addEventListener('resize', () => {
      if (!calSideOpen) return;
      const inMobileModal = isMobileMilestoneModalViewport();
      const inStack = overlayHistoryStack.includes('calendarSidePanel');
      if (inMobileModal && !inStack) {
        openModalWindow('calendarSidePanel');
      } else if (!inMobileModal && inStack) {
        const idx = overlayHistoryStack.lastIndexOf('calendarSidePanel');
        if (idx !== -1) overlayHistoryStack.splice(idx, 1);
        const panel = document.getElementById('calendarSidePanel');
        const backdrop = document.getElementById('calendarSideBackdrop');
        if (panel) panel.style.zIndex = '';
        if (backdrop) backdrop.style.zIndex = '';
        syncOverlayStackZIndex();
        scheduleOverlayHistorySync();
        syncCalendarPanelsUI();
      } else {
        syncCalendarPanelsUI();
      }
    });

    applyThemeUI();
    refreshKoreanSpeechVoice();
    if ('speechSynthesis' in window && typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refreshKoreanSpeechVoice);
    }

    // iOS Safari 오디오 컨텍스트 잠금 해제 및 인터럽트 자동 복구
    ['touchstart', 'touchend', 'click', 'keydown'].forEach(evtName => {
      document.addEventListener(evtName, unlockAudioOnUserGesture, { passive: true });
    });

    bindEvents();
    renderAll();
    checkScheduledAlarms();
    checkCloudLatestOnStartup(true);

    // 매 15초마다 정각 및 사전 예고 알람 체크
    setInterval(checkScheduledAlarms, 15000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleAppWakeup();
      } else {
        flushPendingAutoCloudSave();
      }
    });
    window.addEventListener('pagehide', flushPendingAutoCloudSave);
    window.addEventListener('focus', handleAppWakeup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
