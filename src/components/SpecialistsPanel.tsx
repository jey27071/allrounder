import { useState } from 'react'
import { invokeSpecialist } from '@/lib/orchestrate'
import type { Mission } from '@/types/app'
import { SPECIALIST_META, type SpecialistId } from '@/data/specialists'

interface SpecialistsPanelProps {
  mission: Mission
}

const SPECIALIST_COLORS: Record<SpecialistId, string> = {
  friday: 'bg-agent-friday',
  tars: 'bg-agent-tars',
  echo: 'bg-agent-echo',
  kitt: 'bg-agent-kitt',
  ethica: 'bg-agent-ethica',
  qa_bot: 'bg-agent-qa',
}

const SPECIALIST_NAMES: Record<SpecialistId, string> = {
  friday: '프라이데이',
  tars: '타스',
  echo: '에코',
  kitt: '키트',
  ethica: '에씨카',
  qa_bot: 'QA봇',
}

export default function SpecialistsPanel({ mission }: SpecialistsPanelProps) {
  const [invoking, setInvoking] = useState<SpecialistId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleInvoke(id: SpecialistId) {
    setInvoking(id)
    setError(null)
    const result = await invokeSpecialist(mission.id, id)
    if (!result.ok) {
      setError(`${SPECIALIST_NAMES[id]} 호출 실패: ${result.error}`)
    }
    setInvoking(null)
  }

  const specialistIds = Object.keys(SPECIALIST_META) as SpecialistId[]

  return (
    <div className="border-t border-border p-4">
      <div className="text-xs font-medium text-gray-500 mb-3">
        🎯 추가 전문가 검수 (메인 흐름과 별개)
      </div>
      <div className="grid grid-cols-2 gap-2">
        {specialistIds.map((id) => {
          const meta = SPECIALIST_META[id]
          const isInvoking = invoking === id
          const isDisabled = invoking !== null
          return (
            <button
              key={id}
              onClick={() => void handleInvoke(id)}
              disabled={isDisabled}
              className={`text-left p-3 rounded border border-border bg-white hover:border-primary transition disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${SPECIALIST_COLORS[id]}`} />
                <span className="font-medium text-sm">{SPECIALIST_NAMES[id]}</span>
              </div>
              <div className="text-xs text-gray-500 mb-1">{meta.label}</div>
              <div className="text-[10px] text-gray-400">
                {isInvoking ? '⏳ 작업 중...' : meta.description}
              </div>
            </button>
          )
        })}
      </div>
      {error && (
        <div className="mt-3 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
          ⚠ {error}
        </div>
      )}
      <div className="text-[10px] text-gray-400 mt-2">
        💡 보고서는 자비스 채팅에 메시지로 추가됩니다.
      </div>
    </div>
  )
}
