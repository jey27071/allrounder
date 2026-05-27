import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listMessages, sendDirectorMessage } from '@/lib/missions'
import { orchestrate, invokeSpecialist, generateSlides, jarvisChat } from '@/lib/orchestrate'
import type { Mission, Message, MissionState, AgentId } from '@/types/app'
import MessageBubble from './MessageBubble'
import Cp1Modal from './Cp1Modal'
import Cp2Modal from './Cp2Modal'
import Cp3Modal from './Cp3Modal'
import AgentTeamPanel from './AgentTeamPanel'
import OpportunityMapSummary from './OpportunityMapSummary'
import SlideDeckViewer, { type SlideDeck } from './SlideDeckViewer'
import ErrorBoundary from './ErrorBoundary'

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

type Recipient = AgentId

const RECIPIENT_OPTIONS: { id: Recipient; label: string; kind: 'core' | 'specialist' }[] = [
  { id: 'jarvis', label: 'Jarvis (자동 진행)', kind: 'core' },
  { id: 'lumi', label: 'Lumi (리서치)', kind: 'core' },
  { id: 'aki', label: 'Aki (설계)', kind: 'core' },
  { id: 'joi', label: 'Joi (디자인)', kind: 'core' },
  { id: 'friday', label: 'Friday (사업화)', kind: 'specialist' },
  { id: 'tars', label: 'TARS (React 코드)', kind: 'specialist' },
  { id: 'echo', label: 'Echo (접근성)', kind: 'specialist' },
  { id: 'kitt', label: 'KITT (법무)', kind: 'specialist' },
  { id: 'ethica', label: 'Ethica (윤리)', kind: 'specialist' },
  { id: 'qa_bot', label: 'QA봇 (테스트)', kind: 'specialist' },
  { id: 'wordy', label: 'Wordy (UX 라이팅)', kind: 'specialist' },
]

const SPECIALIST_IDS: Recipient[] = ['friday', 'tars', 'echo', 'kitt', 'ethica', 'qa_bot', 'wordy']

export default function MissionChat({ mission }: MissionChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [progressing, setProgressing] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [showCp1, setShowCp1] = useState(false)
  const [showCp2, setShowCp2] = useState(false)
  const [showCp3, setShowCp3] = useState(false)

  const [input, setInput] = useState('')
  const [to, setTo] = useState<Recipient>('jarvis')
  const [cc, setCc] = useState<Recipient[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showCcPicker, setShowCcPicker] = useState(false)

  // Phase 18: 슬라이드 변환 + 뷰어
  const [convertingSlides, setConvertingSlides] = useState(false)
  const [viewingDeck, setViewingDeck] = useState<SlideDeck | null>(null)
  const [slidesError, setSlidesError] = useState<string | null>(null)

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
        },
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

  async function handleGenerateSlides() {
    if (convertingSlides) return
    if (!confirm('현재 Opportunity Map을 슬라이드 deck으로 변환합니다. (Gemini Pro 호출, 약 30~60초 소요)\n진행할까요?')) return
    setConvertingSlides(true)
    setSlidesError(null)
    const result = await generateSlides(mission.id)
    if (!result.ok) {
      setSlidesError(result.error ?? result.detail ?? '슬라이드 변환 실패')
    }
    setConvertingSlides(false)
  }

  function handleViewDeck(deck: SlideDeck) {
    setViewingDeck(deck)
  }

  function toggleCc(id: Recipient) {
    setCc((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)

    // 1) 메시지 저장 (TO/CC 메타 포함)
    const filteredCc = cc.filter((c) => c !== to)
    const result = await sendDirectorMessage(mission.id, text, to, filteredCc)
    if (!result.ok) {
      setSendError(result.error ?? '전송 실패')
      setSending(false)
      return
    }

    setInput('')
    setCc([])

    // 2) TO 에이전트 트리거 (Phase 24-A)
    //    - specialist (friday/tars/echo/kitt/ethica/qa_bot/wordy): invokeSpecialist
    //    - jarvis 또는 워크플로우 에이전트 (lumi/aki/joi): jarvisChat — 자비스가 답변·라우팅
    //      (워크플로우 자동 진행은 [▶ 진행시키기] 버튼에서만)
    if (SPECIALIST_IDS.includes(to)) {
      void invokeSpecialist(mission.id, to)
    } else {
      void jarvisChat(mission.id)
    }

    // 3) Phase 24-A2: CC 태그된 specialist도 자동 invoke
    for (const ccId of filteredCc) {
      if (SPECIALIST_IDS.includes(ccId)) {
        void invokeSpecialist(mission.id, ccId)
      }
    }

    setSending(false)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-border p-5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
          <span className="px-2 py-0.5 bg-gray-100 rounded">
            {mission.status === 'in_progress'
              ? '⏳ 진행 중'
              : mission.status === 'completed'
                ? '✅ 완료'
                : mission.status}
          </span>
          <span>{mission.domain}</span>
        </div>
        <h2 className="text-lg font-bold">{mission.title}</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {loading ? (
          <div className="text-sm text-gray-500">불러오는 중...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-500">아직 메시지가 없습니다.</div>
        ) : (
          messages.map((msg) => {
            // deno-lint-ignore no-explicit-any
            const meta = (msg.metadata ?? {}) as any
            // Opportunity Map 메시지 → 요약 카드 위에 표시
            if (meta && meta.format === 'opportunity_map' && meta.parsed) {
              return (
                <ErrorBoundary key={msg.id} label="Opportunity Map 메시지">
                  <div>
                    <OpportunityMapSummary
                      data={meta.parsed}
                      onConvertToSlides={() => void handleGenerateSlides()}
                      converting={convertingSlides}
                    />
                    <MessageBubble message={msg} />
                  </div>
                </ErrorBoundary>
              )
            }
            // Slide deck 메시지 → "보기" 버튼
            if (meta && meta.format === 'slide_deck' && meta.parsed) {
              const slidesCount = Array.isArray(meta.parsed?.slides) ? meta.parsed.slides.length : 0
              return (
                <ErrorBoundary key={msg.id} label="슬라이드 메시지">
                  <div>
                    <MessageBubble message={msg} />
                    <button
                      onClick={() => handleViewDeck(meta.parsed as SlideDeck)}
                      className="ml-12 mt-1 text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-90"
                    >
                      📊 슬라이드 보기 ({slidesCount}장)
                    </button>
                  </div>
                </ErrorBoundary>
              )
            }
            return (
              <ErrorBoundary key={msg.id} label="메시지">
                <MessageBubble message={msg} />
              </ErrorBoundary>
            )
          })
        )}
        {slidesError && (
          <div className="p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
            ⚠ {slidesError}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4 shrink-0">
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

        {/* TO / CC selector */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <label className="text-xs text-gray-500 shrink-0">TO</label>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value as Recipient)}
            className="border border-border rounded px-2 py-1 text-xs bg-white"
          >
            {RECIPIENT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowCcPicker((v) => !v)}
            className="text-xs text-gray-500 hover:text-primary border border-border rounded px-2 py-1"
          >
            CC {cc.length > 0 ? `(${cc.length})` : ''}
          </button>
          {cc.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {cc.map((c) => {
                const opt = RECIPIENT_OPTIONS.find((o) => o.id === c)
                return (
                  <span
                    key={c}
                    className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded inline-flex items-center gap-1"
                  >
                    {opt?.label.split(' ')[0]}
                    <button
                      onClick={() => toggleCc(c)}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {showCcPicker && (
          <div className="mb-2 p-2 border border-border rounded bg-gray-50">
            <div className="text-xs text-gray-500 mb-1">CC 대상 선택 (TO 제외)</div>
            <div className="flex flex-wrap gap-1">
              {RECIPIENT_OPTIONS.filter((o) => o.id !== to).map((o) => {
                const selected = cc.includes(o.id)
                return (
                  <button
                    key={o.id}
                    onClick={() => toggleCc(o.id)}
                    className={`text-[10px] px-2 py-1 rounded border transition ${
                      selected
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder={
              to === 'jarvis'
                ? '메시지 입력 (Enter로 전송) — Jarvis가 컨텍스트 기반 처리'
                : `${RECIPIENT_OPTIONS.find((o) => o.id === to)?.label}에게 보낼 메시지`
            }
            disabled={sending}
            className="flex-1 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:bg-gray-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            className="px-4 py-2 text-sm rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? '⏳' : '↑'}
          </button>
        </div>

        {sendError && (
          <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
            ⚠ {sendError}
          </div>
        )}

        <div className="text-xs text-gray-400 mt-2">
          현재 상태: <span className="font-mono">{mission.current_state}</span>
        </div>
      </div>

      <AgentTeamPanel mission={mission} />

      {showCp1 && <Cp1Modal mission={mission} onClose={() => setShowCp1(false)} />}
      {showCp2 && <Cp2Modal mission={mission} onClose={() => setShowCp2(false)} />}
      {showCp3 && <Cp3Modal mission={mission} onClose={() => setShowCp3(false)} />}
      {viewingDeck && (
        <SlideDeckViewer deck={viewingDeck} onClose={() => setViewingDeck(null)} />
      )}
    </div>
  )
}
