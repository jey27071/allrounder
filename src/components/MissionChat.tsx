import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listMessages } from '@/lib/missions'
import { orchestrate } from '@/lib/orchestrate'
import type { Mission, Message, MissionState } from '@/types/app'
import MessageBubble from './MessageBubble'
import Cp1Modal from './Cp1Modal'
import Cp2Modal from './Cp2Modal'
import Cp3Modal from './Cp3Modal'
import SpecialistsPanel from './SpecialistsPanel'

interface MissionChatProps {
  mission: Mission
}

const PROGRESS_BUTTON_LABELS: Partial<Record<MissionState, string>> = {
  LUMI_WORKING: '▶ 루미에게 작업 진행시키기',
  LUMI_RESUBMITTING: '▶ 루미에게 재작업 진행시키기',
  AKI_REVIEWING: '▶ 아키에게 검수 진행시키기',
  AKI_DESIGNING: '▶ 아키에게 Blueprint 작성시키기',
  AKI_REVISING: '▶ 아키에게 수정 요청',
  JOI_DESIGNING: '▶ 조이에게 디자인 시안 작성시키기',
  JOI_REVISING: '▶ 조이에게 디자인 수정 요청',
}

const PROGRESS_BUTTON_COLOR: Partial<Record<MissionState, string>> = {
  LUMI_WORKING: 'bg-agent-lumi',
  LUMI_RESUBMITTING: 'bg-agent-lumi',
  AKI_REVIEWING: 'bg-agent-aki',
  AKI_DESIGNING: 'bg-agent-aki',
  AKI_REVISING: 'bg-agent-aki',
  JOI_DESIGNING: 'bg-agent-joi',
  JOI_REVISING: 'bg-agent-joi',
}

export default function MissionChat({ mission }: MissionChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [progressing, setProgressing] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [showCp1, setShowCp1] = useState(false)
  const [showCp2, setShowCp2] = useState(false)
  const [showCp3, setShowCp3] = useState(false)

  const progressLabel = PROGRESS_BUTTON_LABELS[mission.current_state]
  const progressColor = PROGRESS_BUTTON_COLOR[mission.current_state] ?? 'bg-primary'
  const canProgress = progressLabel != null

  useEffect(() => {
    if (mission.current_state === 'WAITING_CP1') setShowCp1(true)
    if (mission.current_state === 'WAITING_CP2') setShowCp2(true)
    if (mission.current_state === 'WAITING_CP3') setShowCp3(true)
  }, [mission.current_state])

  useEffect(() => {
    void loadMessages()

    if (!supabase) return

    // Realtime: 새 메시지 도착 시 자동 append
    const channel = supabase
      .channel(`mission-${mission.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `mission_id=eq.${mission.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [mission.id])

  async function loadMessages() {
    const data = await listMessages(mission.id)
    setMessages(data)
    setLoading(false)
  }

  async function handleProgress() {
    setProgressing(true)
    setProgressError(null)
    const result = await orchestrate(mission.id)
    if (!result.ok) {
      setProgressError(result.error ?? result.detail ?? '진행 실패')
    }
    setProgressing(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
          <span className="px-2 py-0.5 bg-gray-100 rounded">
            {mission.status === 'in_progress' ? '⏳ 진행 중' : mission.status === 'completed' ? '✅ 완료' : mission.status}
          </span>
          <span>{mission.domain}</span>
        </div>
        <h2 className="text-lg font-bold">{mission.title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {loading ? (
          <div className="text-sm text-gray-500">불러오는 중...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-500">아직 메시지가 없습니다.</div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>

      <div className="border-t border-border p-4">
        {canProgress && (
          <div className="mb-3">
            <button
              onClick={() => void handleProgress()}
              disabled={progressing}
              className={`w-full px-4 py-2.5 text-sm font-medium rounded ${progressColor} text-white hover:opacity-90 transition disabled:opacity-50`}
            >
              {progressing ? '⏳ 작업 중...' : progressLabel}
            </button>
            {progressError && (
              <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
                ⚠ {progressError}
              </div>
            )}
          </div>
        )}

        {mission.current_state === 'WAITING_CP1' && !showCp1 && (
          <button
            onClick={() => setShowCp1(true)}
            className="w-full mb-3 px-4 py-2.5 text-sm font-medium rounded bg-primary text-white hover:opacity-90"
          >
            ★ CP1 — 후보 선택 다시 열기
          </button>
        )}

        {mission.current_state === 'WAITING_CP2' && !showCp2 && (
          <button
            onClick={() => setShowCp2(true)}
            className="w-full mb-3 px-4 py-2.5 text-sm font-medium rounded bg-primary text-white hover:opacity-90"
          >
            ★ CP2 — Blueprint 검토 다시 열기
          </button>
        )}

        {mission.current_state === 'WAITING_CP3' && !showCp3 && (
          <button
            onClick={() => setShowCp3(true)}
            className="w-full mb-3 px-4 py-2.5 text-sm font-medium rounded bg-primary text-white hover:opacity-90"
          >
            ★ CP3 — 디자인 시안 검토 다시 열기
          </button>
        )}

        {mission.current_state === 'COMPLETED' && (
          <div className="mb-3 p-3 bg-success/10 border border-success/30 rounded text-sm text-success text-center">
            ✓ 미션 완료
          </div>
        )}

        {mission.current_state === 'ERROR_STATE' && (
          <div className="mb-3 p-3 bg-warning/10 border border-warning/30 rounded text-sm text-warning">
            ⚠ 반려 사이클 한도 도달. 디렉터 개입 필요.
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="메시지 입력 (자비스와 직접 대화는 다음 단계에서)"
            disabled
            className="flex-1 border border-border rounded px-3 py-2 text-sm bg-gray-50 placeholder-gray-400 cursor-not-allowed"
          />
          <button disabled className="px-4 py-2 text-sm rounded bg-primary text-white opacity-50 cursor-not-allowed">
            ↑
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-2">
          현재 상태: <span className="font-mono">{mission.current_state}</span>
        </div>
      </div>

      <SpecialistsPanel mission={mission} />

      {showCp1 && <Cp1Modal mission={mission} onClose={() => setShowCp1(false)} />}
      {showCp2 && <Cp2Modal mission={mission} onClose={() => setShowCp2(false)} />}
      {showCp3 && <Cp3Modal mission={mission} onClose={() => setShowCp3(false)} />}
    </div>
  )
}
