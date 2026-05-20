import { supabase, SUPABASE_URL } from '@/lib/supabase'
import type { WisdomPrinciple, AgentId } from '@/types/app'

export interface ExtractWisdomResult {
  ok: boolean
  candidates_created?: number
  total_diaries_considered?: number
  raw_candidates?: number
  note?: string
  error?: string
}

/**
 * Jarvis가 누적 다이어리에서 지혜 후보를 추출.
 * 후보는 wisdom_principles에 active=false로 저장되어 디렉터 검토 대기.
 */
export async function triggerWisdomExtraction(): Promise<ExtractWisdomResult> {
  if (!supabase || !SUPABASE_URL) return { ok: false, error: 'Supabase 미설정' }

  const url = `${SUPABASE_URL}/functions/v1/orchestrate`
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action: 'extract_wisdom' }),
    })
    const data = (await response.json()) as ExtractWisdomResult
    if (!response.ok) {
      return { ok: false, error: data.error ?? 'Extraction failed' }
    }
    return data
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export interface WisdomInput {
  title: string
  description: string
  applies_to: AgentId[]
  version?: string
  active?: boolean
  source_diary_ids?: string[] | null
}

export async function listWisdom(includeInactive = false): Promise<WisdomPrinciple[]> {
  if (!supabase) return []
  let query = supabase.from('wisdom_principles').select('*').order('created_at', { ascending: false })
  if (!includeInactive) {
    query = query.eq('active', true)
  }
  const { data, error } = await query
  if (error) {
    console.error('지혜 조회 실패:', error)
    return []
  }
  return (data ?? []) as WisdomPrinciple[]
}

export async function createWisdom(input: WisdomInput): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase.from('wisdom_principles').insert({
    title: input.title,
    description: input.description,
    applies_to: input.applies_to,
    version: input.version ?? 'v1.0',
    active: input.active ?? true,
    source_diary_ids: input.source_diary_ids ?? null,
  })
  if (error) {
    console.error('지혜 생성 실패:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function updateWisdom(
  id: string,
  input: Partial<WisdomInput>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) patch.description = input.description
  if (input.applies_to !== undefined) patch.applies_to = input.applies_to
  if (input.version !== undefined) patch.version = input.version
  if (input.active !== undefined) patch.active = input.active
  if (input.source_diary_ids !== undefined) patch.source_diary_ids = input.source_diary_ids

  const { error } = await supabase.from('wisdom_principles').update(patch).eq('id', id)
  if (error) {
    console.error('지혜 업데이트 실패:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function setWisdomActive(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  return updateWisdom(id, { active })
}
