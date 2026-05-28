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

interface InlineImage {
  mimeType: string
  base64: string
}

interface CallGeminiOpts {
  systemPrompt: string
  userMessage: string
  images?: InlineImage[]
  model?: string
  temperature?: number
  jsonMode?: boolean
}

// 503/429 등 일시적 장애 시 재시도. 그 외(400/401/403)는 즉시 throw.
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const MAX_RETRIES = 2 // 초기 1회 + 재시도 2회 = 총 3회 시도

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// deno-lint-ignore no-explicit-any
async function attemptGeminiModel(model: string, body: any): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        throw new Error('Gemini empty response: ' + JSON.stringify(data).slice(0, 500))
      }
      return text
    }

    const errText = await response.text()
    lastError = new Error(`Gemini API error (${response.status}) on ${model}: ${errText}`)

    if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) {
      throw lastError
    }

    const backoffMs = 1000 * Math.pow(2, attempt) // 1s, 2s
    console.warn(`Gemini ${model} ${response.status} — retrying in ${backoffMs}ms (${attempt + 1}/${MAX_RETRIES})`)
    await sleep(backoffMs)
  }

  throw lastError ?? new Error(`Gemini ${model} unreachable`)
}

// ============================================================
// Imagen 3 — 이미지 생성 (Phase 26)
// ============================================================
/** Imagen 3로 이미지 1장 생성. 실패 시 null. */
async function callImagen(prompt: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`
    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1' },
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const errText = await response.text()
      console.warn(`Imagen API error (${response.status}): ${errText.slice(0, 300)}`)
      return null
    }
    const data = await response.json()
    // deno-lint-ignore no-explicit-any
    const pred: any = data?.predictions?.[0]
    if (!pred?.bytesBase64Encoded) {
      console.warn('Imagen empty response', JSON.stringify(data).slice(0, 200))
      return null
    }
    return { base64: pred.bytesBase64Encoded, mimeType: pred.mimeType ?? 'image/png' }
  } catch (e) {
    console.warn('Imagen call failed:', e)
    return null
  }
}

/** base64 이미지를 Supabase Storage `agent-references` bucket에 업로드. 성공 시 storage_path 반환. */
async function uploadGeneratedImage(
  supabase: SbClient,
  missionId: string,
  imageBase64: string,
  mimeType: string,
  label: string,
): Promise<string | null> {
  try {
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') ? 'jpg' : 'png'
    const path = `mission-${missionId}/imagen-${Date.now()}-${label}.${ext}`
    // base64 → Uint8Array
    const binary = atob(imageBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const { error } = await supabase.storage.from('agent-references').upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    })
    if (error) {
      console.warn(`Storage upload failed for ${path}:`, error.message)
      return null
    }
    return path
  } catch (e) {
    console.warn('uploadGeneratedImage failed:', e)
    return null
  }
}

async function callGemini(opts: CallGeminiOpts): Promise<string> {
  const primaryModel = opts.model ?? 'gemini-2.5-flash'

  // deno-lint-ignore no-explicit-any
  const parts: any[] = [{ text: opts.userMessage }]
  if (opts.images && opts.images.length > 0) {
    for (const img of opts.images) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } })
    }
  }

  // deno-lint-ignore no-explicit-any
  const body: any = {
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: 32768,
    },
  }
  if (opts.jsonMode) {
    body.generationConfig.responseMimeType = 'application/json'
  }

  try {
    return await attemptGeminiModel(primaryModel, body)
  } catch (err) {
    // pro 모델이 재시도 모두 실패 시 flash로 폴백
    if (primaryModel === 'gemini-2.5-pro') {
      console.warn(`Gemini pro 실패, flash로 폴백. 원인: ${err instanceof Error ? err.message : String(err)}`)
      return await attemptGeminiModel('gemini-2.5-flash', body)
    }
    throw err
  }
}

// ============================================================
// 상태 머신 핸들러
// ============================================================

// deno-lint-ignore no-explicit-any
type Mission = any
// deno-lint-ignore no-explicit-any
type SbClient = any

/**
 * 활성 참고 이미지를 Storage에서 다운로드 → base64로 반환.
 * 실패한 항목은 skip하고 로그만.
 */
async function loadAgentImages(supabase: SbClient, agentId: string): Promise<InlineImage[]> {
  const { data: refs } = await supabase
    .from('agent_visual_references')
    .select('storage_path, mime_type')
    .eq('agent_id', agentId)
    .eq('active', true)
    .limit(5) // 안전 한도
  if (!refs || refs.length === 0) return []

  const out: InlineImage[] = []
  for (const r of refs) {
    try {
      const dl = await supabase.storage.from('agent-references').download(r.storage_path)
      if (dl.error || !dl.data) {
        console.warn(`이미지 다운로드 실패 ${r.storage_path}:`, dl.error?.message)
        continue
      }
      const buf = await dl.data.arrayBuffer()
      const base64 = bytesToBase64(new Uint8Array(buf))
      out.push({ mimeType: r.mime_type, base64 })
    } catch (e) {
      console.warn(`이미지 처리 예외 ${r.storage_path}:`, e)
    }
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function loadAgentPrompt(supabase: SbClient, agentId: string): Promise<string> {
  const [
    { data: agent },
    { data: wisdoms },
    { data: knowledge },
    { data: examples },
    { data: designSystems },
  ] = await Promise.all([
    supabase.from('agents').select('system_prompt').eq('id', agentId).single(),
    supabase
      .from('wisdom_principles')
      .select('title, description')
      .contains('applies_to', [agentId])
      .eq('active', true),
    supabase
      .from('agent_knowledge')
      .select('title, content, source')
      .eq('agent_id', agentId)
      .eq('active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('agent_examples')
      .select('label, input, output')
      .eq('agent_id', agentId)
      .eq('active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('agent_design_systems')
      .select('name, description, tokens, components, principles')
      .eq('agent_id', agentId)
      .eq('active', true)
      .limit(1),
  ])

  let prompt = agent?.system_prompt ?? ''

  if (wisdoms && wisdoms.length > 0) {
    prompt += '\n\n# 적용 가능한 인공 지혜 (Learned Principles)\n'
    for (const w of wisdoms) {
      prompt += `- **${w.title}**: ${w.description}\n`
    }
  }

  if (knowledge && knowledge.length > 0) {
    prompt += '\n\n# 학습 자료 (Knowledge Base)\n'
    for (const k of knowledge) {
      prompt += `\n## ${k.title}${k.source ? ` _(출처: ${k.source})_` : ''}\n${k.content}\n`
    }
  }

  if (examples && examples.length > 0) {
    prompt += '\n\n# 예시 (Few-shot Examples)\n'
    for (const ex of examples) {
      prompt += `\n### ${ex.label ?? '예시'}\n`
      prompt += `**입력:**\n${ex.input}\n\n`
      prompt += `**기대 출력:**\n${ex.output}\n`
    }
  }

  if (designSystems && designSystems.length > 0) {
    const ds = designSystems[0]
    prompt += `\n\n# 적용할 디자인 시스템: ${ds.name}\n`
    if (ds.description) prompt += `_${ds.description}_\n`
    prompt += '\n## 토큰\n```json\n' + JSON.stringify(ds.tokens, null, 2) + '\n```\n'
    if (Array.isArray(ds.components) && ds.components.length > 0) {
      prompt += '\n## 컴포넌트 카탈로그\n```json\n' + JSON.stringify(ds.components, null, 2) + '\n```\n'
    }
    if (ds.principles) prompt += '\n## 원칙·금기사항\n' + ds.principles + '\n'
    prompt += '\n⚠️ **이 디자인 시스템의 토큰을 정확히 따르세요.** 임의의 hex 색상·폰트·간격 값을 만들지 말고 위 정의된 값만 사용. 부득이하게 시스템에 없는 값을 써야 한다면 그 사유를 응답에 명시.\n'
  }

  // 참고 이미지 안내 (실제 이미지는 user prompt parts에 inline_data로 첨부됨)
  const { count: imgCount } = await supabase
    .from('agent_visual_references')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('active', true)
  if ((imgCount ?? 0) > 0) {
    prompt += `\n\n# 참고 이미지 (Visual References)\n메시지에 ${imgCount}장의 이미지가 첨부되어 있습니다. 이 이미지들의 디자인 톤·레이아웃·컴포넌트 패턴·색감을 우선 참고하여 산출물에 반영하세요. 텍스트 설명과 이미지 사이에 모순이 있다면 이미지를 우선합니다.\n`
  }

  return prompt
}

// ============================================================
// 디자인 시스템 자동 검증 (Phase 17)
// ============================================================

interface DesignValidationIssue {
  type: 'unknown_color' | 'unknown_font'
  value: string
  context: string
}

/** HTML/CSS에서 hex 색상과 font-family 추출 */
function extractColorsAndFonts(html: string): { colors: Set<string>; fonts: Set<string> } {
  const colors = new Set<string>()
  const fonts = new Set<string>()
  // hex 색상 (3·4·6·8자리)
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g
  let m: RegExpExecArray | null
  while ((m = hexRe.exec(html)) !== null) {
    colors.add(m[0].toLowerCase())
  }
  // font-family 또는 inline style의 font-family
  const fontRe = /font-family\s*:\s*([^;"']+)/gi
  while ((m = fontRe.exec(html)) !== null) {
    const f = m[1].split(',')[0].trim().replace(/["']/g, '')
    if (f) fonts.add(f.toLowerCase())
  }
  return { colors, fonts }
}

/** 디자인 시스템 tokens에서 허용된 색상·폰트 집합 추출 */
function extractAllowedColorsAndFonts(
  // deno-lint-ignore no-explicit-any
  tokens: any,
): { colors: Set<string>; fonts: Set<string> } {
  const colors = new Set<string>()
  const fonts = new Set<string>()
  const walk = (obj: unknown, into: 'color' | 'font' | 'any') => {
    if (typeof obj === 'string') {
      if ((into === 'color' || into === 'any') && /^#[0-9a-fA-F]{3,8}$/.test(obj)) {
        colors.add(obj.toLowerCase())
      }
      if ((into === 'font' || into === 'any') && /^[A-Za-z]/.test(obj)) {
        fonts.add(obj.toLowerCase().split(',')[0].trim())
      }
      return
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'colors' || k === 'color' || k === 'palette') walk(v, 'color')
        else if (k === 'typography' || k === 'fonts' || k === 'fontFamily') walk(v, 'font')
        else walk(v, into === 'any' ? 'any' : into)
      }
    }
  }
  walk(tokens ?? {}, 'any')
  return { colors, fonts }
}

/**
 * 조이가 만든 HTML(또는 다른 산출물)이 활성 디자인 시스템 토큰을 준수했는지 검증.
 * 시스템에 없는 hex 색상·폰트를 사용하면 이슈로 반환.
 */
async function validateAgainstDesignSystem(
  supabase: SbClient,
  agentId: string,
  html: string,
): Promise<DesignValidationIssue[]> {
  const { data: dsRows } = await supabase
    .from('agent_design_systems')
    .select('tokens')
    .eq('agent_id', agentId)
    .eq('active', true)
    .limit(1)
  if (!dsRows || dsRows.length === 0) return []
  const allowed = extractAllowedColorsAndFonts(dsRows[0].tokens)
  if (allowed.colors.size === 0 && allowed.fonts.size === 0) return []

  const used = extractColorsAndFonts(html)
  const issues: DesignValidationIssue[] = []
  if (allowed.colors.size > 0) {
    for (const c of used.colors) {
      if (!allowed.colors.has(c)) {
        issues.push({ type: 'unknown_color', value: c, context: '디자인 시스템에 없는 색상' })
      }
    }
  }
  if (allowed.fonts.size > 0) {
    for (const f of used.fonts) {
      if (!allowed.fonts.has(f)) {
        issues.push({ type: 'unknown_font', value: f, context: '디자인 시스템에 없는 폰트' })
      }
    }
  }
  return issues
}

// ============================================================
// 하위 에이전트 병렬 실행 (Phase 13)
// ============================================================

interface SubAgentOutput {
  agentId: string
  agentName: string
  // deno-lint-ignore no-explicit-any
  parsed: any
  raw: string
}

/**
 * 주어진 부모 에이전트의 모든 하위 에이전트를 병렬로 실행하고
 * 결과를 messages·diaries에 기록한 뒤 배열로 돌려준다.
 * 부모 핸들러는 이 결과를 자신의 user prompt에 컨텍스트로 첨부.
 */
async function runSubAgents(
  supabase: SbClient,
  parentId: string,
  mission: Mission,
  userPromptForSub: string,
): Promise<SubAgentOutput[]> {
  const { data: subs } = await supabase
    .from('agents')
    .select('id, name, model')
    .eq('parent_agent_id', parentId)
    .order('id', { ascending: true })

  if (!subs || subs.length === 0) return []

  // deno-lint-ignore no-explicit-any
  const runOne = async (sub: any): Promise<SubAgentOutput> => {
    const systemPrompt = await loadAgentPrompt(supabase, sub.id)
    const images = await loadAgentImages(supabase, sub.id)
    const raw = await callGemini({
      systemPrompt,
      userMessage: userPromptForSub,
      images,
      model: sub.model ?? 'gemini-2.5-flash',
      temperature: 0.6,
      jsonMode: true,
    })
    const parsed = parseLooseJson(raw) ?? { error: 'parse_failed', raw }
    return { agentId: sub.id, agentName: sub.name, parsed, raw }
  }

  const results = await Promise.all(subs.map(runOne))

  // 각 하위 결과를 mission 메시지로 기록 (디렉터가 진행 흐름 추적 가능)
  for (const r of results) {
    await supabase.from('messages').insert({
      mission_id: mission.id,
      sender: r.agentId,
      recipient: parentId,
      cc: ['director'],
      re: `${r.agentName} → ${parentId} 사전조사 결과`,
      type: 'StatusUpdate',
      content: '```json\n' + JSON.stringify(r.parsed, null, 2) + '\n```',
      metadata: { sub_agent_for: parentId, parsed: r.parsed },
    })

    if (r.parsed?.diary) {
      await supabase.from('diaries').insert({
        mission_id: mission.id,
        agent_id: r.agentId,
        context_label: `${parentId} 사전조사`,
        difficulty: r.parsed.diary.difficulty ?? null,
        insight: r.parsed.diary.insight ?? null,
        next_try: r.parsed.diary.next_try ?? null,
      })
    }
  }

  return results
}

/** 하위 결과들을 부모 user prompt에 첨부할 텍스트로 직렬화 */
function formatSubAgentContext(results: SubAgentOutput[]): string {
  if (results.length === 0) return ''
  let out = '\n\n# 하위팀 사전조사 결과 (당신은 이 결과를 종합하는 조정자입니다)\n'
  for (const r of results) {
    out += `\n## ${r.agentName} (${r.agentId})\n`
    out += '```json\n' + JSON.stringify(r.parsed, null, 2) + '\n```\n'
  }
  out += `\n## ⚠️ 종합 전 필수 단계 — 교차 검증 (Cross-check)
하위 결과를 그대로 합치지 말고, **먼저 다음을 점검**한 다음 종합하세요:

1. **모순 (Contradictions)**: 두 하위 결과가 같은 사실에 대해 다른 주장을 하지 않는가? 다르다면 어느 쪽 근거가 더 강한지 판단.
2. **공백 (Gaps)**: 양쪽 모두 다루지 않은 영역은 무엇인가? 그것이 의사결정에 치명적이면 명시.
3. **불일치한 신뢰도**: 한쪽이 "high confidence"라 한 것을 다른 쪽이 우회 부정하면 confidence를 낮춰 반영.
4. **할루시네이션 의심**: 한쪽만 주장하고 다른 쪽이 침묵하는 핵심 사실은 검증되지 않은 것으로 간주하고 (추정) 태그.

위 4가지를 거친 다음에 당신의 산출물을 작성하세요. 하위팀이 제시한 데이터 공백·신호·플로우를 무시하지 마세요.

⚠️ 가능하면 당신의 출력 JSON 최상위에 \`cross_check\` 필드를 포함하여 위 점검 결과를 1~3줄로 기록하세요 (스키마에 없어도 추가 가능).`
  return out
}

/** 커스텀 에이전트도 호출 가능하도록 fallback config 생성 */
// deno-lint-ignore no-explicit-any
async function resolveSpecialistConfig(supabase: SbClient, specialistId: string): Promise<any> {
  // 빌트인 우선
  if (SPECIALIST_CONFIG[specialistId]) return SPECIALIST_CONFIG[specialistId]

  // DB에서 커스텀 에이전트 메타 조회
  const { data } = await supabase
    .from('agents')
    .select('name, role, model, deliverable_type, is_custom')
    .eq('id', specialistId)
    .single()
  if (!data) return null

  return {
    label: data.name ?? specialistId,
    deliverableType: 'custom_report',
    customDeliverableTag: data.deliverable_type ?? null,
    model: data.model ?? 'gemini-2.5-flash',
    needsBlueprint: false,
    needsDesigns: false,
  }
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

  // === Phase 13: 하위팀(lumi_data, lumi_scout) 먼저 병렬 실행 ===
  const subUserPrompt = `[루미(상위 조정자)로부터 사전조사 요청]

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}
${mission.context ? `- 컨텍스트: ${mission.context}` : ''}

당신의 전문 영역에 해당하는 자료를 시스템 프롬프트에 명시된 JSON 형식으로만 응답하세요.`
  const subResults = await runSubAgents(supabase, 'lumi', mission, subUserPrompt)
  const subContext = formatSubAgentContext(subResults)

  const userPrompt = `[자비스로부터 미션을 받았습니다]

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}
${mission.context ? `- 컨텍스트: ${mission.context}` : ''}
${subContext}

위 미션과 하위팀 결과를 바탕으로 Opportunity Map v1.0을 작성하세요.

⚠️ 출력 형식 — JSON으로만 응답하세요. 마크다운·설명 없이 순수 JSON:

{
  "tldr": "디렉터가 3초 안에 핵심을 파악할 수 있는 2~3문장 요약 (한국어). 가장 매력적인 후보 1~2개와 그 이유를 함축적으로.",
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
  const joiImages = await loadAgentImages(supabase, 'joi')

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

  // === Phase 14: 조이 하위팀(joi_palette, joi_type) 먼저 병렬 실행 ===
  const joiSubUserPrompt = `[조이(상위 조정자)로부터 비주얼 시스템 사전 정의 요청]

Blueprint 데이터 (JSON):
${JSON.stringify(blueprint.data, null, 2)}

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}

당신의 전문 영역에 해당하는 비주얼 시스템을 시스템 프롬프트에 명시된 JSON 형식으로만 응답하세요.`
  const joiSubResults = await runSubAgents(supabase, 'joi', mission, joiSubUserPrompt)
  const joiSubContext = formatSubAgentContext(joiSubResults)

  const userPrompt = `[아키의 Product Blueprint를 받아 시각 시안을 작성합니다]

Blueprint 데이터 (JSON):
${JSON.stringify(blueprint.data, null, 2)}

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}
${joiSubContext}

위 Blueprint와 하위팀이 정의한 비주얼 시스템(팔레트·타이포·간격)을 일관되게 적용하여
P0 기능 중 핵심 3~5개 화면을 HTML+TailwindCSS 코드로 작성하세요.
지정된 JSON 형식으로만 응답.${reviseContext}`

  const joiResponse = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    images: joiImages,
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

  // === Phase 17: 디자인 시스템 자동 검증 ===
  try {
    // deno-lint-ignore no-explicit-any
    const allHtml = (designs.screens ?? []).map((s: any) => s.html ?? s.html_tailwind ?? '').join('\n')
    if (allHtml) {
      const issues = await validateAgainstDesignSystem(supabase, 'joi', allHtml)
      if (issues.length > 0) {
        const issueLines = issues
          .slice(0, 20)
          .map((i) => `- ${i.type === 'unknown_color' ? '🎨 색상' : '✏️ 폰트'} \`${i.value}\` — ${i.context}`)
          .join('\n')
        const more = issues.length > 20 ? `\n\n_(외 ${issues.length - 20}건 생략)_` : ''
        await supabase.from('messages').insert({
          mission_id: mission.id,
          sender: 'system',
          recipient: 'director',
          re: '⚠️ 디자인 시스템 검증 결과',
          type: 'StatusUpdate',
          content: `**조이 시안에서 디자인 시스템에 없는 토큰이 ${issues.length}건 발견되었습니다.**\n\n${issueLines}${more}\n\n_필요시 조이에게 "디자인 시스템 준수해서 다시" 식으로 재작성 요청하실 수 있어요._`,
          metadata: { kind: 'design_validation', issues },
        })
      }
    }
  } catch (e) {
    console.error('design validation failed:', e)
  }

  await supabase.from('missions').update({
    current_state: 'WAITING_CP3',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'WAITING_CP3'
}

// ============================================================
// 이지(IzZy) — 물리 제품 산업디자인 (Phase 25)
// ============================================================

async function handleIzzyDesigning(supabase: SbClient, mission: Mission): Promise<string> {
  const systemPrompt = await loadAgentPrompt(supabase, 'izzy')
  const izzyImages = await loadAgentImages(supabase, 'izzy')

  const blueprint = await getLatestDeliverable(supabase, mission.id, 'product_blueprint')
  if (!blueprint) {
    throw new Error('Product Blueprint not found for IzZy')
  }

  // 수정 요청 컨텍스트
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
      reviseContext = `\n\n[디렉터의 수정 요청]\n${lastRevise.content}\n\n위 수정 요청을 반영하여 새 컨셉을 작성하세요.`
    }
  }

  const userPrompt = `[아키의 Product Blueprint를 받아 물리 제품의 산업디자인을 작성합니다]

Blueprint 데이터 (JSON):
${JSON.stringify(blueprint.data, null, 2)}

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}

이 제품은 물리적으로 양산될 가전·IoT·액세서리입니다. 외관·소재·치수·인터랙션 요소를 구체적으로 정의하세요.
3가지 컨셉을 서로 다른 방향(예: 미니멀·친근·산업적)으로 제시하고, 디자이너가 그대로 Midjourney나 CAD에서 시작할 수 있는 수준의 명세를 작성.

⚠️ 출력 형식 — JSON으로만 응답. 시스템 프롬프트에 정의된 스키마(design_intent, concepts[], rendering_brief_en 등) 그대로.${reviseContext}`

  const izzyResponse = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    images: izzyImages,
    model: 'gemini-2.5-pro',
    temperature: 0.7,
    jsonMode: true,
  })

  // deno-lint-ignore no-explicit-any
  let parsed: any = parseLooseJson(izzyResponse)
  if (!parsed) {
    console.error('IzZy JSON parse failed. Raw:', izzyResponse.slice(0, 500))
    parsed = { error: 'parse_failed', raw: izzyResponse }
  }

  // Phase 26: 각 컨셉을 Imagen 3로 자동 시각화 (실패해도 전체 진행은 계속)
  // deno-lint-ignore no-explicit-any
  if (Array.isArray(parsed.concepts)) {
    await Promise.all(
      // deno-lint-ignore no-explicit-any
      parsed.concepts.map(async (c: any, idx: number) => {
        const prompt = c.rendering_brief_en
        if (!prompt || typeof prompt !== 'string') return
        const img = await callImagen(prompt)
        if (!img) return
        const safeLabel = (c.name ?? `concept-${idx}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || `c${idx}`
        const path = await uploadGeneratedImage(supabase, mission.id, img.base64, img.mimeType, safeLabel)
        if (path) c.image_storage_path = path
      }),
    )
  }

  const md = renderIndustrialDesignMarkdown(parsed)

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'izzy',
    recipient: 'director',
    cc: ['aki'],
    re: 'Industrial Design v1.0 — 제출',
    type: 'Deliverable',
    content: md,
    metadata: { format: 'industrial_design', parsed },
  })

  await supabase.from('deliverables').insert({
    mission_id: mission.id,
    type: 'industrial_design',
    version: 'v1.0',
    data: parsed,
    raw_markdown: md,
    created_by: 'izzy',
    status: 'pending',
  })

  if (parsed.diary) {
    await supabase.from('diaries').insert({
      mission_id: mission.id,
      agent_id: 'izzy',
      context_label: 'IzZy Industrial Design v1.0',
      difficulty: parsed.diary.difficulty,
      insight: parsed.diary.insight,
      next_try: parsed.diary.next_try,
    })
  }

  await supabase.from('missions').update({
    current_state: 'WAITING_CP3',
    updated_at: new Date().toISOString(),
  }).eq('id', mission.id)

  return 'WAITING_CP3'
}

// deno-lint-ignore no-explicit-any
function renderIndustrialDesignMarkdown(d: any): string {
  if (d.error) return `(파싱 실패)\n\n${d.raw ?? ''}`
  let md = `## Industrial Design v1.0\n\n`
  if (d.design_intent) md += `**디자인 의도**\n${d.design_intent}\n\n`
  const concepts = Array.isArray(d.concepts) ? d.concepts : []
  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i]
    md += `\n### 컨셉 #${i + 1}: ${c.name ?? ''}\n`
    if (c.tagline) md += `_${c.tagline}_\n\n`
    if (c.form_factor) md += `**형태/치수:** ${c.form_factor}\n\n`
    if (Array.isArray(c.materials) && c.materials.length > 0) {
      md += `**소재**\n`
      // deno-lint-ignore no-explicit-any
      for (const m of c.materials as any[]) {
        md += `- ${m.part}: ${m.material} (${m.finish})\n`
      }
      md += '\n'
    }
    if (Array.isArray(c.colors) && c.colors.length > 0) {
      md += `**색상**\n`
      // deno-lint-ignore no-explicit-any
      for (const col of c.colors as any[]) {
        md += `- ${col.name} \`${col.hex}\` — ${col.rationale}\n`
      }
      md += '\n'
    }
    if (Array.isArray(c.interaction_elements) && c.interaction_elements.length > 0) {
      md += `**인터랙션 요소**\n`
      // deno-lint-ignore no-explicit-any
      for (const ie of c.interaction_elements as any[]) {
        md += `- ${ie.type} @ ${ie.location}: ${ie.behavior}\n`
      }
      md += '\n'
    }
    if (c.ergonomics) md += `**에르고노믹스:** ${c.ergonomics}\n\n`
    if (c.reference_aesthetic) md += `**레퍼런스:** ${c.reference_aesthetic}\n\n`
    if (c.rendering_brief_en) md += `**Midjourney/Imagen 프롬프트 (영문):**\n\`\`\`\n${c.rendering_brief_en}\n\`\`\`\n\n`
  }
  if (typeof d.recommended_concept_index === 'number') {
    md += `\n👉 **추천 컨셉**: #${d.recommended_concept_index + 1}\n\n`
  }
  if (Array.isArray(d.common_principles) && d.common_principles.length > 0) {
    md += `\n### 공통 원칙\n`
    for (const p of d.common_principles) md += `- ${p}\n`
  }
  if (d.diary) {
    md += `\n### 회고\n- 난점: ${d.diary.difficulty}\n- 깨달음: ${d.diary.insight}\n- 다음에: ${d.diary.next_try}\n`
  }
  return md
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

  // === Phase 13: 아키 하위팀(aki_ia, aki_flow) 먼저 병렬 실행 ===
  const subUserPrompt = `[아키(상위 조정자)로부터 사전 설계 요청]

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}

선택된 후보:
${JSON.stringify(selected, null, 2)}

당신의 전문 영역에 해당하는 설계안을 시스템 프롬프트에 명시된 JSON 형식으로만 응답하세요.`
  const subResults = await runSubAgents(supabase, 'aki', mission, subUserPrompt)
  const subContext = formatSubAgentContext(subResults)

  const userPrompt = `[디렉터가 후보 #${selected.number} "${selected.name}" 을 선택했습니다]

선택된 후보 상세:
${JSON.stringify(selected, null, 2)}

미션 헌장:
- 도메인: ${mission.domain}
- 임무: ${mission.charter}
${subContext}

위 후보와 하위팀 사전 설계를 바탕으로 Product Blueprint v1.0으로 종합하세요.

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
  wordy: {
    label: 'UX 라이팅 검수',
    deliverableType: 'custom_report',
    model: 'gemini-2.5-flash',
    needsBlueprint: false,
    needsDesigns: true,
  },
  // Phase 25: 물리 제품 specialists
  meka: {
    label: '하드웨어 엔지니어링',
    deliverableType: 'mechanical_spec',
    model: 'gemini-2.5-pro',
    needsBlueprint: true,
    needsDesigns: false,
  },
  forge: {
    label: '제조성·코스트',
    deliverableType: 'cost_estimate',
    model: 'gemini-2.5-flash',
    needsBlueprint: true,
    needsDesigns: false,
  },
  pako: {
    label: '패키징·언박싱',
    deliverableType: 'packaging_spec',
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
  const config = await resolveSpecialistConfig(supabase, specialistId)
  if (!config) throw new Error(`Unknown specialist: ${specialistId}`)

  const systemPrompt = await loadAgentPrompt(supabase, specialistId)

  // === Phase 24-A1: 디렉터의 가장 최근 명령(메시지) 가져오기 ===
  // TO=specialistId 또는 CC에 specialistId가 포함된 가장 최근 director 메시지
  const { data: directorMsgs } = await supabase
    .from('messages')
    .select('content, recipient, cc, created_at')
    .eq('mission_id', mission.id)
    .eq('sender', 'director')
    .order('created_at', { ascending: false })
    .limit(10)
  // deno-lint-ignore no-explicit-any
  const directorInstruction = (directorMsgs ?? []).find((m: any) =>
    m.recipient === specialistId ||
    (Array.isArray(m.cc) && m.cc.includes(specialistId))
  )?.content ?? null

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

  // === Phase 14: specialist 하위팀이 있으면 먼저 병렬 실행 ===
  const specSubUserPrompt = `[${config.label}(상위 조정자)로부터 전문 영역 사전 분석 요청]
${contextParts}

당신의 전문 영역에 해당하는 부분을 시스템 프롬프트에 명시된 JSON 형식으로만 응답하세요.`
  const specSubResults = await runSubAgents(supabase, specialistId, mission, specSubUserPrompt)
  const specSubContext = formatSubAgentContext(specSubResults)

  const directorBlock = directorInstruction
    ? `\n\n[디렉터의 직접 지시 — 최우선 반영]\n"${directorInstruction}"\n`
    : ''
  const userPrompt = `${contextParts}${specSubContext}${directorBlock}\n\n위 정보를 바탕으로 당신의 전문 영역 보고서를 작성하세요.${directorInstruction ? ' 디렉터의 직접 지시가 있다면 그 의도에 맞춰 검수 범위·관점을 조정.' : ''} 하위팀이 있다면 그 결과를 종합·교차검증하여 반영. 시스템 프롬프트에 정의된 JSON 형식으로만 응답.`

  const specImages = await loadAgentImages(supabase, specialistId)
  const response = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    images: specImages,
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

  const md = renderSpecialistMarkdown(specialistId, parsed, config)

  // 메시지 저장
  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: specialistId,
    recipient: 'director',
    re: `${config.label} 보고서`,
    type: 'Deliverable',
    content: md,
    metadata: {
      format: config.deliverableType,
      custom_tag: config.customDeliverableTag ?? null,
      parsed,
    },
  })

  // 산출물 저장
  await supabase.from('deliverables').insert({
    mission_id: mission.id,
    type: config.deliverableType,
    version: 'v1.0',
    data: parsed,
    raw_markdown: md,
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
function renderSpecialistMarkdown(specialistId: string, parsed: any, configArg?: any): string {
  if (parsed.error) return `(파싱 실패)\n\n${parsed.raw ?? ''}`
  const config = configArg ?? SPECIALIST_CONFIG[specialistId] ?? { label: specialistId }
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

  // Phase 24-B1: 반려 = 시안 폐기·조이 처음부터 다시
  if (decision === 'reject') {
    // 기존 screen_designs deliverable을 'rejected' 상태로 마킹 (데이터는 보존)
    await supabase
      .from('deliverables')
      .update({ status: 'rejected' })
      .eq('mission_id', mission.id)
      .eq('type', 'screen_designs')

    await supabase.from('messages').insert({
      mission_id: mission.id,
      sender: 'director',
      type: 'Reject',
      re: 'CP3 — 시안 반려',
      content: comments
        ? `시안 반려 — 조이가 처음부터 다시 작업합니다.\n\n반려 사유:\n${comments}`
        : '시안 반려 — 조이가 처음부터 다시 작업합니다.',
    })
    // JOI_DESIGNING으로 되돌림 (REVISING이 아니라 처음부터)
    await supabase.from('missions').update({
      current_state: 'JOI_DESIGNING',
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)
    return 'JOI_DESIGNING'
  }

  // Phase 24-B1: 취소 = 이 단계까지 모으고 미션 종료 (이미 만든 산출물은 보존)
  if (decision === 'cancel') {
    await supabase.from('messages').insert({
      mission_id: mission.id,
      sender: 'director',
      type: 'UserInput',
      re: 'CP3 — 미션 종료(취소)',
      content: comments
        ? `이 단계까지의 산출물을 보존하고 미션을 종료합니다.\n\n사유:\n${comments}`
        : '이 단계까지의 산출물을 보존하고 미션을 종료합니다.',
    })
    await supabase.from('missions').update({
      current_state: 'COMPLETED',
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', mission.id)
    return 'COMPLETED'
  }

  throw new Error(`알 수 없는 decision: ${decision}`)
}

// ============================================================
// 슬라이드 변환 (Phase 18) — Opportunity Map을 슬라이드 deck으로
// ============================================================

async function handleGenerateSlides(
  supabase: SbClient,
  mission: Mission,
): Promise<{ deliverable_id?: string; note?: string }> {
  const oppMap = await getLatestDeliverable(supabase, mission.id, 'opportunity_map')
  if (!oppMap) {
    throw new Error('Opportunity Map이 없습니다. 먼저 루미 단계를 완료하세요.')
  }

  const systemPrompt = await loadAgentPrompt(supabase, 'lumi')

  const userPrompt = `[디렉터가 현재 Opportunity Map을 슬라이드 발표 자료로 변환 요청했습니다]

원본 Opportunity Map JSON:
${JSON.stringify(oppMap.data, null, 2)}

위 내용을 임원/투자자 대상 발표용 슬라이드 deck으로 재구성하세요. 디자이너가 화면에서 좌우로 넘기며 보고, 필요시 인쇄해서 PDF로 export할 형식입니다.

⚠️ 출력 형식 — JSON only:
{
  "title": "deck 전체 제목",
  "subtitle": "한 문장 부제",
  "slides": [
    {
      "title": "슬라이드 제목",
      "layout": "title | bullets | two_column | quote | metrics | comparison",
      "content": {
        "headline": "큰 글씨로 강조할 메시지 (있다면)",
        "bullets": ["불릿 1", "불릿 2"],
        "left": "two_column 왼쪽",
        "right": "two_column 오른쪽",
        "quote": "인용문 (있다면)",
        "metrics": [{ "label": "지표명", "value": "값", "note": "보조 설명" }],
        "compare": [{ "name": "항목명", "items": ["속성 1", "속성 2"] }]
      },
      "speaker_notes": "발표자 노트 (스크린에는 안 보임)"
    }
  ]
}

가이드라인:
- 8~12장 권장. 너무 길게 X.
- 첫 슬라이드는 layout="title"로 제품 컨셉을 한 줄로
- TL;DR 슬라이드 → 5개 후보 비교(layout="comparison") → 추천 후보 1~2개 심화(layout="bullets" 또는 "metrics") → 데이터 공백·다음 액션(layout="bullets")
- 각 슬라이드 텍스트는 짧고 발표 가능한 형태 (긴 문단 X)
- speaker_notes는 발표자가 말로 풀어줄 내용`

  const raw = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-pro',
    temperature: 0.5,
    jsonMode: true,
  })

  // deno-lint-ignore no-explicit-any
  const parsed: any = parseLooseJson(raw) ?? { error: 'parse_failed', raw }
  if (parsed.error) {
    throw new Error('슬라이드 JSON 파싱 실패')
  }

  const md = `## 📊 ${parsed.title ?? '슬라이드 deck'}\n_슬라이드 ${parsed.slides?.length ?? 0}장이 생성되었습니다. 채팅의 "슬라이드 보기" 버튼을 눌러 확인하세요._`

  const { data: ins } = await supabase
    .from('deliverables')
    .insert({
      mission_id: mission.id,
      type: 'slide_deck',
      version: 'v1.0',
      data: parsed,
      raw_markdown: md,
      created_by: 'lumi',
      status: 'final',
    })
    .select('id')
    .single()

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'lumi',
    recipient: 'director',
    re: `슬라이드 deck — ${parsed.title ?? 'Opportunity Map'}`,
    type: 'Deliverable',
    content: md,
    metadata: { format: 'slide_deck', parsed, deliverable_id: (ins as { id?: string } | null)?.id },
  })

  return { deliverable_id: (ins as { id?: string } | null)?.id, note: '슬라이드 생성 완료' }
}

// ============================================================
// 시안 부분 수정 (Phase 19-C)
// ============================================================

/** 가장 최근 screen_designs deliverable 가져오기. update 시 새 row 만들지 않고 in-place update */
async function loadLatestScreenDesigns(supabase: SbClient, missionId: string) {
  const { data } = await supabase
    .from('deliverables')
    .select('*')
    .eq('mission_id', missionId)
    .eq('type', 'screen_designs')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

async function saveScreenDesignsUpdate(
  supabase: SbClient,
  deliverableId: string,
  // deno-lint-ignore no-explicit-any
  newData: any,
) {
  await supabase.from('deliverables').update({ data: newData }).eq('id', deliverableId)
}

// deno-lint-ignore no-explicit-any
async function handleRegenerateScreen(supabase: SbClient, mission: Mission, body: any) {
  const idx = body.screen_index
  const instruction: string = body.instruction ?? ''
  if (typeof idx !== 'number') throw new Error('screen_index required')
  const deliverable = await loadLatestScreenDesigns(supabase, mission.id)
  if (!deliverable) throw new Error('screen_designs deliverable not found')
  const data = deliverable.data
  // deno-lint-ignore no-explicit-any
  const screens: any[] = data?.screens ?? []
  if (!screens[idx]) throw new Error(`screen index out of range: ${idx}`)
  const target = screens[idx]

  const blueprint = await getLatestDeliverable(supabase, mission.id, 'product_blueprint')

  const systemPrompt = await loadAgentPrompt(supabase, 'joi')
  const userPrompt = `[단일 화면 재생성 요청]

전체 시안 중 #${idx + 1}번 화면 "${target.name ?? ''}" 만 다시 만들어주세요.
다른 화면은 변경하지 않습니다.

화면 정보:
- 이름: ${target.name}
- 목적: ${target.purpose}
${instruction ? `\n[디렉터 추가 지시]\n${instruction}\n` : ''}

기존 HTML (참고용 — 개선해서 다시 작성):
\`\`\`html
${target.html ?? target.html_tailwind ?? ''}
\`\`\`

Blueprint 데이터:
${blueprint ? JSON.stringify(blueprint.data, null, 2).slice(0, 4000) : '없음'}

⚠️ 출력 형식 — JSON only. 이 한 화면의 새 정보:
{
  "name": "화면 이름",
  "purpose": "목적",
  "html": "HTML+TailwindCSS 코드 (body 안 들어갈 마크업만)",
  "design_notes": "변경 사항 요약"
}`

  const joiImages = await loadAgentImages(supabase, 'joi')
  const raw = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    images: joiImages,
    model: 'gemini-2.5-pro',
    temperature: 0.6,
    jsonMode: true,
  })
  // deno-lint-ignore no-explicit-any
  const parsed: any = parseLooseJson(raw)
  if (!parsed || !parsed.html) throw new Error('재생성 응답 파싱 실패')

  // 해당 인덱스 교체
  screens[idx] = {
    ...target,
    name: parsed.name ?? target.name,
    purpose: parsed.purpose ?? target.purpose,
    html: parsed.html,
    design_notes: parsed.design_notes ?? target.design_notes,
  }
  data.screens = screens
  await saveScreenDesignsUpdate(supabase, deliverable.id, data)

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'joi',
    recipient: 'director',
    re: `화면 재생성: ${target.name}`,
    type: 'StatusUpdate',
    content: `🔄 #${idx + 1}번 "${target.name}" 화면을 재생성했습니다.${instruction ? `\n\n_요청: ${instruction}_` : ''}`,
    metadata: { kind: 'screen_regenerated', screen_index: idx },
  })

  return { note: '화면 재생성 완료', screen_index: idx }
}

// deno-lint-ignore no-explicit-any
async function handlePatchScreen(supabase: SbClient, mission: Mission, body: any) {
  const idx = body.screen_index
  const instruction: string = body.instruction ?? ''
  if (typeof idx !== 'number') throw new Error('screen_index required')
  if (!instruction.trim()) throw new Error('instruction required')

  const deliverable = await loadLatestScreenDesigns(supabase, mission.id)
  if (!deliverable) throw new Error('screen_designs deliverable not found')
  const data = deliverable.data
  // deno-lint-ignore no-explicit-any
  const screens: any[] = data?.screens ?? []
  if (!screens[idx]) throw new Error(`screen index out of range: ${idx}`)
  const target = screens[idx]
  const currentHtml = target.html ?? target.html_tailwind ?? ''

  const systemPrompt = await loadAgentPrompt(supabase, 'joi')
  const userPrompt = `[부분 patch 요청 — 최소한의 변경으로]

화면: ${target.name}
디렉터 지시: ${instruction}

현재 HTML (이 코드를 최소한만 수정):
\`\`\`html
${currentHtml}
\`\`\`

⚠️ 출력 — JSON only:
{
  "html": "수정된 전체 HTML (구조는 최대한 유지, 지시된 부분만 변경)",
  "changes": ["변경 사항 1", "변경 사항 2"]
}`

  const joiImagesPatch = await loadAgentImages(supabase, 'joi')
  const raw = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    images: joiImagesPatch,
    model: 'gemini-2.5-flash',
    temperature: 0.3,
    jsonMode: true,
  })
  // deno-lint-ignore no-explicit-any
  const parsed: any = parseLooseJson(raw)
  if (!parsed || !parsed.html) throw new Error('patch 응답 파싱 실패')

  screens[idx] = { ...target, html: parsed.html }
  data.screens = screens
  await saveScreenDesignsUpdate(supabase, deliverable.id, data)

  const changes = Array.isArray(parsed.changes) ? parsed.changes : []
  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'joi',
    recipient: 'director',
    re: `화면 patch: ${target.name}`,
    type: 'StatusUpdate',
    content: `🎯 #${idx + 1}번 "${target.name}"에 patch 적용했습니다.\n\n_요청:_ ${instruction}${changes.length > 0 ? `\n\n변경 사항:\n${changes.map((c: string) => `- ${c}`).join('\n')}` : ''}`,
    metadata: { kind: 'screen_patched', screen_index: idx },
  })

  return { note: 'patch 완료', screen_index: idx }
}

// Phase 24-B2: 모든 화면에 동일 지시를 일괄 patch
// deno-lint-ignore no-explicit-any
async function handlePatchAllScreens(supabase: SbClient, mission: Mission, body: any) {
  const instruction: string = body.instruction ?? ''
  if (!instruction.trim()) throw new Error('instruction required')

  const deliverable = await loadLatestScreenDesigns(supabase, mission.id)
  if (!deliverable) throw new Error('screen_designs deliverable not found')
  const data = deliverable.data
  // deno-lint-ignore no-explicit-any
  const screens: any[] = data?.screens ?? []
  if (screens.length === 0) return { note: '대상 화면 없음', updated: 0 }

  const systemPrompt = await loadAgentPrompt(supabase, 'joi')
  const joiImages = await loadAgentImages(supabase, 'joi')

  // 각 화면을 병렬로 patch
  // deno-lint-ignore no-explicit-any
  const results = await Promise.all(screens.map(async (target: any, idx: number) => {
    const currentHtml = target.html ?? target.html_tailwind ?? ''
    const userPrompt = `[전체 시안 일괄 patch — ${idx + 1}/${screens.length}번 화면]

화면: ${target.name}
디렉터 지시 (모든 화면에 동일 적용): ${instruction}

현재 HTML (이 코드를 최소한만 수정):
\`\`\`html
${currentHtml}
\`\`\`

⚠️ 출력 — JSON only:
{
  "html": "수정된 전체 HTML (구조 유지, 지시된 부분만 변경)",
  "changes": ["이 화면에서 변경한 내용"]
}`
    try {
      const raw = await callGemini({
        systemPrompt,
        userMessage: userPrompt,
        images: joiImages,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        jsonMode: true,
      })
      // deno-lint-ignore no-explicit-any
      const parsed: any = parseLooseJson(raw)
      if (parsed?.html) {
        return { idx, ok: true, html: parsed.html, changes: parsed.changes ?? [] }
      }
      return { idx, ok: false, error: 'parse_failed' }
    } catch (e) {
      return { idx, ok: false, error: String(e) }
    }
  }))

  // 성공한 화면만 교체
  let updated = 0
  for (const r of results) {
    if (r.ok && r.html) {
      screens[r.idx] = { ...screens[r.idx], html: r.html }
      updated++
    }
  }
  data.screens = screens
  await saveScreenDesignsUpdate(supabase, deliverable.id, data)

  const failedCount = results.filter((r) => !r.ok).length
  const allChanges = results
    .filter((r) => r.ok)
    .flatMap((r, i) => (r.changes ?? []).map((c: string) => `- [${screens[r.idx]?.name ?? '#' + (i + 1)}] ${c}`))

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'joi',
    recipient: 'director',
    re: `전체 시안 일괄 patch (${updated}/${screens.length}개 완료)`,
    type: 'StatusUpdate',
    content: `🎯 전체 시안에 일괄 patch 적용\n\n_지시:_ ${instruction}\n\n결과: ${updated}/${screens.length} 화면 성공${failedCount > 0 ? ` (${failedCount}개 실패)` : ''}${allChanges.length > 0 ? '\n\n주요 변경:\n' + allChanges.slice(0, 20).join('\n') : ''}`,
    metadata: { kind: 'screens_bulk_patched', updated, failed: failedCount },
  })

  return { note: '일괄 patch 완료', updated, failed: failedCount }
}

/** 디렉터가 직접 편집한 HTML을 그대로 저장 (LLM 호출 없음) */
// deno-lint-ignore no-explicit-any
async function handleUpdateScreenHtml(supabase: SbClient, mission: Mission, body: any) {
  const idx = body.screen_index
  const html: string = body.html ?? ''
  if (typeof idx !== 'number') throw new Error('screen_index required')

  const deliverable = await loadLatestScreenDesigns(supabase, mission.id)
  if (!deliverable) throw new Error('screen_designs deliverable not found')
  const data = deliverable.data
  // deno-lint-ignore no-explicit-any
  const screens: any[] = data?.screens ?? []
  if (!screens[idx]) throw new Error(`screen index out of range: ${idx}`)
  screens[idx] = { ...screens[idx], html }
  data.screens = screens
  await saveScreenDesignsUpdate(supabase, deliverable.id, data)

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'director',
    type: 'UserInput',
    re: `화면 직접 편집: ${screens[idx].name ?? ''}`,
    content: `✏️ 디렉터가 #${idx + 1}번 화면 HTML을 직접 편집했습니다.`,
    metadata: { kind: 'screen_html_edited', screen_index: idx },
  })

  return { note: '직접 편집 저장 완료', screen_index: idx }
}

// ============================================================
// 완료 미션 사후 Q&A — COMPLETED/ERROR_STATE에서 디렉터의 사후 질문에 자비스가 답변
// ============================================================

async function handlePostCompletionMessage(
  supabase: SbClient,
  mission: Mission,
): Promise<{ note: string }> {
  // 마지막 메시지가 디렉터의 새 질문일 때만 응답 (중복 응답 방지)
  const { data: lastMsg } = await supabase
    .from('messages')
    .select('*')
    .eq('mission_id', mission.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!lastMsg || lastMsg.sender !== 'director') {
    return { note: '응답할 새 디렉터 메시지 없음' }
  }
  // 그 디렉터 메시지가 자비스로 향한 것이거나 recipient 미지정일 때만
  if (lastMsg.recipient && lastMsg.recipient !== 'jarvis') {
    return { note: `메시지는 ${lastMsg.recipient}에게 향함 — 자비스 답변 skip` }
  }

  // 산출물 메타 + 핵심 데이터 일부도 함께 (실제 내용을 알고 답변할 수 있게)
  const { data: deliverables } = await supabase
    .from('deliverables')
    .select('type, version, status, created_by, data')
    .eq('mission_id', mission.id)
    .order('created_at', { ascending: true })

  // deno-lint-ignore no-explicit-any
  const deliverableContext = (deliverables ?? []).map((d: any) => {
    // 각 산출물의 핵심만 요약 (전체 JSON은 너무 김)
    // deno-lint-ignore no-explicit-any
    const data = (d.data ?? {}) as any
    let summary = ''
    if (d.type === 'opportunity_map') {
      summary = data.tldr ?? data.summary ?? ''
      const cands = Array.isArray(data.candidates) ? data.candidates : []
      if (cands.length > 0) {
        summary += '\n  후보: ' + cands.map((c: { number: number; name: string; total?: number }) => `#${c.number} ${c.name} (${c.total ?? '-'}/20)`).join(', ')
      }
    } else if (d.type === 'product_blueprint') {
      summary = data.concept?.one_liner ?? data.product_name ?? ''
      if (data.persona?.name) summary += `\n  페르소나: ${data.persona.name}`
      const p0 = Array.isArray(data.features?.p0) ? data.features.p0 : []
      if (p0.length > 0) summary += `\n  P0 기능: ${p0.map((f: { name: string }) => f.name).join(', ')}`
    } else if (d.type === 'screen_designs') {
      summary = data.design_intent?.slice(0, 200) ?? ''
      const scrs = Array.isArray(data.screens) ? data.screens : []
      if (scrs.length > 0) summary += `\n  화면: ${scrs.map((s: { name: string }) => s.name).join(', ')}`
    } else if (d.type === 'slide_deck') {
      summary = data.title ?? ''
      const slides = Array.isArray(data.slides) ? data.slides : []
      if (slides.length > 0) summary += ` (${slides.length}장)`
    } else if (d.type === 'custom_report') {
      // 워디(UX 라이팅), 기타 specialist custom_report — audit_summary + improvements 추출
      if (typeof data.audit_summary === 'string') summary = data.audit_summary.slice(0, 300)
      if (typeof data.tone_diagnosis === 'string') {
        summary += '\n  톤 진단: ' + data.tone_diagnosis.slice(0, 200)
      }
      const imps = Array.isArray(data.improvements) ? data.improvements : []
      if (imps.length > 0) {
        summary += `\n  개선안 ${imps.length}건:`
        for (const imp of imps.slice(0, 8)) {
          const loc = imp.location ?? imp.context ?? ''
          summary += `\n    · [${loc}] "${imp.before ?? ''}" → "${imp.after ?? ''}"${imp.rationale ? ` (${imp.rationale})` : ''}`
        }
        if (imps.length > 8) summary += `\n    ...외 ${imps.length - 8}건`
      }
      if (typeof data.consistent_voice_suggestion === 'string') {
        summary += '\n  일관된 보이스 제안: ' + data.consistent_voice_suggestion.slice(0, 200)
      }
    } else if (typeof data.executive_summary === 'string') {
      summary = data.executive_summary.slice(0, 300)
    } else if (typeof data.audit_summary === 'string') {
      summary = data.audit_summary.slice(0, 300)
    } else if (typeof data.summary === 'string') {
      summary = data.summary.slice(0, 300)
    }
    return `- ${d.type} v${d.version} (${d.created_by}, ${d.status})${summary ? '\n  ' + summary : ''}`
  }).join('\n') || '(없음)'

  // specialist 호출 여부 진단 (디렉터 질문이 specialist 관련일 때 정확한 안내 가능)
  // deno-lint-ignore no-explicit-any
  const calledSpecialists = new Set<string>((deliverables ?? []).map((d: any) => d.created_by).filter((c: string) => !['lumi', 'aki', 'joi', 'jarvis', 'director'].includes(c)))
  const KNOWN_SPECIALISTS = [
    { id: 'wordy', name: '워디', area: 'UX 라이팅·마이크로 카피' },
    { id: 'friday', name: '프라이데이', area: '사업화·BM·GTM' },
    { id: 'tars', name: '타스', area: 'React 코드 변환' },
    { id: 'echo', name: '에코', area: '접근성(WCAG) 검수' },
    { id: 'kitt', name: '키트', area: '법무 1차 검토' },
    { id: 'ethica', name: '에씨카', area: '윤리·사회 영향' },
    { id: 'qa_bot', name: 'QA봇', area: '테스트 케이스' },
  ]
  const specialistStatus = KNOWN_SPECIALISTS
    .map((s) => `- ${s.name} (${s.area}): ${calledSpecialists.has(s.id) ? '✓ 이 미션에서 호출됨 (산출물 있음)' : '✗ 호출되지 않음'}`)
    .join('\n')

  const isCompleted = mission.current_state === 'COMPLETED' || mission.current_state === 'ERROR_STATE'

  const systemPrompt = await loadAgentPrompt(supabase, 'jarvis')
  const userPrompt = `[디렉터의 자비스 향한 메시지에 답변]

이 미션과 산출물을 당신은 다 알고 있습니다. 디렉터의 질문/명령에 직접·구체적으로 답하세요.

미션:
- 제목: ${mission.title}
- 도메인: ${mission.domain}
- 임무: ${mission.charter}
${mission.context ? `- 컨텍스트: ${mission.context}` : ''}
- 현재 상태: ${mission.current_state} ${isCompleted ? '(완료된 미션)' : '(진행 중)'}

생성된 산출물과 핵심 내용:
${deliverableContext}

각 specialist의 이 미션 호출 여부 (반드시 확인!):
${specialistStatus}

디렉터의 메시지:
"${lastMsg.content}"

⚠️ 답변 지침:
1. **질문에 직접 답하세요.** 산출물 데이터를 근거로 의견·평가·아이디어·요약을 제공.
2. 위 산출물 정보가 보이면 그 안의 내용을 인용. "산출물에 적용된지 모르겠다" 같은 회피 답변 절대 금지.
3. **specialist 학습 ≠ specialist 호출 — 명확히 구분!**
   - "워디 학습은 되어 있어요" = 에이전트 자체의 페르소나·예시 세팅 (모든 미션에 공통)
   - "워디 호출됨" = 이 미션에서 실제로 워디를 트리거해 검수 산출물을 만든 상태
   - 디렉터가 "워디 결과 반영" 같은 말을 하는데 위 표에서 워디가 ✗ 상태면:
     **"이 미션에서는 워디를 아직 호출하지 않으셔서 검수 결과가 없어요. 지금 호출하려면: ① 메시지 입력란 TO 드롭다운에서 'Wordy (UX 라이팅)' 선택 후 '시안 검수해줘' 보내기, 또는 ② 채팅 하단 '👥 팀원 호출' 패널 펼치고 워디 클릭"** 식으로 명확히 안내
4. 디렉터가 **행동 명령**("다시 만들어줘", "수정해줘", "적용해줘")을 하면:
   - 관련 산출물이 있으면 그 핵심 1~3개 인용 + **구체적 다음 단계** 안내 (디자인 시안 모달 → 화면 단위 patch 등)
   - 자동 트리거는 불가능함을 짧게 알리되, 직접 할 수 있는 경로는 분명히
5. 모르는 건 "산출물에 없어 확신할 수 없어요" 솔직히. 추측은 "(추정)".
6. 한국어, 자연스러운 대화체로 3~7문장. 너무 짧으면 도움 안 됨.`

  const reply = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-flash',
    temperature: 0.7,
  })

  await supabase.from('messages').insert({
    mission_id: mission.id,
    sender: 'jarvis',
    recipient: 'director',
    re: '미션 완료 후 응답',
    type: 'StatusUpdate',
    content: reply,
  })

  return { note: '자비스 응답 완료' }
}

// ============================================================
// 인공 지혜 추출 (글로벌 액션)
// ============================================================

async function handleExtractWisdom(supabase: SbClient): Promise<{
  candidates_created: number
  total_diaries_considered: number
  raw_candidates: number
  note?: string
}> {
  // 1. 최근 다이어리 가져오기
  const { data: diaries } = await supabase
    .from('diaries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  // 2. 이미 source로 사용된 diary ID 추적
  const { data: existingWisdoms } = await supabase
    .from('wisdom_principles')
    .select('source_diary_ids')

  const usedIds = new Set<string>()
  for (const w of existingWisdoms ?? []) {
    for (const id of (w.source_diary_ids ?? [])) usedIds.add(id)
  }

  const newDiaries = (diaries ?? []).filter((d: { id: string }) => !usedIds.has(d.id))

  if (newDiaries.length < 3) {
    return {
      candidates_created: 0,
      total_diaries_considered: newDiaries.length,
      raw_candidates: 0,
      note: '추출에 필요한 신규 다이어리가 부족합니다 (최소 3개)',
    }
  }

  // 3. Jarvis 호출
  const systemPrompt = await loadAgentPrompt(supabase, 'jarvis')
  const userPrompt = `당신은 조직의 지혜 큐레이터입니다. 아래 ${newDiaries.length}개의 에이전트 다이어리를 분석하여, 향후 모든 미션에 적용할 가치가 있는 "인공 지혜 원리(Wisdom Principles)"를 추출하세요.

[다이어리 목록]
${newDiaries.map((d: { id: string; agent_id: string; context_label: string | null; difficulty: string | null; insight: string | null; next_try: string | null }, i: number) => `
${i + 1}. [${d.agent_id}] ${d.context_label ?? ''} (id: ${d.id})
   - 난점: ${d.difficulty ?? '-'}
   - 통찰: ${d.insight ?? '-'}
   - 다음 시도: ${d.next_try ?? '-'}
`).join('\n')}

[출력 형식 — JSON]
{
  "candidates": [
    {
      "title": "원리 제목 (15자 이내, 비유·은유 권장)",
      "description": "원리 설명 (200자 이상): 본질·위반 시 문제·적용 예시 포함",
      "applies_to": ["aki", "lumi"],
      "source_diary_ids": ["UUID", "UUID"],
      "reasoning": "왜 이게 원리인지 (큐레이션용)"
    }
  ]
}

[추출 원칙]
- 2개 이상 다이어리에서 공통 패턴이 보일 때만 원리화
- 너무 일반적인 조언("잘하라", "꼼꼼하게") 금지
- 부정문("X 하지 마라")보다는 긍정문("Y를 추구하라") 선호
- applies_to는 다이어리에 등장한 agent_id만 선택, 또는 명백히 일반화 가능하면 다수 에이전트
- 후보가 없으면 candidates: [] 반환 (강제로 만들지 않음)
- 너무 좁은 1회성 사건은 원리화 부적합`

  const response = await callGemini({
    systemPrompt,
    userMessage: userPrompt,
    model: 'gemini-2.5-pro',
    temperature: 0.4,
    jsonMode: true,
  })

  // deno-lint-ignore no-explicit-any
  const parsed: any = parseLooseJson(response)
  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : []

  let inserted = 0
  for (const c of rawCandidates) {
    if (!c.title || !c.description || !Array.isArray(c.applies_to) || c.applies_to.length === 0) continue
    const sourceIds = Array.isArray(c.source_diary_ids) ? c.source_diary_ids : []
    const { error } = await supabase.from('wisdom_principles').insert({
      title: c.title,
      description: c.description,
      applies_to: c.applies_to,
      source_diary_ids: sourceIds,
      version: 'candidate',
      active: false,
    })
    if (!error) inserted += 1
  }

  return {
    candidates_created: inserted,
    total_diaries_considered: newDiaries.length,
    raw_candidates: rawCandidates.length,
  }
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

    // 글로벌 액션 — mission_id 불필요
    if (action === 'extract_wisdom') {
      const result = await handleExtractWisdom(supabase)
      return jsonResp({ ok: true, ...result }, 200)
    }

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
    } else if (action === 'generate_slides') {
      const result = await handleGenerateSlides(supabase, mission)
      return jsonResp({ ok: true, ...result }, 200)
    } else if (action === 'jarvis_chat') {
      // Phase 24-A3: 어느 상태에서든 디렉터의 일반 메시지에 자비스가 응답
      const r = await handlePostCompletionMessage(supabase, mission)
      return jsonResp({ ok: true, state: mission.current_state, ...r }, 200)
    } else if (action === 'regenerate_screen') {
      const result = await handleRegenerateScreen(supabase, mission, body)
      return jsonResp({ ok: true, ...result }, 200)
    } else if (action === 'patch_screen') {
      const result = await handlePatchScreen(supabase, mission, body)
      return jsonResp({ ok: true, ...result }, 200)
    } else if (action === 'patch_all_screens') {
      const result = await handlePatchAllScreens(supabase, mission, body)
      return jsonResp({ ok: true, ...result }, 200)
    } else if (action === 'update_screen_html') {
      const result = await handleUpdateScreenHtml(supabase, mission, body)
      return jsonResp({ ok: true, ...result }, 200)
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
          // Phase 25: 미션 타입에 따라 조이(UI) 또는 이지(물리 제품) 분기
          if (mission.mission_type === 'physical_product') {
            newState = await handleIzzyDesigning(supabase, mission)
          } else {
            newState = await handleJoiDesigning(supabase, mission)
          }
          break
        case 'WAITING_CP1':
        case 'WAITING_CP2':
        case 'WAITING_CP3':
        case 'COMPLETED':
        case 'ERROR_STATE': {
          // 디렉터의 사후 질문에 자비스가 답변 (미션 상태는 그대로 유지)
          const r = await handlePostCompletionMessage(supabase, mission)
          return jsonResp({ ok: true, state: mission.current_state, ...r }, 200)
        }
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
