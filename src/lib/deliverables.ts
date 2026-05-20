import { supabase } from '@/lib/supabase'
import type { Deliverable } from '@/types/app'
import type { DeliverableType } from '@/types/database'

export async function getLatestDeliverable(
  missionId: string,
  type: DeliverableType,
): Promise<Deliverable | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('deliverables')
    .select('*')
    .eq('mission_id', missionId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('deliverable 조회 실패:', error)
    return null
  }
  return data as Deliverable | null
}

/**
 * 미션의 모든 산출물 (최신 버전 우선)
 */
export async function listMissionDeliverables(missionId: string): Promise<Deliverable[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('deliverables')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('deliverables 목록 조회 실패:', error)
    return []
  }
  return (data ?? []) as Deliverable[]
}
