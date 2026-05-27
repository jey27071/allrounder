import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listMissionDeliverables } from '@/lib/deliverables'
import { WORKFLOW_STEPS, stateToStepIndex } from '@/types/app'
import type { Mission, Deliverable, AgentId } from '@/types/app'
import DeliverableViewerModal from './DeliverableViewerModal'

interface MonitorPanelProps {
  mission?: Mission | null
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const DELIVERABLE_LABEL: Record<string, string> = {
  opportunity_map: '기회 지도',
  product_blueprint: 'Blueprint',
  screen_designs: '디자인 시안',
  business_model: '사업화 검증',
  frontend_code: 'React 코드',
  a11y_audit: '접근성 검수',
  legal_review: '법무 검토',
  ethics_review: '윤리 검토',
  test_suite: '테스트 케이스',
}

const AGENT_LABEL: Record<AgentId, string> = {
  jarvis: 'Jarvis',
  lumi: 'Lumi',
  aki: 'Aki',
  joi: 'Joi',
  friday: 'Friday',
  tars: 'TARS',
  echo: 'Echo',
  kitt: 'KITT',
  ethica: 'Ethica',
  qa_bot: 'QA봇',
}

export default function MonitorPanel({ mission, collapsed, onToggleCollapse }: MonitorPanelProps) {
  // === hooks는 항상 같은 순서로 호출되어야 함 — early return은 hooks 뒤에 ===
  const currentStepIndex = mission ? stateToStepIndex(mission.current_state) : -1
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [viewing, setViewing] = useState<Deliverable | null>(null)

  useEffect(() => {
    if (!mission) {
      setDeliverables([])
      return
    }
    void load(mission.id)

    if (!supabase) return
    const channel = supabase
      .channel(`mission-deliverables-${mission.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliverables',
          filter: `mission_id=eq.${mission.id}`,
        },
        () => {
          void load(mission.id)
        },
      )
      .subscribe()
    return () => {
      void channel.unsubscribe()
    }
  }, [mission?.id])

  async function load(missionId: string) {
    const list = await listMissionDeliverables(missionId)
    setDeliverables(list)
  }

  // === 모든 hooks 호출 끝난 뒤 분기 렌더 ===
  if (collapsed) {
    return (
      <aside className="border-l border-border flex flex-col items-center py-3 bg-surface">
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title="진행 상황 패널 펼치기"
        >
          «
        </button>
        <div
          className="mt-3 text-[10px] text-gray-400 tracking-wider"
          style={{ writingMode: 'vertical-rl' }}
        >
          진행 상황
        </div>
      </aside>
    )
  }

  return (
    <aside className="border-l border-border overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold">진행 상황</div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              title="진행 상황 패널 접기"
            >
              »
            </button>
          )}
        </div>

        {!mission ? (
          <div className="text-sm text-gray-500">
            미션이 시작되면 진행 상황이 여기 표시됩니다.
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              {WORKFLOW_STEPS.map((step, idx) => {
                const status: 'done' | 'active' | 'pending' =
                  idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'active' : 'pending'
                return (
                  <div key={step.key} className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        status === 'done'
                          ? 'bg-success'
                          : status === 'active'
                            ? 'bg-primary animate-pulse'
                            : 'bg-gray-200'
                      }`}
                    />
                    <span
                      className={
                        status === 'pending'
                          ? 'text-gray-400'
                          : status === 'active'
                            ? 'font-medium'
                            : 'text-gray-600'
                      }
                    >
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-xs text-gray-500 mb-1">반려 사이클</div>
              <div
                className={`text-lg font-mono ${mission.reject_cycle >= 2 ? 'text-warning' : 'text-primary'}`}
              >
                {mission.reject_cycle} / 2
              </div>
              {mission.reject_cycle >= 2 && (
                <div className="text-xs text-warning mt-1">⚠ 한도 도달, 디렉터 개입 필요</div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-xs text-gray-500 mb-1">현재 상태</div>
              <div className="font-mono text-xs text-gray-700">{mission.current_state}</div>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-xs text-gray-500 mb-2">📦 산출물 ({deliverables.length})</div>
              {deliverables.length === 0 ? (
                <div className="text-xs text-gray-400">아직 없습니다</div>
              ) : (
                <div className="space-y-1.5">
                  {deliverables.map((d) => {
                    const label = DELIVERABLE_LABEL[d.type] ?? d.type
                    const creator = AGENT_LABEL[d.created_by as AgentId] ?? d.created_by
                    return (
                      <button
                        key={d.id}
                        onClick={() => setViewing(d)}
                        className="w-full text-left p-2 border border-border rounded hover:border-primary hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium truncate">{label}</div>
                          <span className="text-[10px] text-gray-400 shrink-0">v{d.version}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {creator}
                          {d.review_score != null && ` · ${d.review_score}/20`}
                          {' · '}
                          <span
                            className={
                              d.status === 'approved' || d.status === 'final'
                                ? 'text-success'
                                : d.status === 'rejected'
                                  ? 'text-warning'
                                  : 'text-gray-500'
                            }
                          >
                            {d.status}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {viewing && mission && (
        <DeliverableViewerModal
          deliverable={viewing}
          missionTitle={mission.title}
          onClose={() => setViewing(null)}
        />
      )}
    </aside>
  )
}
