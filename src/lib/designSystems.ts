import { supabase } from '@/lib/supabase'
import type { AgentDesignSystem, AgentId } from '@/types/app'

export interface DesignSystemInput {
  name: string
  description?: string | null
  tokens?: Record<string, unknown>
  components?: unknown[]
  principles?: string | null
  source_raw?: string | null
  active?: boolean
}

export async function listDesignSystems(agentId: AgentId): Promise<AgentDesignSystem[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('agent_design_systems')
    .select('*')
    .eq('agent_id', agentId)
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('agent_design_systems 조회 실패:', error)
    return []
  }
  return (data ?? []) as AgentDesignSystem[]
}

export async function createDesignSystem(
  agentId: AgentId,
  input: DesignSystemInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  // 활성으로 만드는 경우 기존 활성을 비활성화
  if (input.active) {
    await deactivateAll(agentId)
  }
  const { data, error } = await supabase
    .from('agent_design_systems')
    .insert({
      agent_id: agentId,
      name: input.name,
      description: input.description ?? null,
      tokens: input.tokens ?? {},
      components: input.components ?? [],
      principles: input.principles ?? null,
      source_raw: input.source_raw ?? null,
      active: input.active ?? false,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string } | null)?.id }
}

export async function updateDesignSystem(
  id: string,
  input: Partial<DesignSystemInput>,
  agentId?: AgentId,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  if (input.active === true && agentId) {
    // 다른 활성 항목을 먼저 비활성화 (이 id 제외)
    await supabase
      .from('agent_design_systems')
      .update({ active: false })
      .eq('agent_id', agentId)
      .neq('id', id)
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.tokens !== undefined) patch.tokens = input.tokens
  if (input.components !== undefined) patch.components = input.components
  if (input.principles !== undefined) patch.principles = input.principles
  if (input.source_raw !== undefined) patch.source_raw = input.source_raw
  if (input.active !== undefined) patch.active = input.active
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase.from('agent_design_systems').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function setActiveDesignSystem(
  agentId: AgentId,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  await deactivateAll(agentId)
  const { error } = await supabase
    .from('agent_design_systems')
    .update({ active: true })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deactivateAll(agentId: AgentId): Promise<void> {
  if (!supabase) return
  await supabase
    .from('agent_design_systems')
    .update({ active: false })
    .eq('agent_id', agentId)
    .eq('active', true)
}

export async function deleteDesignSystem(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase.from('agent_design_systems').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ============================================================
// JSON paste 파서 — 흔히 쓰이는 디자인 토큰 포맷을 표준 구조로 변환
// ============================================================

/**
 * 사용자가 paste한 JSON에서 표준 구조(tokens, components, principles)를 추출.
 * 지원 형식:
 *  - Style Dictionary / Tokens Studio 형식
 *  - 단순 평면 JSON ({colors:{primary:'#xxx'}, ...})
 *  - Tailwind config 부분
 *
 * 알 수 없는 형식이면 tokens 필드에 통째로 저장.
 */
export function parseDesignTokensJson(rawText: string): {
  ok: boolean
  tokens?: Record<string, unknown>
  components?: unknown[]
  error?: string
} {
  if (!rawText.trim()) return { ok: false, error: '빈 텍스트' }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch (e) {
    return { ok: false, error: 'JSON 파싱 실패: ' + (e as Error).message }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: '객체 형태의 JSON이어야 합니다' }
  }
  // deno-lint-ignore no-explicit-any
  const obj = parsed as any

  // Style Dictionary / Tokens Studio: {color: {...}, typography: {...}} 또는 {global: {color:...}}
  // Tailwind: {theme: {extend: {colors:...}}} 또는 {colors:...}
  // 단순: {colors:..., fonts:...}

  // 평탄화 시도
  const tokens: Record<string, unknown> = {}

  // 흔한 키 매핑
  const COLOR_KEYS = ['colors', 'color', 'palette']
  const FONT_KEYS = ['typography', 'fonts', 'font', 'text', 'fontFamily', 'fontSize']
  const SPACING_KEYS = ['spacing', 'space', 'sizes']
  const RADIUS_KEYS = ['radius', 'borderRadius', 'radii']

  // Tailwind config 형태이면 theme.extend로 들어감
  const candidate = obj.theme?.extend ?? obj.theme ?? obj.global ?? obj

  for (const k of COLOR_KEYS) if (candidate[k]) { tokens.colors = candidate[k]; break }
  for (const k of FONT_KEYS) if (candidate[k] && !tokens.typography) { tokens.typography = candidate[k]; break }
  for (const k of SPACING_KEYS) if (candidate[k]) { tokens.spacing = candidate[k]; break }
  for (const k of RADIUS_KEYS) if (candidate[k]) { tokens.radius = candidate[k]; break }

  // 매핑된 게 하나도 없으면 전체를 tokens에 보존
  if (Object.keys(tokens).length === 0) {
    Object.assign(tokens, candidate)
  }

  // 컴포넌트 카탈로그 추출
  const components: unknown[] = Array.isArray(obj.components)
    ? obj.components
    : (Array.isArray(candidate.components) ? candidate.components : [])

  return { ok: true, tokens, components }
}

// ============================================================
// 디자인 시스템 → 시스템 프롬프트용 텍스트 직렬화
// (앱 측에서 미리 확인할 수 있도록 공유. Edge Function은 동일 로직을
//  서버에서 별도로 수행. 함수 결과는 일관됨.)
// ============================================================

export function designSystemToPromptText(ds: AgentDesignSystem): string {
  let out = `# 적용할 디자인 시스템: ${ds.name}\n`
  if (ds.description) out += `_${ds.description}_\n`
  out += '\n## 토큰\n'
  out += '```json\n' + JSON.stringify(ds.tokens, null, 2) + '\n```\n'
  if (Array.isArray(ds.components) && ds.components.length > 0) {
    out += '\n## 컴포넌트 카탈로그\n'
    out += '```json\n' + JSON.stringify(ds.components, null, 2) + '\n```\n'
  }
  if (ds.principles) {
    out += '\n## 원칙·금기사항\n' + ds.principles + '\n'
  }
  out += '\n⚠️ **이 디자인 시스템의 토큰을 정확히 따르세요.** 임의의 hex 색상·폰트·간격 값을 만들지 말고 위에 정의된 값만 사용. 부득이하게 시스템에 없는 값을 써야 한다면 그 사유를 응답에 명시.'
  return out
}
