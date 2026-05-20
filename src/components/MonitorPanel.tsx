import { WORKFLOW_STEPS, stateToStepIndex } from '@/types/app'
import type { Mission } from '@/types/app'

interface MonitorPanelProps {
  mission?: Mission | null
}

export default function MonitorPanel({ mission }: MonitorPanelProps) {
  const currentStepIndex = mission ? stateToStepIndex(mission.current_state) : -1

  return (
    <aside className="border-l border-border p-6 overflow-y-auto">
      <div className="font-bold mb-4">진행 상황</div>

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
            <div className={`text-lg font-mono ${mission.reject_cycle >= 2 ? 'text-warning' : 'text-primary'}`}>
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
        </>
      )}
    </aside>
  )
}
