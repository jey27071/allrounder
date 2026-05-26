import { useEffect, useState } from 'react'
import { invokeSpecialist, orchestrate } from '@/lib/orchestrate'
import { listAgents } from '@/lib/agents'
import { bgForToken } from '@/lib/agentColors'
import type { Mission, AgentId, Agent } from '@/types/app'
import { INVOKABLE_AGENTS, AGENT_COLORS, type AgentMeta } from '@/data/team'

interface AgentTeamPanelProps {
  mission: Mission
}

interface InvokableEntry {
  id: AgentId
  name: string
  label: string
  description: string
  kind: 'workflow' | 'invoke'
  canInvoke: boolean
  colorClass: string
  isCustom: boolean
}

export default function AgentTeamPanel({ mission }: AgentTeamPanelProps) {
  const [invoking, setInvoking] = useState<AgentId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [customAgents, setCustomAgents] = useState<Agent[]>([])

  useEffect(() => {
    if (expanded) {
      void listAgents().then((all) => setCustomAgents(all.filter((a) => a.is_custom)))
    }
  }, [expanded])

  function canInvokeMeta(meta: AgentMeta): boolean {
    if (meta.kind === 'invoke') return true
    if (meta.kind === 'workflow' && meta.workflowStates) {
      return meta.workflowStates.includes(mission.current_state)
    }
    return false
  }

  const entries: InvokableEntry[] = [
    ...INVOKABLE_AGENTS.map((meta) => ({
      id: meta.id,
      name: meta.name,
      label: meta.label,
      description: meta.description,
      kind: meta.kind === 'workflow' ? ('workflow' as const) : ('invoke' as const),
      canInvoke: canInvokeMeta(meta),
      colorClass: AGENT_COLORS[meta.id as keyof typeof AGENT_COLORS] ?? 'bg-gray-400',
      isCustom: false,
    })),
    ...customAgents.map((a) => ({
      id: a.id,
      name: a.name,
      label: a.role,
      description: a.description ?? a.role,
      kind: 'invoke' as const,
      canInvoke: true,
      colorClass: bgForToken(a.color_token),
      isCustom: true,
    })),
  ]

  async function handleInvoke(entry: InvokableEntry) {
    if (!entry.canInvoke) return
    setInvoking(entry.id)
    setError(null)
    const result =
      entry.kind === 'workflow'
        ? await orchestrate(mission.id)
        : await invokeSpecialist(mission.id, entry.id)
    if (!result.ok) {
      setError(`${entry.name} 호출 실패: ${result.error ?? result.detail ?? '알 수 없는 오류'}`)
    }
    setInvoking(null)
  }

  const invokingMeta = invoking ? entries.find((a) => a.id === invoking) : null

  return (
    <div className="border-t border-border shrink-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">👥 팀원 호출</span>
          <span className="text-[10px] text-gray-400">({entries.length}명)</span>
          {invokingMeta && (
            <span className="text-[10px] text-primary">⏳ {invokingMeta.name} 작업 중</span>
          )}
        </div>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-3 border-t border-border bg-gray-50/50">
          <div className="grid grid-cols-3 gap-1.5">
            {entries.map((entry) => {
              const isInvoking = invoking === entry.id
              const isAnyInvoking = invoking !== null
              const isWorkflow = entry.kind === 'workflow'
              const disabled = isAnyInvoking || !entry.canInvoke

              return (
                <button
                  key={entry.id}
                  onClick={() => void handleInvoke(entry)}
                  disabled={disabled}
                  className="text-left p-2 rounded border border-border bg-white hover:border-primary transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border"
                  title={
                    entry.canInvoke
                      ? entry.description
                      : `현재 ${mission.current_state} 단계에서는 호출 불가 (워크플로우 에이전트)`
                  }
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-2 h-2 rounded-full ${entry.colorClass}`} />
                    <span className="font-medium text-xs">{entry.name}</span>
                    {isWorkflow && (
                      <span className="text-[8px] text-gray-400 ml-auto">자동</span>
                    )}
                    {entry.isCustom && (
                      <span className="text-[8px] text-primary ml-auto">★</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {isInvoking ? '⏳' : entry.label}
                  </div>
                </button>
              )
            })}
          </div>
          {error && (
            <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
              ⚠ {error}
            </div>
          )}
          <div className="text-[10px] text-gray-400 mt-2 leading-relaxed">
            💡 결과는 채팅 메시지로 추가됩니다 · <span className="text-gray-500">자동</span> 표시 에이전트는 현재 워크플로우 단계일 때만 활성화
          </div>
        </div>
      )}
    </div>
  )
}
