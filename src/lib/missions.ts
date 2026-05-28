import { supabase } from '@/lib/supabase'
import { orchestrate } from '@/lib/orchestrate'
import type { Mission, Message, Deliverable, Diary, MissionType } from '@/types/app'

export interface CreateMissionInput {
  title: string
  domain: string
  charter: string
  context?: string
  mission_type?: MissionType
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
      mission_type: input.mission_type ?? 'ui_design',
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

export async function listMissions(options: { includeArchived?: boolean; onlyArchived?: boolean } = {}): Promise<Mission[]> {
  if (!supabase) return []

  let query = supabase.from('missions').select('*').order('created_at', { ascending: false })

  if (options.onlyArchived) {
    query = query.eq('archived', true)
  } else if (!options.includeArchived) {
    query = query.eq('archived', false)
  }

  const { data, error } = await query

  if (error) {
    console.error('미션 목록 조회 실패:', error)
    return []
  }
  return (data ?? []) as Mission[]
}

export async function archiveMission(missionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase
    .from('missions')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', missionId)
  if (error) {
    console.error('미션 보관 실패:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function unarchiveMission(missionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase
    .from('missions')
    .update({ archived: false, archived_at: null })
    .eq('id', missionId)
  if (error) {
    console.error('미션 보관 해제 실패:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/**
 * 미션을 영구 삭제. 연결된 메시지·산출물·일기는 ON DELETE CASCADE로 함께 삭제됨.
 * 보관된 미션만 삭제 가능 (안전장치).
 */
export async function deleteMission(missionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }

  // 보관 상태 확인
  const { data: mission, error: fetchErr } = await supabase
    .from('missions')
    .select('archived')
    .eq('id', missionId)
    .single()

  if (fetchErr || !mission) {
    return { ok: false, error: fetchErr?.message ?? '미션을 찾을 수 없습니다' }
  }

  if (!(mission as { archived: boolean }).archived) {
    return { ok: false, error: '보관된 미션만 영구 삭제할 수 있습니다. 먼저 보관 처리하세요.' }
  }

  const { error } = await supabase.from('missions').delete().eq('id', missionId)
  if (error) {
    console.error('미션 삭제 실패:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
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

export async function sendDirectorMessage(
  missionId: string,
  content: string,
  to: string,
  cc: string[] = [],
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }

  const { error } = await supabase.from('messages').insert({
    mission_id: missionId,
    sender: 'director',
    recipient: to,
    cc: cc.length > 0 ? cc : null,
    type: 'UserInput',
    content,
  })

  if (error) {
    console.error('디렉터 메시지 전송 실패:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
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

export async function listDeliverables(missionId: string): Promise<Deliverable[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('deliverables')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('산출물 조회 실패:', error)
    return []
  }
  return (data ?? []) as Deliverable[]
}

export async function listDiaries(missionId: string): Promise<Diary[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('diaries')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('일기 조회 실패:', error)
    return []
  }
  return (data ?? []) as Diary[]
}
