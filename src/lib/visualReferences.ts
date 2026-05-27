import { supabase } from '@/lib/supabase'
import type { AgentId, AgentVisualReference } from '@/types/app'

const BUCKET = 'agent-references'

/** 활성 이미지 최대 개수 — 토큰 비용 컨트롤용 */
export const MAX_ACTIVE_REFERENCES = 5

/** 업로드 가능한 mime 타입 */
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

/** 단일 파일 크기 제한 (MB). Gemini inline_data 권장: 4MB 이하 */
const MAX_FILE_SIZE_MB = 4

export interface UploadResult {
  ok: boolean
  error?: string
  reference?: AgentVisualReference
}

/** 이미지 파일을 Storage에 업로드 + DB에 메타 저장 */
export async function uploadVisualReference(
  agentId: AgentId,
  file: File,
  meta?: { name?: string; description?: string; active?: boolean },
): Promise<UploadResult> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `지원하지 않는 형식입니다 (${file.type}). PNG/JPG/WebP/GIF만 가능` }
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { ok: false, error: `파일이 너무 큽니다 (최대 ${MAX_FILE_SIZE_MB}MB)` }
  }

  // 1) 활성 한도 체크
  if (meta?.active ?? true) {
    const activeCount = await countActiveReferences(agentId)
    if (activeCount >= MAX_ACTIVE_REFERENCES) {
      return {
        ok: false,
        error: `활성 이미지가 이미 ${MAX_ACTIVE_REFERENCES}장입니다. 비활성화하거나 삭제 후 추가하세요.`,
      }
    }
  }

  // 2) Storage 업로드
  const ext = file.name.split('.').pop() || 'png'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const storagePath = `${agentId}/${fileName}`
  const up = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (up.error) {
    return { ok: false, error: `업로드 실패: ${up.error.message}` }
  }

  // 3) 이미지 크기 측정 (옵션)
  const { width, height } = await readImageSize(file)

  // 4) DB에 메타 저장
  const { data, error } = await supabase
    .from('agent_visual_references')
    .insert({
      agent_id: agentId,
      name: meta?.name ?? file.name,
      description: meta?.description ?? null,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: file.size,
      width,
      height,
      active: meta?.active ?? true,
    })
    .select('*')
    .single()
  if (error) {
    // 실패 시 storage 파일 정리
    await supabase.storage.from(BUCKET).remove([storagePath])
    return { ok: false, error: `메타 저장 실패: ${error.message}` }
  }
  return { ok: true, reference: data as AgentVisualReference }
}

export async function listVisualReferences(agentId: AgentId): Promise<AgentVisualReference[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('agent_visual_references')
    .select('*')
    .eq('agent_id', agentId)
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('visual_references 조회 실패:', error)
    return []
  }
  return (data ?? []) as AgentVisualReference[]
}

export async function countActiveReferences(agentId: AgentId): Promise<number> {
  if (!supabase) return 0
  const { count } = await supabase
    .from('agent_visual_references')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('active', true)
  return count ?? 0
}

export async function setReferenceActive(
  agentId: AgentId,
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  if (active) {
    const cnt = await countActiveReferences(agentId)
    if (cnt >= MAX_ACTIVE_REFERENCES) {
      return { ok: false, error: `활성 한도 초과 (최대 ${MAX_ACTIVE_REFERENCES}장)` }
    }
  }
  const { error } = await supabase
    .from('agent_visual_references')
    .update({ active })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteVisualReference(
  id: string,
  storagePath: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  // DB에서 삭제 (cascade로 storage 객체는 자동 정리 안 됨 — 별도 처리)
  await supabase.storage.from(BUCKET).remove([storagePath])
  const { error } = await supabase.from('agent_visual_references').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** 썸네일·미리보기용 signed URL (1시간 유효) */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600)
  if (error) return null
  return data.signedUrl
}

// ============================================================
// 헬퍼
// ============================================================

function readImageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: null, height: null })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
