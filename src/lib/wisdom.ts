import { supabase } from '@/lib/supabase'
import type { WisdomPrinciple, AgentId } from '@/types/app'

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
