import { supabase } from '@/lib/supabase'
import type { Deliverable } from '@/types/app'

export async function getLatestDeliverable(missionId: string, type: 'opportunity_map' | 'product_blueprint'): Promise<Deliverable | null> {
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
