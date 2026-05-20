import { useState } from 'react'
import { invokeSpecialist, orchestrate } from '@/lib/orchestrate'
import type { Mission, AgentId } from '@/types/app'
import { INVOKABLE_AGENTS, AGENT_COLORS, type AgentMeta } from '@/data/team'

interface AgentTeamPanelProps {
  mission: Mission
}

export default function AgentTeamPanel({ mission }: AgentTeamPanelProps) {
  const [invoking, setInvoking] = useState<AgentId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  function canInvoke(meta: AgentMeta): boolean {
    if (meta.kind === 'invoke') return true
    // workflow agent: 현재 미션 상태가 그 에이전트의 단계일 때만 호출 가능
    if (meta.kind === 'workflow' && meta.workflowStates) {
      return meta.workflowStates.includes(mission.current_state)
    }
    return false
  }

  async function handleInvoke(meta: AgentMeta) {
    if (!canInvoke(meta)) return
    setInvoking(meta.id)
    setError(null)
    const result =
      meta.kind === 'workflow'
        ? await orchestrate(mission.id)
        : await invokeSpecialist(mission.id, meta.id)
    if (!result.ok) {
      setError(`${meta.name} 호출 실패: ${result.error ?? result.detail ?? '알 수 없는 오류'}`)
    }
    setInvoking(null)
  }

  const invokingMeta = invoking ? INVOKABLE_AGENTS.find((a) => a.id === invoking) : null

  return (
    <div className="border-t border-border shrink-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">👥 팀원 호출</span>
          <span className="text-[10px] text-gray-400">({INVOKABLE_AGENTS.length}명)</span>
          {invokingMeta && (
            <span className="text-[10px] text-primary">⏳ {invokingMeta.name} 작업 중</span>
          )}
        </div>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-3 border-t border-border bg-gray-50/50">
          <div className="grid grid-cols-3 gap-1.5">
            {INVOKABLE_AGENTS.map((meta) => {
              const isInvoking = invoking === meta.id
              const isAnyInvoking = invoking !== null
              const canCall = canInvoke(meta)
              const isWorkflow = meta.kind === 'workflow'
              const disabled = isAnyInvoking || !canCall

              return (
                <button
                  key={meta.id}
                  onClick={() => void handleInvoke(meta)}
                  disabled={disabled}
                  className="text-left p-2 rounded border border-border bg-white hover:border-primary transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border"
                  title={
                    canCall
                      ? meta.description
                      : isWorkflow
                        ? `현재 ${mission.current_state} 단계에서는 호출 불가 (워크플로우 에이전트)`
                        : meta.description
                  }
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-2 h-2 rounded-full ${AGENT_COLORS[meta.id]}`} />
                    <span className="font-medium text-xs">{meta.name}</span>
                    {isWorkflow && (
                      <span className="text-[8px] text-gray-400 ml-auto">자동</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {isInvoking ? '⏳' : meta.label}
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
