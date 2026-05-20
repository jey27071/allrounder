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
// Gemini API 호출 (REST, no SDK)
// ============================================================

interface CallGeminiOpts {
  systemPrompt: string
  userMessage: string
  model?: string // default gemini-2.5-flash
  temperature?: number
}

async function callGemini(opts: CallGeminiOpts): Promise<string> {
  const model = opts.model ?? 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: opts.userMessage }],
      },
    ],
    systemInstruction: {
      parts: [{ text: opts.systemPrompt }],
    },
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: 2048,
    },
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
// State Machine — 각 상태별 핸들러
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

  // 1. 자비스의 응답 메시지
  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'jarvis',
    type: 'StatusUpdate',
    content: jarvisResponse,
  })

  // 2. 루미에게 위임하는 카드
  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'jarvis',
    recipient: 'lumi',
    cc: ['director'],
    re: 'Opportunity Map 작성 의뢰',
    type: 'Deliverable',
    content: `[위임 내용]\n• 도메인: ${mission.domain}\n• 임무: ${mission.charter}\n${mission.context ? `• 컨텍스트: ${mission.context.slice(0, 100)}${mission.context.length > 100 ? '...' : ''}` : ''}\n\n루미님, 위 미션 헌장에 따라 Opportunity Map v1.0을 작성해주세요.`,
    metadata: { delegation: 'lumi', agent_color: 'lumi' },
  })

  // 3. 상태 전이
  await supabase.from('missions').update({
    current_state: 'LUMI_WORKING',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'LUMI_WORKING'
}

async function handleLumiWorking(supabase: SbClient, mission: Mission): Promise<string> {
  const systemPrompt = await loadAgentPrompt(supabase, 'lumi')

  const userPrompt = `[자비스로부터 미션을 받았습니다]

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}
${mission.context ? `- 컨텍스트: ${mission.context}` : ''}

위 미션에 따라 Opportunity Map v1.0을 한국어로 작성하세요.

산출물 형식:
[A] 도메인 스캐닝 요약 (1단락)
[B] 5개 후보 비교 매트릭스
   각 후보의 4축 점수 (T·U·P·B, 각 ★1~★5)와 종합 점수
[C] 후보별 1페이저 브리프 (×5)
   각각: What / Who / Signals (구체 근거 2개+) / Why now / Data Gap / Open Questions
[D] 회고 일기 (3줄: 난점/깨달음/다음에)

가드레일:
- Signals는 검증 가능한 구체적 근거여야 함 (일반론 금지)
- Data Gap을 비워두지 말 것
- 4축 점수에 1줄 근거 동반
- 5개 중 최소 1개는 "확신도 낮지만 흥미로운" 영역 포함`

  const lumiResponse = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-flash',
    temperature: 0.8,
  })

  // Opportunity Map 저장 (메시지 + deliverable 양쪽)
  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'lumi',
    recipient: 'aki',
    cc: ['director'],
    re: 'Opportunity Map v1.0 — 1차 제출',
    type: 'Deliverable',
    cycle: '0/2',
    content: lumiResponse,
  })

  await supabase.from('deliverables').insert({
    mission_id: mission.id,
    type: 'opportunity_map',
    version: 'v1.0',
    data: { raw: lumiResponse },
    raw_markdown: lumiResponse,
    created_by: 'lumi',
    status: 'pending',
  })

  // 상태 전이: 아키 검수 단계로
  await supabase.from('missions').update({
    current_state: 'AKI_REVIEWING',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'AKI_REVIEWING'
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResp({ error: 'POST only' }, 405)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const { mission_id } = await req.json()

    if (!mission_id) {
      return jsonResp({ error: 'mission_id required' }, 400)
    }

    const { data: mission, error } = await supabase
      .from('missions')
      .select('*')
      .eq('id', mission_id)
      .single()

    if (error || !mission) {
      return jsonResp({ error: 'Mission not found', detail: error?.message }, 404)
    }

    let newState: string
    switch (mission.current_state) {
      case 'MISSION_CREATED':
        newState = await handleMissionCreated(supabase, mission)
        break
      case 'LUMI_WORKING':
      case 'LUMI_RESUBMITTING':
        newState = await handleLumiWorking(supabase, mission)
        break
      case 'AKI_REVIEWING':
      case 'AKI_DESIGNING':
      case 'WAITING_CP1':
      case 'WAITING_CP2':
      case 'COMPLETED':
      case 'ERROR_STATE':
        return jsonResp({ ok: true, note: 'No-op for state', state: mission.current_state }, 200)
      default:
        return jsonResp({ error: `Unknown state: ${mission.current_state}` }, 400)
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
