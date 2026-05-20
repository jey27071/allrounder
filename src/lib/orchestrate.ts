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
  action?: 'cp1' | 'cp2' | 'cp3' | 'specialist'
  selected_candidate_index?: number
  decision?: 'approve' | 'revise' | 'branch'
  comments?: string
  specialist_id?: string
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
