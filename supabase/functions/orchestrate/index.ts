// supabase/functions/orchestrate/index.ts
// Multi-Agent Orchestrator — 워크플로우 상태 머신 + Gemini API 호출

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!

// ============================================================
// 견고한 JSON 파서 (마크다운 fence 제거 + 자동 수리)
// ============================================================

// Gemini가 자주 누락하는 패턴: 속성명 앞 " 빠짐
//   예: `,\n  why_now":` → `,\n  "why_now":`
function repairJson(text: string): string {
  // 1) 객체/콤마/배열 뒤 공백 + 영문/언더스코어로 시작하는 키" 패턴 → " 추가
  return text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*":/g, '$1"$2":')
}

// deno-lint-ignore no-explicit-any
function parseLooseJson(text: string): any | null {
  if (!text) return null
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')

  // 최상위가 { 또는 [ 중 어느 것인지 자동 판별
  const firstObj = cleaned.indexOf('{')
  const firstArr = cleaned.indexOf('[')
  const lastObj = cleaned.lastIndexOf('}')
  const lastArr = cleaned.lastIndexOf(']')

  let firstChar = -1
  let lastChar = -1
  // 더 앞에 있는 여는 괄호를 최상위로 간주
  if (firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)) {
    firstChar = firstObj
    lastChar = lastObj
  } else if (firstArr >= 0) {
    firstChar = firstArr
    lastChar = lastArr
  }

  if (firstChar >= 0 && lastChar > firstChar) {
    cleaned = cleaned.slice(firstChar, lastChar + 1)
  }

  // 1차: 그대로 시도
  try { return JSON.parse(cleaned) } catch (_e) { /* fall through */ }
  // 2차: 수리 시도
  try { return JSON.parse(repairJson(cleaned)) } catch (e) {
    console.error('JSON parse failed even after repair:', e)
    return null
  }
}

// ============================================================
// Gemini API 호출
// ============================================================

interface CallGeminiOpts {
  systemPrompt: string
  userMessage: string
  model?: string
  temperature?: number
  jsonMode?: boolean
}

async function callGemini(opts: CallGeminiOpts): Promise<string> {
  const model = opts.model ?? 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`

  // deno-lint-ignore no-explicit-any
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: opts.userMessage }] }],
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: 32768,
    },
  }
  if (opts.jsonMode) {
    body.generationConfig.responseMimeType = 'application/json'
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error('Gemini empty response: ' + JSON.stringify(data).slice(0, 500))
  }
  return text
}

// ============================================================
// 상태 머신 핸들러
// ============================================================

// deno-lint-ignore no-explicit-any
type Mission = any
// deno-lint-ignore no-explicit-any
type SbClient = any

async function loadAgentPrompt(supabase: SbClient, agentId: string): Promise<string> {
  const { data: agent } = await supabase.from('agents').select('system_prompt').eq('id', agentId).single()
  const { data: wisdoms } = await supabase
    .from('wisdom_principles')
    .select('title, description')
    .contains('applies_to', [agentId])
    .eq('active', true)

  let prompt = agent?.system_prompt ?? ''
  if (wisdoms && wisdoms.length > 0) {
    prompt += '\n\n# 적용 가능한 인공 지혜 (Learned Principles)\n'
    for (const w of wisdoms) {
      prompt += `- **${w.title}**: ${w.description}\n`
    }
  }
  return prompt
}

async function getLatestDeliverable(supabase: SbClient, missionId: string, type: string) {
  const { data } = await supabase
    .from('deliverables')
    .select('*')
    .eq('mission_id', missionId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

// --- MISSION_CREATED ---
async function handleMissionCreated(supabase: SbClient, mission: Mission): Promise<string> {
  const systemPrompt = await loadAgentPrompt(supabase, 'jarvis')

  const userPrompt = `[디렉터로부터 새 미션을 받았습니다]

도메인: ${mission.domain}
임무: ${mission.charter}
${mission.context ? `컨텍스트:\n${mission.context}` : ''}

위 미션을 받았다는 것을 디렉터에게 확인하고, 루미(리서치 전문가)에게 위임하겠다는 메시지를 한국어로 작성하세요.
- 2~3문장 이내로 간결하게
- 과한 인사 금지
- 차분하고 신뢰감 있는 톤`

  const jarvisResponse = await callGemini({ systemPrompt, userMessage: userPrompt })

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'jarvis',
    type: 'StatusUpdate',
    content: jarvisResponse,
  })

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'jarvis',
    recipient: 'lumi',
    cc: ['director'],
    re: 'Opportunity Map 작성 의뢰',
    type: 'Deliverable',
    content: `[위임 내용]\n• 도메인: ${mission.domain}\n• 임무: ${mission.charter}\n${mission.context ? `• 컨텍스트: ${mission.context.slice(0, 100)}${mission.context.length > 100 ? '...' : ''}` : ''}\n\n루미님, 위 미션 헌장에 따라 Opportunity Map v1.0을 작성해주세요.`,
    metadata: { delegation: 'lumi' },
  })

  await supabase.from('missions').update({
    current_state: 'LUMI_WORKING',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'LUMI_WORKING'
}

// --- LUMI_WORKING (or LUMI_RESUBMITTING) ---
async function handleLumiWorking(supabase: SbClient, mission: Mission): Promise<string> {
  const systemPrompt = await loadAgentPrompt(supabase, 'lumi')

  // 재제출이면 이전 반려 메시지 컨텍스트 첨부
  let rejectContext = ''
  if (mission.current_state === 'LUMI_RESUBMITTING') {
    const { data: lastReject } = await supabase
      .from('messages')
      .select('content')
      .eq('mission_id', mission.id)
      .eq('type', 'Reject')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (lastReject) {
      rejectContext = `\n\n[이전 반려 사유]\n${lastReject.content}\n\n위 반려 사유를 반영하여 v1.1을 작성하세요.`
    }
  }

  const userPrompt = `[자비스로부터 미션을 받았습니다]

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}
${mission.context ? `- 컨텍스트: ${mission.context}` : ''}

위 미션에 따라 Opportunity Map v1.0을 작성하세요.

⚠️ 출력 형식 — JSON으로만 응답하세요. 마크다운·설명 없이 순수 JSON:

{
  "summary": "[A] 도메인 스캐닝 요약을 1단락으로 (한국어)",
  "candidates": [
    {
      "number": 1,
      "name": "후보 영역 이름",
      "scores": { "T": 5, "U": 4, "P": 5, "B": 4 },
      "total": 18,
      "what": "무슨 문제를 푸는가",
      "who": "타깃 사용자 (구체적 세그먼트)",
      "signals": ["구체적 근거 1", "구체적 근거 2", "구체적 근거 3"],
      "why_now": "왜 지금이 타이밍인가",
      "data_gap": "확신할 수 없는 부분 / 데이터 공백",
      "open_questions": "디렉터에게 묻는 질문"
    }
  ],
  "diary": {
    "difficulty": "이번 업무에서 가장 어려웠던 것",
    "insight": "새로 알게 된 것",
    "next_try": "다음번 시도할 개선점"
  }
}

candidates는 정확히 5개. 그 중 최소 1개는 "확신도 낮지만 흥미로운" 영역 포함.
점수는 각 1~5 정수. total은 4개 점수의 합.
signals 배열은 최소 2개, 모두 검증 가능한 구체적 근거여야 함 (일반론 금지).${rejectContext}`

  const lumiResponse = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-flash',
    temperature: 0.8,
    jsonMode: true,
  })

  // JSON 파싱 시도 (마크다운 fence 처리 + 부분 복구)
  // deno-lint-ignore no-explicit-any
  let parsed: any = parseLooseJson(lumiResponse)
  if (!parsed) {
    console.error('Lumi JSON parse failed. Raw:', lumiResponse.slice(0, 500))
    parsed = { error: 'parse_failed', raw: lumiResponse }
  }

  // Markdown 표현 생성 (UI 표시용)
  const md = renderOpportunityMapMarkdown(parsed)

  // 메시지 + deliverable 저장
  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'lumi',
    recipient: 'aki',
    cc: ['director'],
    re: `Opportunity Map v${mission.reject_cycle === 0 ? '1.0' : `1.${mission.reject_cycle}`} — 제출`,
    type: 'Deliverable',
    cycle: `${mission.reject_cycle}/2`,
    content: md,
    metadata: { format: 'opportunity_map', parsed },
  })

  await supabase.from('deliverables').insert({
    mission_id: mission.id,
    type: 'opportunity_map',
    version: `v1.${mission.reject_cycle}`,
    data: parsed,
    raw_markdown: md,
    created_by: 'lumi',
    status: 'pending',
  })

  await supabase.from('missions').update({
    current_state: 'AKI_REVIEWING',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'AKI_REVIEWING'
}

function renderOpportunityMapMarkdown(parsed: { summary?: string; candidates?: Array<{ number: number; name: string; scores: { T: number; U: number; P: number; B: number }; total: number; what: string; who: string; signals: string[]; why_now: string; data_gap: string; open_questions: string }>; diary?: { difficulty: string; insight: string; next_try: string }; error?: string; raw?: string }): string {
  if (parsed.error) return `(파싱 실패)\n\n${parsed.raw ?? ''}`
  let md = `## Opportunity Map v1.0\n\n### [A] 도메인 스캐닝 요약\n\n${parsed.summary ?? ''}\n\n### [B] 비교 매트릭스\n\n`
  md += `| # | 후보 | T | U | P | B | 종합 |\n|---|---|---|---|---|---|---|\n`
  for (const c of parsed.candidates ?? []) {
    md += `| ${c.number} | ${c.name} | ${'★'.repeat(c.scores.T)} | ${'★'.repeat(c.scores.U)} | ${'★'.repeat(c.scores.P)} | ${'★'.repeat(c.scores.B)} | ${c.total}/20 |\n`
  }
  md += `\n### [C] 후보별 브리프\n\n`
  for (const c of parsed.candidates ?? []) {
    md += `\n#### #${c.number}. ${c.name}\n`
    md += `- **What**: ${c.what}\n`
    md += `- **Who**: ${c.who}\n`
    md += `- **Signals**: ${c.signals?.map((s: string) => `\n  - ${s}`).join('') ?? ''}\n`
    md += `- **Why now**: ${c.why_now}\n`
    md += `- 🚨 **Data Gap**: ${c.data_gap}\n`
    md += `- **Open Questions**: ${c.open_questions}\n`
  }
  if (parsed.diary) {
    md += `\n### [D] 회고 일기\n\n- 난점: ${parsed.diary.difficulty}\n- 깨달음: ${parsed.diary.insight}\n- 다음에: ${parsed.diary.next_try}\n`
  }
  return md
}

// --- AKI_REVIEWING (Reject Gate) ---
async function handleAkiReviewing(supabase: SbClient, mission: Mission): Promise<string> {
  const systemPrompt = await loadAgentPrompt(supabase, 'aki')

  const opportunityMap = await getLatestDeliverable(supabase, mission.id, 'opportunity_map')
  if (!opportunityMap) {
    throw new Error('Opportunity Map not found for review')
  }

  const userPrompt = `[루미가 제출한 Opportunity Map을 검수하세요]

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}

제출된 산출물 (JSON):
${JSON.stringify(opportunityMap.data, null, 2)}

현재 반려 사이클: ${mission.reject_cycle}/2

⚠️ Reject Gate 검수 후 다음 JSON 형식으로만 응답:

{
  "decision": "pass" | "reject",
  "blocking_check": {
    "B1": "통과 또는 위반 사유",
    "B2": "통과 또는 위반 사유",
    "B3": "통과 또는 위반 사유",
    "B4": "통과 또는 위반 사유",
    "B5": "통과 또는 위반 사유"
  },
  "quality_scores": {
    "Q1_signal_specificity": 4,
    "Q2_logical_consistency": 5,
    "Q3_differentiation": 4,
    "Q4_design_viability": 4
  },
  "quality_total": 17,
  "overall_assessment": "1~2 문장 종합 평가",
  "specific_feedback": ["반려 시 구체적 보완 요청 1", "보완 요청 2"],
  "recommendation": "반려 시 A안(보존)·B안(교체) 등 권고 (통과 시 빈 문자열)",
  "diary": {
    "difficulty": "이번 검수에서 어려웠던 것",
    "insight": "깨달은 것",
    "next_try": "다음번 시도할 개선점"
  }
}

판단 기준:
- 1차 Blocking Check 중 하나라도 위반 → reject
- 2차 Quality Total < 16 → reject
- 둘 다 통과 → pass`

  const akiResponse = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-flash',
    temperature: 0.3,
    jsonMode: true,
  })

  // deno-lint-ignore no-explicit-any
  let review: any = parseLooseJson(akiResponse)
  if (!review) {
    console.error('Aki review JSON parse failed. Raw:', akiResponse.slice(0, 500))
    review = { decision: 'reject', error: 'parse_failed', raw: akiResponse }
  }

  // MVP: threshold 완화 (16 → 12). Gemini Flash 품질 고려.
  const PASS_THRESHOLD = 12
  let isPass = review.decision === 'pass'
  if (!isPass && typeof review.quality_total === 'number' && review.quality_total >= PASS_THRESHOLD && (!review.blocking_check || Object.values(review.blocking_check).every((v: unknown) => typeof v === 'string' && (v as string).includes('통과')))) {
    // threshold 충족 + blocking 통과 시 강제 pass
    isPass = true
    review.decision = 'pass'
    review.note = `자동 통과 (threshold ${PASS_THRESHOLD} 충족)`
  }

  // 메시지 저장
  const messageBody = isPass
    ? `[검수 통과 — Quality ${review.quality_total}/20]\n\n${review.overall_assessment ?? ''}`
    : `[반려 — Quality ${review.quality_total ?? '?'}/20]\n\n사유:\n${(review.specific_feedback ?? []).map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}\n\n권고: ${review.recommendation ?? '-'}`

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'aki',
    recipient: 'lumi',
    cc: ['director'],
    re: isPass ? `Opportunity Map 검수 통과` : `Opportunity Map 반려 (Quality ${review.quality_total}/20)`,
    type: isPass ? 'Approval' : 'Reject',
    cycle: `${mission.reject_cycle}/2`,
    content: messageBody,
    metadata: { review },
  })

  // 일기
  if (review.diary) {
    await supabase.from('diaries').insert({
      mission_id: mission.id,
      agent_id: 'aki',
      context_label: `Aki Review Round ${mission.reject_cycle + 1}`,
      difficulty: review.diary.difficulty,
      insight: review.diary.insight,
      next_try: review.diary.next_try,
    })
  }

  if (isPass) {
    await supabase.from('missions').update({
      current_state: 'WAITING_CP1',
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)

    // Deliverable approved 처리
    await supabase.from('deliverables').update({
      status: 'approved',
      reviewed_by: 'aki',
      review_score: review.quality_total,
    }).eq('id', opportunityMap.id)

    return 'WAITING_CP1'
  }

  // 반려 처리
  const newCycle = mission.reject_cycle + 1
  if (newCycle >= 2) {
    // 에스컬레이션
    await supabase.from('missions').update({
      current_state: 'ERROR_STATE',
      reject_cycle: newCycle,
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)
    return 'ERROR_STATE'
  }

  await supabase.from('missions').update({
    current_state: 'LUMI_RESUBMITTING',
    reject_cycle: newCycle,
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  await supabase.from('deliverables').update({
    status: 'rejected',
    reviewed_by: 'aki',
    review_score: review.quality_total,
    review_notes: review.specific_feedback?.join('; '),
  }).eq('id', opportunityMap.id)

  return 'LUMI_RESUBMITTING'
}

// --- JOI_DESIGNING (or JOI_REVISING) ---
async function handleJoiDesigning(supabase: SbClient, mission: Mission): Promise<string> {
  const systemPrompt = await loadAgentPrompt(supabase, 'joi')

  // Aki의 Blueprint 로드
  const blueprint = await getLatestDeliverable(supabase, mission.id, 'product_blueprint')
  if (!blueprint) {
    throw new Error('Product Blueprint not found for Joi')
  }

  // 수정 요청 컨텍스트 (있을 경우)
  let reviseContext = ''
  if (mission.current_state === 'JOI_REVISING') {
    const { data: lastRevise } = await supabase
      .from('messages')
      .select('content')
      .eq('mission_id', mission.id)
      .eq('sender', 'director')
      .eq('type', 'UserInput')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (lastRevise) {
      reviseContext = `\n\n[디렉터의 수정 요청]\n${lastRevise.content}\n\n위 수정 요청을 반영해 새 시안을 작성하세요.`
    }
  }

  const userPrompt = `[아키의 Product Blueprint를 받아 시각 시안을 작성합니다]

Blueprint 데이터 (JSON):
${JSON.stringify(blueprint.data, null, 2)}

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}

위 Blueprint의 P0 기능 중 핵심 3~5개 화면을 HTML+TailwindCSS 코드로 작성하세요.
지정된 JSON 형식으로만 응답.${reviseContext}`

  const joiResponse = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-pro', // HTML 코드 품질 + Flash 503 회피
    temperature: 0.7,
    jsonMode: true,
  })

  // deno-lint-ignore no-explicit-any
  let designs: any = parseLooseJson(joiResponse)
  if (!designs) {
    console.error('Joi JSON parse failed. Raw:', joiResponse.slice(0, 500))
    designs = { error: 'parse_failed', raw: joiResponse }
  }
  // 정규화: Gemini가 최상위 배열로 반환한 경우 {screens: [...]}로 감쌈
  if (Array.isArray(designs)) {
    designs = { screens: designs }
  }
  // 정규화: 각 screen의 html 필드명 표준화 (html_tailwind → html)
  if (designs?.screens && Array.isArray(designs.screens)) {
    // deno-lint-ignore no-explicit-any
    designs.screens = designs.screens.map((s: any) => ({
      ...s,
      html: s.html ?? s.html_tailwind ?? s.code ?? '',
    }))
  }

  const md = renderScreenDesignsMarkdown(designs)

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'joi',
    recipient: 'director',
    cc: ['aki'],
    re: 'Screen Designs v1.0 — 제출',
    type: 'Deliverable',
    content: md,
    metadata: { format: 'screen_designs', parsed: designs },
  })

  await supabase.from('deliverables').insert({
    mission_id: mission.id,
    type: 'screen_designs',
    version: 'v1.0',
    data: designs,
    raw_markdown: md,
    created_by: 'joi',
    status: 'pending',
  })

  if (designs.diary) {
    await supabase.from('diaries').insert({
      mission_id: mission.id,
      agent_id: 'joi',
      context_label: 'Joi Screen Designs v1.0',
      difficulty: designs.diary.difficulty,
      insight: designs.diary.insight,
      next_try: designs.diary.next_try,
    })
  }

  await supabase.from('missions').update({
    current_state: 'WAITING_CP3',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'WAITING_CP3'
}

// deno-lint-ignore no-explicit-any
function renderScreenDesignsMarkdown(d: any): string {
  if (d.error) return `(파싱 실패)\n\n${d.raw ?? ''}`
  let md = `## Screen Designs v1.0\n\n`
  if (d.design_intent) md += `**디자인 의도**\n${d.design_intent}\n\n`
  if (d.design_tokens) {
    md += `**디자인 토큰**\n`
    for (const [k, v] of Object.entries(d.design_tokens)) md += `- ${k}: ${v}\n`
    md += `\n`
  }
  md += `### 화면 (${d.screens?.length ?? 0}개)\n\n`
  for (const s of d.screens ?? []) {
    md += `#### ${s.name}\n- 목적: ${s.purpose}\n- 노트: ${s.design_notes}\n\n`
  }
  if (d.interaction_notes) md += `**인터랙션 메모**\n${d.interaction_notes}\n\n`
  if (d.diary) md += `### 회고 일기\n- 난점: ${d.diary.difficulty}\n- 깨달음: ${d.diary.insight}\n- 다음에: ${d.diary.next_try}\n`
  return md
}

// --- AKI_DESIGNING ---
async function handleAkiDesigning(supabase: SbClient, mission: Mission): Promise<string> {
  const systemPrompt = await loadAgentPrompt(supabase, 'aki')

  const opportunityMap = await getLatestDeliverable(supabase, mission.id, 'opportunity_map')
  if (!opportunityMap || mission.selected_candidate_index == null) {
    throw new Error('Opportunity Map 또는 선택된 후보 인덱스 누락')
  }

  // deno-lint-ignore no-explicit-any
  const selected = (opportunityMap.data?.candidates ?? []).find((c: any) => c.number === mission.selected_candidate_index)
  if (!selected) {
    throw new Error(`후보 #${mission.selected_candidate_index} 찾을 수 없음`)
  }

  const userPrompt = `[디렉터가 후보 #${selected.number} "${selected.name}" 을 선택했습니다]

선택된 후보 상세:
${JSON.stringify(selected, null, 2)}

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}

위 후보를 실제로 디자인 작업을 시작할 수 있는 Product Blueprint v1.0으로 변환하세요.

⚠️ 출력 형식 — JSON으로만 응답:

{
  "product_name": "워킹 네임 (가칭)",
  "concept": {
    "one_liner": "이 제품은 ___을(를) 위한 ___이다",
    "value_proposition": ["가치 1", "가치 2", "가치 3"],
    "positioning": ["vs 경쟁사 A: ...", "vs B: ...", "vs C: ..."]
  },
  "persona": {
    "name": "구체적 이름",
    "demographics": "나이·직업·맥락",
    "context": "회사·도구·환경",
    "goals": ["목표 1", "목표 2", "목표 3"],
    "pains": ["페인 1", "페인 2", "페인 3"],
    "scenario": "하루 시나리오 1단락 (제품을 어떻게 사용하는지)"
  },
  "jobs": [
    { "name": "Job #1 이름", "trigger": "트리거", "steps": "사용 단계", "satisfaction": "만족 조건" }
  ],
  "features": {
    "p0": [
      { "name": "기능명", "what": "무엇", "why_p0": "왜 P0", "solves_job": "어떤 Job 해결" }
    ],
    "p1": [{ "name": "기능명", "what": "무엇" }],
    "p2": [{ "name": "기능명", "what": "무엇" }]
  },
  "screens": [
    { "name": "화면명", "purpose": "목적" }
  ],
  "ia_tree": "텍스트 IA 트리 다이어그램",
  "ui_direction": {
    "tone_adjectives": ["형용사 1", "형용사 2", "형용사 3"],
    "principles": ["원칙 1", "원칙 2", "원칙 3"],
    "references": ["레퍼런스 제품 1", "2", "3"]
  },
  "director_review_items": [
    { "id": "R1", "title": "검토 항목", "description": "왜 인간 결단 필요한가" }
  ],
  "diary": {
    "difficulty": "...",
    "insight": "...",
    "next_try": "..."
  }
}

P0는 5개 이내. 페르소나는 구체적 이름·맥락 필수.`

  const akiResponse = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-flash',
    temperature: 0.6,
    jsonMode: true,
  })

  // deno-lint-ignore no-explicit-any
  let blueprint: any = parseLooseJson(akiResponse)
  if (!blueprint) {
    console.error('Aki blueprint JSON parse failed. Raw:', akiResponse.slice(0, 500))
    blueprint = { error: 'parse_failed', raw: akiResponse }
  }

  const md = renderBlueprintMarkdown(blueprint)

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'aki',
    recipient: 'director',
    cc: ['lumi'],
    re: 'Product Blueprint v1.0 — 제출',
    type: 'Deliverable',
    content: md,
    metadata: { format: 'product_blueprint', parsed: blueprint },
  })

  await supabase.from('deliverables').insert({
    mission_id: mission.id,
    type: 'product_blueprint',
    version: 'v1.0',
    data: blueprint,
    raw_markdown: md,
    created_by: 'aki',
    status: 'pending',
  })

  if (blueprint.diary) {
    await supabase.from('diaries').insert({
      mission_id: mission.id,
      agent_id: 'aki',
      context_label: 'Aki Blueprint v1.0',
      difficulty: blueprint.diary.difficulty,
      insight: blueprint.diary.insight,
      next_try: blueprint.diary.next_try,
    })
  }

  await supabase.from('missions').update({
    current_state: 'WAITING_CP2',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'WAITING_CP2'
}

// deno-lint-ignore no-explicit-any
function renderBlueprintMarkdown(b: any): string {
  if (b.error) return `(파싱 실패)\n\n${b.raw ?? ''}`
  let md = `## Product Blueprint v1.0 — ${b.product_name ?? '(이름 없음)'}\n\n`
  md += `### [A] 제품 컨셉\n\n**One-liner**: ${b.concept?.one_liner ?? ''}\n\n**Value Proposition**\n`
  for (const v of b.concept?.value_proposition ?? []) md += `- ${v}\n`
  md += `\n**포지셔닝**\n`
  for (const p of b.concept?.positioning ?? []) md += `- ${p}\n`
  md += `\n### [B] 핵심 페르소나 — ${b.persona?.name ?? ''}\n\n`
  md += `- **인구통계**: ${b.persona?.demographics ?? ''}\n`
  md += `- **맥락**: ${b.persona?.context ?? ''}\n`
  md += `- **목표**: ${(b.persona?.goals ?? []).join(' / ')}\n`
  md += `- **페인**: ${(b.persona?.pains ?? []).join(' / ')}\n`
  md += `- **시나리오**: ${b.persona?.scenario ?? ''}\n\n`
  md += `### [C] 핵심 Jobs\n\n`
  for (const j of b.jobs ?? []) md += `**${j.name}** — 트리거: ${j.trigger} / 단계: ${j.steps} / 만족: ${j.satisfaction}\n\n`
  md += `### [D] 기능 + 우선순위\n\n**P0 (MVP):**\n`
  for (const f of b.features?.p0 ?? []) md += `- ${f.name}: ${f.what}\n`
  md += `\n**P1:**\n`
  for (const f of b.features?.p1 ?? []) md += `- ${f.name}: ${f.what}\n`
  md += `\n**P2:**\n`
  for (const f of b.features?.p2 ?? []) md += `- ${f.name}: ${f.what}\n`
  md += `\n### [E] 화면 인벤토리\n\n`
  for (const s of b.screens ?? []) md += `- **${s.name}**: ${s.purpose}\n`
  md += `\n${b.ia_tree ?? ''}\n\n### [F] UI/UX 방향성\n\n`
  md += `- 톤: ${(b.ui_direction?.tone_adjectives ?? []).join(' / ')}\n`
  md += `- 원칙: ${(b.ui_direction?.principles ?? []).join(' / ')}\n`
  md += `- 레퍼런스: ${(b.ui_direction?.references ?? []).join(' / ')}\n\n`
  md += `### [G] 🚨 디렉터 검토 요청\n\n`
  for (const r of b.director_review_items ?? []) md += `- **${r.id} ${r.title}**: ${r.description}\n`
  if (b.diary) md += `\n### [H] 회고 일기\n\n- 난점: ${b.diary.difficulty}\n- 깨달음: ${b.diary.insight}\n- 다음에: ${b.diary.next_try}\n`
  return md
}

// ============================================================
// 사용자 결정 핸들러
// ============================================================

async function handleCp1Decision(supabase: SbClient, mission: Mission, selectedIndex: number): Promise<string> {
  if (mission.current_state !== 'WAITING_CP1') {
    throw new Error(`CP1 결정은 WAITING_CP1 상태에서만 가능 (현재: ${mission.current_state})`)
  }

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'director',
    type: 'Approval',
    re: 'CP1 — 후보 선택',
    content: `후보 #${selectedIndex}를 선택했습니다. 아키에게 Blueprint 작성을 요청합니다.`,
  })

  await supabase.from('missions').update({
    current_state: 'AKI_DESIGNING',
    selected_candidate_index: selectedIndex,
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'AKI_DESIGNING'
}

async function handleCp2Decision(supabase: SbClient, mission: Mission, decision: string, comments?: string): Promise<string> {
  if (mission.current_state !== 'WAITING_CP2') {
    throw new Error(`CP2 결정은 WAITING_CP2 상태에서만 가능 (현재: ${mission.current_state})`)
  }

  if (decision === 'approve') {
    await supabase.from('messages').insert({
      mission_id: mission.id,
      sender: 'director',
      type: 'Approval',
      re: 'CP2 — Blueprint 승인',
      content: 'Blueprint 승인. 조이에게 시각 시안 작성을 요청합니다.',
    })
    // 이제 COMPLETED 대신 JOI_DESIGNING으로 전이
    await supabase.from('missions').update({
      current_state: 'JOI_DESIGNING',
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)
    return 'JOI_DESIGNING'
  }

  if (decision === 'revise') {
    await supabase.from('messages').insert({
      mission_id: mission.id,
      sender: 'director',
      type: 'UserInput',
      re: 'CP2 — 수정 요청',
      content: comments ?? '디렉터가 수정 요청',
    })
    await supabase.from('missions').update({
      current_state: 'AKI_REVISING',
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)
    return 'AKI_REVISING'
  }

  throw new Error(`알 수 없는 decision: ${decision}`)
}

// ============================================================
// Specialist 호출 (메인 워크플로우와 별개)
// ============================================================

// deno-lint-ignore no-explicit-any
const SPECIALIST_CONFIG: Record<string, any> = {
  friday: {
    label: '사업화 검증',
    deliverableType: 'business_model',
    model: 'gemini-2.5-pro',
    needsBlueprint: false,
    needsDesigns: false,
  },
  tars: {
    label: 'React 코드 변환',
    deliverableType: 'frontend_code',
    model: 'gemini-2.5-pro',
    needsBlueprint: true,
    needsDesigns: true,
  },
  echo: {
    label: '접근성 검수',
    deliverableType: 'a11y_audit',
    model: 'gemini-2.5-flash',
    needsBlueprint: false,
    needsDesigns: true,
  },
  kitt: {
    label: '법무 1차 검토',
    deliverableType: 'legal_review',
    model: 'gemini-2.5-flash',
    needsBlueprint: true,
    needsDesigns: false,
  },
  ethica: {
    label: '윤리 검토',
    deliverableType: 'ethics_review',
    model: 'gemini-2.5-pro',
    needsBlueprint: true,
    needsDesigns: false,
  },
  qa_bot: {
    label: '테스트 케이스 생성',
    deliverableType: 'test_suite',
    model: 'gemini-2.5-flash',
    needsBlueprint: true,
    needsDesigns: false,
  },
}

async function handleSpecialistInvocation(
  supabase: SbClient,
  mission: Mission,
  specialistId: string,
): Promise<string> {
  const config = SPECIALIST_CONFIG[specialistId]
  if (!config) throw new Error(`Unknown specialist: ${specialistId}`)

  const systemPrompt = await loadAgentPrompt(supabase, specialistId)

  // 필요한 컨텍스트 자료 로드
  let contextParts = `미션 헌장:\n- 도메인: ${mission.domain}\n- 임무: ${mission.charter}\n${mission.context ? `- 컨텍스트: ${mission.context}` : ''}`

  if (config.needsBlueprint || true) {
    const blueprint = await getLatestDeliverable(supabase, mission.id, 'product_blueprint')
    if (blueprint) {
      contextParts += `\n\n[아키의 Product Blueprint]\n${JSON.stringify(blueprint.data, null, 2)}`
    }
  }

  if (config.needsDesigns) {
    const designs = await getLatestDeliverable(supabase, mission.id, 'screen_designs')
    if (designs) {
      contextParts += `\n\n[조이의 화면 디자인]\n${JSON.stringify(designs.data, null, 2)}`
    }
  }

  // Lumi의 Opportunity Map도 항상 컨텍스트에 포함
  const oppMap = await getLatestDeliverable(supabase, mission.id, 'opportunity_map')
  if (oppMap) {
    contextParts += `\n\n[루미의 Opportunity Map]\n${JSON.stringify(oppMap.data, null, 2)}`
  }

  const userPrompt = `${contextParts}\n\n위 정보를 바탕으로 당신의 전문 영역 보고서를 작성하세요. 시스템 프롬프트에 정의된 JSON 형식으로만 응답.`

  const response = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: config.model,
    temperature: 0.5,
    jsonMode: true,
  })

  // deno-lint-ignore no-explicit-any
  let parsed: any = parseLooseJson(response)
  if (!parsed) {
    console.error(`${specialistId} JSON parse failed. Raw:`, response.slice(0, 500))
    parsed = { error: 'parse_failed', raw: response }
  }

  // 메시지 저장
  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: specialistId,
    recipient: 'director',
    re: `${config.label} 보고서`,
    type: 'Deliverable',
    content: renderSpecialistMarkdown(specialistId, parsed),
    metadata: { format: config.deliverableType, parsed },
  })

  // 산출물 저장
  await supabase.from('deliverables').insert({
    mission_id: mission.id,
    type: config.deliverableType,
    version: 'v1.0',
    data: parsed,
    raw_markdown: renderSpecialistMarkdown(specialistId, parsed),
    created_by: specialistId,
    status: 'final',
  })

  // diary 저장 (있을 경우)
  if (parsed.diary) {
    await supabase.from('diaries').insert({
      mission_id: mission.id,
      agent_id: specialistId,
      context_label: `${config.label} v1.0`,
      difficulty: parsed.diary.difficulty,
      insight: parsed.diary.insight,
      next_try: parsed.diary.next_try,
    })
  }

  return mission.current_state // 상태는 그대로 유지 (specialist는 메인 흐름과 별개)
}

// deno-lint-ignore no-explicit-any
function renderSpecialistMarkdown(specialistId: string, parsed: any): string {
  if (parsed.error) return `(파싱 실패)\n\n${parsed.raw ?? ''}`
  const config = SPECIALIST_CONFIG[specialistId]
  let md = `## ${config.label} 보고서\n\n`
  // 일반화: 객체의 각 키를 섹션으로 렌더
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'diary') continue
    md += `### ${key.replace(/_/g, ' ')}\n`
    if (typeof value === 'string') md += `${value}\n\n`
    else md += `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n`
  }
  if (parsed.diary) {
    md += `### 회고\n- 난점: ${parsed.diary.difficulty}\n- 깨달음: ${parsed.diary.insight}\n- 다음에: ${parsed.diary.next_try}\n`
  }
  return md
}

async function handleCp3Decision(supabase: SbClient, mission: Mission, decision: string, comments?: string): Promise<string> {
  if (mission.current_state !== 'WAITING_CP3') {
    throw new Error(`CP3 결정은 WAITING_CP3 상태에서만 가능 (현재: ${mission.current_state})`)
  }

  if (decision === 'approve') {
    await supabase.from('messages').insert({
      mission_id: mission.id,
      sender: 'director',
      type: 'Approval',
      re: 'CP3 — 디자인 시안 승인',
      content: '최종 승인. 미션 완료.',
    })
    await supabase.from('missions').update({
      current_state: 'COMPLETED',
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)
    return 'COMPLETED'
  }

  if (decision === 'revise') {
    await supabase.from('messages').insert({
      mission_id: mission.id,
      sender: 'director',
      type: 'UserInput',
      re: 'CP3 — 디자인 수정 요청',
      content: comments ?? '디렉터가 디자인 수정 요청',
    })
    await supabase.from('missions').update({
      current_state: 'JOI_REVISING',
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)
    return 'JOI_REVISING'
  }

  throw new Error(`알 수 없는 decision: ${decision}`)
}

// ============================================================
// 메인 핸들러
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const body = await req.json()
    const { mission_id, action, selected_candidate_index, decision, comments, specialist_id } = body

    if (!mission_id) return jsonResp({ error: 'mission_id required' }, 400)

    const { data: mission, error } = await supabase
      .from('missions')
      .select('*')
      .eq('id', mission_id)
      .single()

    if (error || !mission) return jsonResp({ error: 'Mission not found', detail: error?.message }, 404)

    let newState: string

    // 사용자 결정 액션
    if (action === 'cp1') {
      newState = await handleCp1Decision(supabase, mission, selected_candidate_index)
    } else if (action === 'cp2') {
      newState = await handleCp2Decision(supabase, mission, decision, comments)
    } else if (action === 'cp3') {
      newState = await handleCp3Decision(supabase, mission, decision, comments)
    } else if (action === 'specialist') {
      if (!specialist_id) return jsonResp({ error: 'specialist_id required' }, 400)
      newState = await handleSpecialistInvocation(supabase, mission, specialist_id)
    } else {
      // 자동 진행 (상태 기반)
      switch (mission.current_state) {
        case 'MISSION_CREATED':
          newState = await handleMissionCreated(supabase, mission)
          break
        case 'LUMI_WORKING':
        case 'LUMI_RESUBMITTING':
          newState = await handleLumiWorking(supabase, mission)
          break
        case 'AKI_REVIEWING':
          newState = await handleAkiReviewing(supabase, mission)
          break
        case 'AKI_DESIGNING':
        case 'AKI_REVISING':
          newState = await handleAkiDesigning(supabase, mission)
          break
        case 'JOI_DESIGNING':
        case 'JOI_REVISING':
          newState = await handleJoiDesigning(supabase, mission)
          break
        case 'WAITING_CP1':
        case 'WAITING_CP2':
        case 'WAITING_CP3':
        case 'COMPLETED':
        case 'ERROR_STATE':
          return jsonResp({ ok: true, note: 'No-op for state', state: mission.current_state }, 200)
        default:
          return jsonResp({ error: `Unknown state: ${mission.current_state}` }, 400)
      }
    }

    return jsonResp({ ok: true, mission_id, new_state: newState }, 200)
  } catch (err) {
    console.error('orchestrate error:', err)
    return jsonResp({ error: String(err) }, 500)
  }
})

function jsonResp(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}
