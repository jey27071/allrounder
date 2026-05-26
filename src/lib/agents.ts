import { supabase } from '@/lib/supabase'
import type {
  Agent,
  AgentVersion,
  AgentKnowledge,
  AgentExample,
  AgentId,
} from '@/types/app'

// ============================================================
// Agent CRUD
// ============================================================

export interface CreateAgentInput {
  id: AgentId
  name: string
  role: string
  description?: string
  system_prompt: string
  current_version?: string
  color_token?: string
  model?: string
  deliverable_type?: string
}

const ID_PATTERN = /^[a-z][a-z0-9_]{1,31}$/

export function validateAgentId(id: string): { ok: boolean; error?: string } {
  if (!id) return { ok: false, error: 'ID는 비워둘 수 없습니다' }
  if (!ID_PATTERN.test(id)) {
    return {
      ok: false,
      error: 'ID는 소문자/숫자/언더스코어 2~32자, 영문으로 시작해야 합니다',
    }
  }
  return { ok: true }
}

export async function listAgents(): Promise<Agent[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('is_custom', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    console.error('agents 조회 실패:', error)
    return []
  }
  return (data ?? []) as Agent[]
}

export async function createAgent(input: CreateAgentInput): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const v = validateAgentId(input.id)
  if (!v.ok) return v

  const initialVersion = input.current_version ?? 'v1.0'
  const { error } = await supabase.from('agents').insert({
    id: input.id,
    name: input.name,
    role: input.role,
    description: input.description ?? null,
    system_prompt: input.system_prompt,
    current_version: initialVersion,
    color_token: input.color_token ?? 'agent-friday',
    is_custom: true,
    model: input.model ?? null,
    deliverable_type: input.deliverable_type ?? null,
  })
  if (error) {
    console.error('에이전트 생성 실패:', error)
    return { ok: false, error: error.message }
  }

  // 최초 버전도 agent_versions에 함께 기록
  await supabase.from('agent_versions').insert({
    agent_id: input.id,
    version: initialVersion,
    system_prompt: input.system_prompt,
    changelog: '최초 등록',
  })
  return { ok: true }
}

export interface UpdateAgentMetaInput {
  name?: string
  role?: string
  description?: string | null
  color_token?: string
  model?: string | null
  deliverable_type?: string | null
}

export async function updateAgentMeta(
  id: AgentId,
  input: UpdateAgentMetaInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.role !== undefined) patch.role = input.role
  if (input.description !== undefined) patch.description = input.description
  if (input.color_token !== undefined) patch.color_token = input.color_token
  if (input.model !== undefined) patch.model = input.model
  if (input.deliverable_type !== undefined) patch.deliverable_type = input.deliverable_type
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase.from('agents').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteAgent(id: AgentId): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  // 안전장치: 빌트인은 UI에서 막지만 한 번 더 확인
  const { data: agent } = await supabase.from('agents').select('is_custom').eq('id', id).single()
  if (!agent?.is_custom) {
    return { ok: false, error: '빌트인 에이전트는 삭제할 수 없습니다' }
  }
  const { error } = await supabase.from('agents').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ============================================================
// Prompt Versions
// ============================================================

export async function listAgentVersions(agentId: AgentId): Promise<AgentVersion[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('agent_versions')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('agent_versions 조회 실패:', error)
    return []
  }
  return (data ?? []) as AgentVersion[]
}

/**
 * 메인 프롬프트를 새 버전으로 저장 + agents.system_prompt / current_version 갱신.
 * version은 중복되지 않아야 한다 (UNIQUE(agent_id, version)).
 */
export async function saveAgentPromptVersion(
  agentId: AgentId,
  newVersion: string,
  systemPrompt: string,
  changelog?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  if (!newVersion.trim()) return { ok: false, error: '버전을 입력하세요 (예: v1.1)' }

  // 1) agent_versions에 새 버전 기록
  const ins = await supabase.from('agent_versions').insert({
    agent_id: agentId,
    version: newVersion,
    system_prompt: systemPrompt,
    changelog: changelog ?? null,
  })
  if (ins.error) {
    if ((ins.error.message ?? '').includes('duplicate')) {
      return { ok: false, error: `이미 존재하는 버전입니다: ${newVersion}` }
    }
    return { ok: false, error: ins.error.message }
  }

  // 2) agents의 메인 프롬프트와 current_version 갱신
  const upd = await supabase
    .from('agents')
    .update({ system_prompt: systemPrompt, current_version: newVersion })
    .eq('id', agentId)
  if (upd.error) return { ok: false, error: upd.error.message }

  return { ok: true }
}

/**
 * 과거 버전을 현재 메인으로 되돌린다 (롤백).
 * 새 버전을 만들지 않고 agents.system_prompt 와 current_version만 갱신.
 */
export async function rollbackAgentToVersion(
  agentId: AgentId,
  version: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { data: v, error: e1 } = await supabase
    .from('agent_versions')
    .select('system_prompt, version')
    .eq('agent_id', agentId)
    .eq('version', version)
    .single()
  if (e1 || !v) return { ok: false, error: e1?.message ?? '버전을 찾을 수 없습니다' }

  const upd = await supabase
    .from('agents')
    .update({ system_prompt: v.system_prompt, current_version: v.version })
    .eq('id', agentId)
  if (upd.error) return { ok: false, error: upd.error.message }
  return { ok: true }
}

// ============================================================
// Knowledge
// ============================================================

export interface KnowledgeInput {
  title: string
  content: string
  source?: string | null
  active?: boolean
}

export async function listKnowledge(
  agentId: AgentId,
  includeInactive = true,
): Promise<AgentKnowledge[]> {
  if (!supabase) return []
  let query = supabase
    .from('agent_knowledge')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) {
    console.error('agent_knowledge 조회 실패:', error)
    return []
  }
  return (data ?? []) as AgentKnowledge[]
}

export async function createKnowledge(
  agentId: AgentId,
  input: KnowledgeInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase.from('agent_knowledge').insert({
    agent_id: agentId,
    title: input.title,
    content: input.content,
    source: input.source ?? null,
    active: input.active ?? true,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateKnowledge(
  id: string,
  input: Partial<KnowledgeInput>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.content !== undefined) patch.content = input.content
  if (input.source !== undefined) patch.source = input.source
  if (input.active !== undefined) patch.active = input.active
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase.from('agent_knowledge').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteKnowledge(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase.from('agent_knowledge').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ============================================================
// Examples (few-shot)
// ============================================================

export interface ExampleInput {
  label?: string | null
  input: string
  output: string
  notes?: string | null
  active?: boolean
}

export async function listExamples(
  agentId: AgentId,
  includeInactive = true,
): Promise<AgentExample[]> {
  if (!supabase) return []
  let query = supabase
    .from('agent_examples')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) {
    console.error('agent_examples 조회 실패:', error)
    return []
  }
  return (data ?? []) as AgentExample[]
}

export async function createExample(
  agentId: AgentId,
  input: ExampleInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase.from('agent_examples').insert({
    agent_id: agentId,
    label: input.label ?? null,
    input: input.input,
    output: input.output,
    notes: input.notes ?? null,
    active: input.active ?? true,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateExample(
  id: string,
  input: Partial<ExampleInput>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const patch: Record<string, unknown> = {}
  if (input.label !== undefined) patch.label = input.label
  if (input.input !== undefined) patch.input = input.input
  if (input.output !== undefined) patch.output = input.output
  if (input.notes !== undefined) patch.notes = input.notes
  if (input.active !== undefined) patch.active = input.active
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase.from('agent_examples').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteExample(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase 미설정' }
  const { error } = await supabase.from('agent_examples').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ============================================================
// 자동 버전 제안: vX.Y → vX.(Y+1)
// ============================================================

export function suggestNextVersion(current: string): string {
  const m = current.match(/^v?(\d+)\.(\d+)$/)
  if (!m) return current + '.1'
  const major = m[1]
  const minor = Number(m[2]) + 1
  return `v${major}.${minor}`
}
