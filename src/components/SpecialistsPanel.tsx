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
  const [expanded, setExpanded] = useState(false)

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
    <div className="border-t border-border shrink-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">🎯 추가 전문가 검수</span>
          <span className="text-[10px] text-gray-400">
            ({specialistIds.length}명 · 메인 흐름과 별개)
          </span>
          {invoking && (
            <span className="text-[10px] text-primary">⏳ {SPECIALIST_NAMES[invoking]} 작업 중</span>
          )}
        </div>
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-3 border-t border-border bg-gray-50/50">
          <div className="grid grid-cols-3 gap-1.5">
            {specialistIds.map((id) => {
              const meta = SPECIALIST_META[id]
              const isInvoking = invoking === id
              const isDisabled = invoking !== null
              return (
                <button
                  key={id}
                  onClick={() => void handleInvoke(id)}
                  disabled={isDisabled}
                  className="text-left p-2 rounded border border-border bg-white hover:border-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title={meta.description}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-2 h-2 rounded-full ${SPECIALIST_COLORS[id]}`} />
                    <span className="font-medium text-xs">{SPECIALIST_NAMES[id]}</span>
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
          <div className="text-[10px] text-gray-400 mt-2">
            💡 결과는 채팅 메시지로 추가됩니다
          </div>
        </div>
      )}
    </div>
  )
}
