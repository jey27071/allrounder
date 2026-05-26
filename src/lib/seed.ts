import { supabase } from '@/lib/supabase'
import { AGENT_SEEDS, WISDOM_SEEDS, SUB_AGENT_SEEDS } from '@/data/personas'

export interface SeedResult {
  agentsInserted: number
  wisdomsInserted: number
  errors: string[]
}

/**
 * agents·wisdom_principles 테이블이 비어있으면 시드 데이터 삽입.
 * 이미 데이터가 있으면 건너뜀 (멱등적).
 */
export async function seedDatabase(): Promise<SeedResult> {
  const result: SeedResult = { agentsInserted: 0, wisdomsInserted: 0, errors: [] }

  if (!supabase) {
    result.errors.push('Supabase 클라이언트 미초기화')
    return result
  }

  // 1. agents 시드 — id 단위 idempotent (이미 있는 것은 건너뜀)
  const { data: existingAgents, error: agentsCheckErr } = await supabase
    .from('agents')
    .select('id')

  if (agentsCheckErr) {
    result.errors.push(`agents 조회 실패: ${agentsCheckErr.message}`)
    return result
  }

  const existingIds = new Set((existingAgents ?? []).map((a) => a.id))
  const missingAgents = AGENT_SEEDS.filter((s) => !existingIds.has(s.id))

  if (missingAgents.length > 0) {
    const { error: insertErr } = await supabase.from('agents').insert(missingAgents)
    if (insertErr) {
      result.errors.push(`agents 삽입 실패: ${insertErr.message}`)
    } else {
      result.agentsInserted = missingAgents.length
    }
  }

  // 1-b. 하위 에이전트 시드 (parent_agent_id 포함). 멱등 처리.
  const missingSubs = SUB_AGENT_SEEDS.filter((s) => !existingIds.has(s.id))
  if (missingSubs.length > 0) {
    const { error: subErr } = await supabase.from('agents').insert(missingSubs)
    if (subErr) {
      result.errors.push(`sub-agents 삽입 실패: ${subErr.message}`)
    } else {
      result.agentsInserted += missingSubs.length
    }
  }

  // 2. wisdom_principles 시드 — title 단위로 idempotent 처리
  for (const seed of WISDOM_SEEDS) {
    const { data: existing, error: checkErr } = await supabase
      .from('wisdom_principles')
      .select('id')
      .eq('title', seed.title)
      .limit(1)

    if (checkErr) {
      result.errors.push(`wisdom check (${seed.title}) 실패: ${checkErr.message}`)
      continue
    }

    if (!existing || existing.length === 0) {
      const { error: insertErr } = await supabase.from('wisdom_principles').insert(seed)
      if (insertErr) {
        result.errors.push(`wisdom insert (${seed.title}) 실패: ${insertErr.message}`)
      } else {
        result.wisdomsInserted += 1
      }
    }
  }

  return result
}
