import { supabase, SUPABASE_URL } from '@/lib/supabase'

export interface OrchestrateResponse {
  ok: boolean
  mission_id?: string
  new_state?: string
  error?: string
  detail?: string
  note?: string
  state?: string
}

interface OrchestratePayload {
  mission_id: string
  action?:
    | 'cp1' | 'cp2' | 'cp3'
    | 'specialist' | 'generate_slides' | 'jarvis_chat'
    | 'regenerate_screen' | 'patch_screen' | 'update_screen_html'
  selected_candidate_index?: number
  decision?: 'approve' | 'revise' | 'branch'
  comments?: string
  specialist_id?: string
  screen_index?: number
  instruction?: string
  html?: string
}

async function callOrchestrate(payload: OrchestratePayload): Promise<OrchestrateResponse> {
  if (!supabase || !SUPABASE_URL) {
    return { ok: false, error: 'Supabase 미설정' }
  }

  const url = `${SUPABASE_URL}/functions/v1/orchestrate`
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(payload),
    })

    const data = (await response.json()) as OrchestrateResponse
    if (!response.ok) console.error('orchestrate error response:', data)
    return data
  } catch (err) {
    console.error('orchestrate fetch error:', err)
    return { ok: false, error: String(err) }
  }
}

/** 자동 진행 (현재 상태 기반) */
export async function orchestrate(missionId: string): Promise<OrchestrateResponse> {
  return callOrchestrate({ mission_id: missionId })
}

/** CP1 — 후보 선택 */
export async function decideCp1(missionId: string, selectedCandidateIndex: number): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'cp1',
    selected_candidate_index: selectedCandidateIndex,
  })
}

/** CP2 — Blueprint 결정 */
export async function decideCp2(
  missionId: string,
  decision: 'approve' | 'revise' | 'branch',
  comments?: string,
): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'cp2',
    decision,
    comments,
  })
}

/** CP3 — Joi 디자인 시안 결정 */
export async function decideCp3(
  missionId: string,
  decision: 'approve' | 'revise',
  comments?: string,
): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'cp3',
    decision,
    comments,
  })
}

/** Specialist 호출 — 메인 흐름과 별개로 추가 검수 */
export async function invokeSpecialist(
  missionId: string,
  specialistId: string,
): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'specialist',
    specialist_id: specialistId,
  })
}

/** 자비스 대화 응답 (Phase 24-A3) — 워크플로우 진행 없이 디렉터 메시지에 답변만 */
export async function jarvisChat(missionId: string): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'jarvis_chat',
  })
}

/** Opportunity Map을 슬라이드 deck으로 변환 (Phase 18) */
export async function generateSlides(missionId: string): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'generate_slides',
  })
}

/** 단일 화면 재생성 (Phase 19-C) — Gemini Pro 1번 호출 */
export async function regenerateScreen(
  missionId: string,
  screenIndex: number,
  instruction?: string,
): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'regenerate_screen',
    screen_index: screenIndex,
    instruction,
  })
}

/** 자연어 patch (Phase 19-C) — Gemini Flash 1번 호출 */
export async function patchScreen(
  missionId: string,
  screenIndex: number,
  instruction: string,
): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'patch_screen',
    screen_index: screenIndex,
    instruction,
  })
}

/** 직접 편집한 HTML을 저장 (LLM 호출 없음) */
export async function updateScreenHtml(
  missionId: string,
  screenIndex: number,
  html: string,
): Promise<OrchestrateResponse> {
  return callOrchestrate({
    mission_id: missionId,
    action: 'update_screen_html',
    screen_index: screenIndex,
    html,
  })
}
