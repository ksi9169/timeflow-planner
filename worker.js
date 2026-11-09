const DEFAULT_SUPABASE_URL = 'https://buwyexbkjtnubjjzjgxa.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_9UEw3qlP8N6mss-ECjYrSA_lVs33DzY';

const MODEL_PRIORITY = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash'
];

// 무료 API 키 한도 소진(429 등) 시 90초간 쿨다운 후 다시 무료 키 1순위로 자동 복귀
const keyCooldownUntil = new Map();

function getOrderedApiKeys(env) {
  const now = Date.now();
  const candidates = [
    { key: env && env.GEMINI_FREE_API_KEY, tier: 'free' },
    { key: env && env.GEMINI_API_KEY, tier: 'paid' }
  ];
  const seen = new Set();
  const unique = [];
  for (const item of candidates) {
    const k = String(item.key || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    unique.push({
      key: k,
      tier: item.tier,
      coolingDown: (keyCooldownUntil.get(k) || 0) > now
    });
  }
  const active = unique.filter(x => !x.coolingDown);
  const cooling = unique.filter(x => x.coolingDown);
  return [...active, ...cooling];
}

function shouldSwitchToNextKey(key, status, errBody = '') {
  if (
    status === 429 ||
    status === 401 ||
    status === 403 ||
    (status === 400 && /API_KEY|quota|billing|key not valid/i.test(errBody))
  ) {
    keyCooldownUntil.set(key, Date.now() + 90_000);
    return true;
  }
  return false;
}

function extractCandidateText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return '';
  const nonThought = parts.filter(p => !p.thought && typeof p.text === 'string' && p.text.trim());
  const picked = nonThought.length > 0 ? nonThought[nonThought.length - 1] : parts[parts.length - 1];
  return String(picked?.text || '').trim();
}

function parseJsonSafe(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (_) {}
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (_) {}
    }
    return null;
  }
}

async function generateWithFallback(apiKeys, payload, timeoutMs = 12000) {
  let lastErr = 'No available model';

  for (const { key, tier } of apiKeys) {
    for (const modelName of MODEL_PRIORITY) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          return { ok: true, data, modelName: `${modelName}:${tier}` };
        }
        const errBody = await res.text().catch(() => '');
        lastErr = `${modelName}:${tier} (${res.status})`;
        if (shouldSwitchToNextKey(key, res.status, errBody)) {
          break;
        }
      } catch (e) {
        lastErr = `${modelName}:${tier} (${e.message || 'timeout'})`;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { ok: false, error: lastErr };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

async function runSupabaseKeepAlive(env) {
  const supabaseUrl = (env && env.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const supabaseKey = (env && env.SUPABASE_KEY) || DEFAULT_SUPABASE_KEY;
  const nowIso = new Date().toISOString();

  const upsertRes = await fetch(`${supabaseUrl}/rest/v1/escape_rooms`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({
      code: 'TIMEFLOW:__KEEPALIVE__',
      room_data: { ping: nowIso, service: 'timeflow-planner' },
      updated_at: nowIso
    })
  });

  const selectRes = await fetch(
    `${supabaseUrl}/rest/v1/escape_rooms?code=eq.TIMEFLOW:__KEEPALIVE__&select=code,updated_at`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    }
  );

  const rows = selectRes.ok ? await selectRes.json().catch(() => []) : [];
  return {
    ok: upsertRes.ok && selectRes.ok,
    timestamp: nowIso,
    rowsChecked: Array.isArray(rows) ? rows.length : 0
  };
}

async function handleCloudSync(request, env) {
  const supabaseUrl = (env && env.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const supabaseKey = (env && env.SUPABASE_KEY) || DEFAULT_SUPABASE_KEY;
  const body = await request.json().catch(() => ({}));
  const action = body.action || 'load';
  const rawSyncCode = String(body.syncCode || '').trim().toUpperCase();

  if (!rawSyncCode || rawSyncCode.length < 3) {
    return jsonResponse({ ok: false, error: '동기화 코드를 3자 이상 입력해 주세요.' }, 400);
  }

  const dbCode = `TIMEFLOW:${rawSyncCode}`;

  if (action === 'save') {
    const nowIso = new Date().toISOString();
    const res = await fetch(`${supabaseUrl}/rest/v1/escape_rooms`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        code: dbCode,
        room_data: body.state || {},
        updated_at: nowIso
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return jsonResponse({ ok: false, error: `클라우드 저장 실패: ${errText}` }, 502);
    }
    return jsonResponse({ ok: true, updatedAt: nowIso });
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/escape_rooms?code=eq.${encodeURIComponent(dbCode)}&select=room_data,updated_at`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    }
  );
  if (!res.ok) {
    return jsonResponse({ ok: false, error: '클라우드 조회 실패' }, 502);
  }
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return jsonResponse({ ok: true, found: false, state: null });
  }
  return jsonResponse({
    ok: true,
    found: true,
    state: rows[0].room_data || null,
    updatedAt: rows[0].updated_at
  });
}

async function handleAiRequest(request, env) {
  const apiKeys = getOrderedApiKeys(env);
  const body = await request.json().catch(() => null);
  if (!body) {
    return jsonResponse({ ok: false, error: '잘못된 요청 형식입니다.' }, 400);
  }

  const { action, payload = {} } = body;

  // 1. 자연어 초고속 입력 파싱 (일정 + 할 일 + 사후 타임트래커 기록 동시 분리)
  if (action === 'parse_quick_input') {
    const { text = '', todayDate = '', currentTime = '12:00', categories = [] } = payload;
    const catList = categories.map(c => `${c.id}(${c.name})`).join(', ');

    const prompt = `당신은 개인 일정·할 일·타임트래커 통합 관리 웹앱의 자연어 입력 파서입니다.
사용자의 입력 문장을 분석하여 1) 계획 일정(schedules), 2) 할 일(todos), 3) 이미 수행한 실제 시간 기록(actualLogs)으로 분류하세요.

- 기준 오늘 날짜: ${todayDate}
- 현재 시각: ${currentTime}
- 사용 가능한 카테고리 ID 목록: ${catList}

[분류 기준]
1. "아까 ~했어", "2시부터 4시까지 코딩했음", "~완료했어"처럼 이미 한 일과 시간대가 언급되면 actualLogs에 넣으세요.
2. 특정 날짜와 시작 시각이 있는 미래/오늘 계획("오후 3시 치과", "내일 10시~12시 회의")은 schedules에 넣으세요. 종료 시각이 없으면 기본 60분 뒤로 설정하세요.
3. 특정 시각 없이 해야 할 과업("기획서 작성하기", "금요일까지 세금 납부")은 todos에 넣으세요.

[사용자 입력]
"${text}"

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "사용자 입력을 어떻게 등록했는지 한 줄 안내 문구",
  "schedules": [
    { "title": "일정 제목", "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "categoryId": "카테고리ID", "alarm": true, "important": false }
  ],
  "todos": [
    { "title": "할 일 제목", "dueDate": "YYYY-MM-DD 또는 빈문자열", "categoryId": "카테고리ID", "estimatedMinutes": 30, "important": false }
  ],
  "actualLogs": [
    { "title": "실제 수행한 일", "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "categoryId": "카테고리ID" }
  ]
}`;

    const res = await generateWithFallback(apiKeys, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    }, 10000);

    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, 502);
    const parsed = parseJsonSafe(extractCandidateText(res.data));
    if (!parsed) return jsonResponse({ ok: false, error: 'AI 응답 파싱 실패' }, 502);
    return jsonResponse({ ok: true, result: parsed, modelName: res.modelName });
  }

  // 2. 루티너리 스타일 맞춤 루틴 자동 생성
  if (action === 'generate_routine') {
    const { requestText = '', categories = [] } = payload;
    const catList = categories.map(c => `${c.id}(${c.name})`).join(', ');

    const prompt = `당신은 '루티너리(Routinery)' 스타일의 행동 루틴 설계 전문가입니다.
사용자의 요청에 맞춰 바로 타이머로 실행할 수 있는 단계별 루틴을 설계하세요.
- 사용 가능한 카테고리 ID: ${catList}

[사용자 요청]
"${requestText}"

반드시 아래 JSON 형식으로만 응답하세요:
{
  "name": "루틴 이름",
  "startTime": "권장 시작 시각 (HH:MM)",
  "categoryId": "가장 어울리는 카테고리ID",
  "description": "루틴 한 줄 소개",
  "steps": [
    { "title": "구체적인 행동 명칭", "minutes": 5, "tip": "행동할 때 도움이 되는 짧은 팁이나 음성 안내 멘트" }
  ]
}`;

    const res = await generateWithFallback(apiKeys, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
    }, 10000);

    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, 502);
    const parsed = parseJsonSafe(extractCandidateText(res.data));
    if (!parsed) return jsonResponse({ ok: false, error: 'AI 루틴 생성 파싱 실패' }, 502);
    return jsonResponse({ ok: true, result: parsed, modelName: res.modelName });
  }

  // 3. 밀린 하루 일정 원클릭 재배치
  if (action === 'reschedule_day') {
    const { currentTime = '14:00', todayDate = '', schedules = [], todos = [] } = payload;
    const prompt = `현재 시각은 ${todayDate} ${currentTime}입니다.
오늘 남은 시간(${currentTime} ~ 23:00) 동안 아직 완료되지 않은 일정과 할 일을 무리하지 않게 재배치해 주세요.

[미완료 일정]
${JSON.stringify(schedules)}

[미완료 할 일]
${JSON.stringify(todos)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "advice": "남은 하루를 어떻게 운영하는 것이 좋을지 따뜻한 한두 문장 조언",
  "rearrangedSchedules": [
    { "id": "기존id 또는 new", "title": "제목", "startTime": "HH:MM", "endTime": "HH:MM", "categoryId": "카테고리ID", "important": true }
  ],
  "postponedTodoIds": ["오늘 하기 어려워 내일로 미루기를 추천하는 할 일 ID 목록"]
}`;

    const res = await generateWithFallback(apiKeys, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    }, 11000);

    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, 502);
    const parsed = parseJsonSafe(extractCandidateText(res.data));
    if (!parsed) return jsonResponse({ ok: false, error: 'AI 일정 재배치 파싱 실패' }, 502);
    return jsonResponse({ ok: true, result: parsed, modelName: res.modelName });
  }

  // 4. 타임트래커 심층 분석 리포트 & 다음 달 목표 역산 설계
  if (action === 'analyze_report') {
    const { monthLabel = '', statsSummary = {}, userGoalWish = '', categories = [] } = payload;
    const prompt = `당신은 사용자의 타임트래커(계획 vs 실제 사용 시간)와 루틴 데이터를 분석하여 피드백 보고서와 다음 달 목표 시간 예산을 짜주는 전문 시간관리 코치입니다.

- 분석 대상 월: ${monthLabel}
- 카테고리 목록: ${JSON.stringify(categories)}
- 이번 달 집계 데이터(계획 시간, 실제 기록 시간, 루틴 달성률 등):
${JSON.stringify(statsSummary)}
- 사용자의 다음 달 희망 사항: "${userGoalWish || '균형 잡힌 성장을 원함'}"

반드시 아래 JSON 형식으로만 응답하세요:
{
  "headline": "이번 달 시간 사용 패턴을 관통하는 핵심 한 줄 총평",
  "timeLeakAnalysis": "계획 대비 실제 시간 차이와 시간이 새고 있는 구간에 대한 구체적 진단 (2~3문장)",
  "goldenTimeAnalysis": "집중도와 실행률이 높은 시간대 및 루틴 수행 강점 분석 (2문장)",
  "keep": "이번 달 잘 지켰고 다음 달에도 유지할 점",
  "problem": "이번 달 아쉬웠거나 계획 오류가 컸던 점",
  "tryAction": "다음 달에 당장 실천할 구체적 행동 전략",
  "recommendedBudgets": [
    { "categoryId": "카테고리ID", "monthlyHours": 20, "reason": "추천 이유 한 줄" }
  ],
  "recommendedGoals": [
    "다음 달 핵심 실천 목표 1",
    "다음 달 핵심 실천 목표 2",
    "다음 달 핵심 실천 목표 3"
  ]
}`;

    const res = await generateWithFallback(apiKeys, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
    }, 15000);

    if (!res.ok) return jsonResponse({ ok: false, error: res.error }, 502);
    const parsed = parseJsonSafe(extractCandidateText(res.data));
    if (!parsed) return jsonResponse({ ok: false, error: 'AI 분석 리포트 파싱 실패' }, 502);
    return jsonResponse({ ok: true, result: parsed, modelName: res.modelName });
  }

  return jsonResponse({ ok: false, error: '지원하지 않는 AI 액션입니다.' }, 400);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/api/keepalive') {
      const status = await runSupabaseKeepAlive(env);
      return jsonResponse(status, status.ok ? 200 : 502);
    }

    if (url.pathname === '/api/sync' && request.method === 'POST') {
      return handleCloudSync(request, env);
    }

    if (url.pathname === '/api/ai' && request.method === 'POST') {
      return handleAiRequest(request, env);
    }

    if (env && env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      if (
        url.pathname === '/' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css')
      ) {
        const headers = new Headers(res.headers);
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers
        });
      }
      return res;
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSupabaseKeepAlive(env));
  }
};
