import { supabase } from '@/lib/supabase'
import { orchestrate } from '@/lib/orchestrate'
import type { Mission, Message } from '@/types/app'

export interface CreateMissionInput {
  title: string
  domain: string
  charter: string
  context?: string
}

export async function createMission(input: CreateMissionInput): Promise<Mission | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('missions')
    .insert({
      title: input.title,
      domain: input.domain,
      charter: input.charter,
      context: input.context ?? null,
      status: 'in_progress',
      current_state: 'MISSION_CREATED',
      reject_cycle: 0,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('미션 생성 실패:', error)
    return null
  }

  // 첫 메시지: 디렉터의 미션 부여
  await supabase.from('messages').insert({
    mission_id: data.id,
    sender: 'director',
    type: 'UserInput',
    content: `[CP0 미션 헌장]\n\n도메인: ${input.domain}\n임무: ${input.charter}${input.context ? `\n\n컨텍스트:\n${input.context}` : ''}`,
  })

  // 자비스 LLM 호출 — fire and forget (응답은 Realtime으로 도착)
  void orchestrate(data.id)

  return data as Mission
}

export async function listMissions(): Promise<Mission[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('미션 목록 조회 실패:', error)
    return []
  }
  return (data ?? []) as Mission[]
}

export async function getMission(missionId: string): Promise<Mission | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('id', missionId)
    .single()

  if (error || !data) return null
  return data as Mission
}

export async function listMessages(missionId: string): Promise<Message[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('메시지 조회 실패:', error)
    return []
  }
  return (data ?? []) as Message[]
}
