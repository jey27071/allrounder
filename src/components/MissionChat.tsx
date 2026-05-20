import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listMessages } from '@/lib/missions'
import { orchestrate } from '@/lib/orchestrate'
import type { Mission, Message } from '@/types/app'
import MessageBubble from './MessageBubble'

interface MissionChatProps {
  mission: Mission
}

const STATES_WITH_NEXT: Mission['current_state'][] = ['LUMI_WORKING', 'LUMI_RESUBMITTING']

export default function MissionChat({ mission }: MissionChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [progressing, setProgressing] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)

  const canProgress = STATES_WITH_NEXT.includes(mission.current_state)

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
              className="w-full px-4 py-2.5 text-sm font-medium rounded bg-agent-lumi text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {progressing ? '⏳ 루미가 작업 중...' : '▶ 루미에게 작업 진행시키기'}
            </button>
            {progressError && (
              <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
                ⚠ {progressError}
              </div>
            )}
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
    </div>
  )
}
