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

/**
 * Supabase Edge Function `orchestrate` 호출.
 * 미션의 current_state에 따라 다음 단계 진행.
 */
export async function orchestrate(missionId: string): Promise<OrchestrateResponse> {
  if (!supabase || !SUPABASE_URL) {
    return { ok: false, error: 'Supabase 미설정' }
  }

  const url = `${SUPABASE_URL}/functions/v1/orchestrate`

  // anon key를 Authorization 헤더로 전달
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ mission_id: missionId }),
    })

    const data = (await response.json()) as OrchestrateResponse
    if (!response.ok) {
      console.error('orchestrate error response:', data)
    }
    return data
  } catch (err) {
    console.error('orchestrate fetch error:', err)
    return { ok: false, error: String(err) }
  }
}
