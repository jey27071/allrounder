import { useEffect, useState } from 'react'
import { listMessages, listDeliverables, listDiaries } from '@/lib/missions'
import type { Mission, Message, Deliverable, Diary, AgentId } from '@/types/app'
import { WORKFLOW_STEPS, stateToStepIndex } from '@/types/app'
import MessageBubble from './MessageBubble'

interface MissionDetailViewProps {
  mission: Mission
  onBack: () => void
}

type Tab = 'timeline' | 'messages' | 'deliverables' | 'diaries'

const DELIVERABLE_LABEL: Record<string, string> = {
  opportunity_map: '기회 지도 (Lumi)',
  product_blueprint: 'Blueprint (Aki)',
  screen_designs: '디자인 시안 (Joi)',
  business_model: '사업화 검증 (Friday)',
  frontend_code: 'React 코드 (TARS)',
  a11y_audit: '접근성 검수 (Echo)',
  legal_review: '법무 검토 (KITT)',
  ethics_review: '윤리 검토 (Ethica)',
  test_suite: '테스트 케이스 (QA봇)',
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

const AGENT_DOT_COLOR: Record<AgentId, string> = {
  jarvis: 'bg-agent-jarvis',
  lumi: 'bg-agent-lumi',
  aki: 'bg-agent-aki',
  joi: 'bg-agent-joi',
  friday: 'bg-agent-friday',
  tars: 'bg-agent-tars',
  echo: 'bg-agent-echo',
  kitt: 'bg-agent-kitt',
  ethica: 'bg-agent-ethica',
  qa_bot: 'bg-agent-qa',
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', color: 'bg-agent-jarvis text-white' },
  paused: { label: '일시정지', color: 'bg-warning/20 text-warning' },
  completed: { label: '완료', color: 'bg-success/20 text-success' },
  error: { label: '에러', color: 'bg-warning text-white' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '-'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
}

export default function MissionDetailView({ mission, onBack }: MissionDetailViewProps) {
  const [tab, setTab] = useState<Tab>('timeline')
  const [messages, setMessages] = useState<Message[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [diaries, setDiaries] = useState<Diary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [mission.id])

  async function load() {
    setLoading(true)
    const [msgs, dels, dirs] = await Promise.all([
      listMessages(mission.id),
      listDeliverables(mission.id),
      listDiaries(mission.id),
    ])
    setMessages(msgs)
    setDeliverables(dels)
    setDiaries(dirs)
    setLoading(false)
  }

  const badge = STATUS_BADGE[mission.status] ?? STATUS_BADGE.pending
  const currentStepIndex = stateToStepIndex(mission.current_state)
  const duration = formatDuration(mission.created_at, mission.completed_at)

  return (
    <main className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-8 py-5 shrink-0">
        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-primary mb-2 inline-flex items-center gap-1"
        >
          ← 히스토리로
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded ${badge.color}`}>{badge.label}</span>
              <span className="text-xs text-gray-500">{mission.domain}</span>
              <span className="text-xs text-gray-400 font-mono">{mission.current_state}</span>
            </div>
            <h1 className="text-xl font-bold truncate">{mission.title}</h1>
          </div>
          <div className="text-right text-xs text-gray-500 shrink-0">
            <div>생성 {formatDate(mission.created_at)}</div>
            {mission.completed_at && <div>완료 {formatDate(mission.completed_at)}</div>}
            <div className="mt-1 font-mono text-gray-700">소요 {duration}</div>
            <div className="font-mono text-gray-700">반려 {mission.reject_cycle}회</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-8 shrink-0">
        <nav className="flex gap-1">
          {[
            { key: 'timeline' as const, label: '워크플로우' },
            { key: 'messages' as const, label: `메시지 (${messages.length})` },
            { key: 'deliverables' as const, label: `산출물 (${deliverables.length})` },
            { key: 'diaries' as const, label: `일기 (${diaries.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="text-sm text-gray-500">불러오는 중...</div>
        ) : tab === 'timeline' ? (
          <TimelinePanel currentStepIndex={currentStepIndex} charter={mission.charter} context={mission.context} />
        ) : tab === 'messages' ? (
          <MessagesPanel messages={messages} />
        ) : tab === 'deliverables' ? (
          <DeliverablesPanel deliverables={deliverables} />
        ) : (
          <DiariesPanel diaries={diaries} />
        )}
      </div>
    </main>
  )
}

function TimelinePanel({
  currentStepIndex,
  charter,
  context,
}: {
  currentStepIndex: number
  charter: string
  context: string | null
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <section>
        <h2 className="text-sm font-bold text-gray-700 mb-2">미션 헌장</h2>
        <div className="p-4 bg-white border border-border rounded text-sm whitespace-pre-wrap leading-relaxed">
          {charter}
        </div>
      </section>

      {context && (
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">컨텍스트</h2>
          <div className="p-4 bg-gray-50 border border-border rounded text-sm whitespace-pre-wrap leading-relaxed text-gray-700">
            {context}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-bold text-gray-700 mb-3">워크플로우 진행</h2>
        <div className="space-y-2">
          {WORKFLOW_STEPS.map((step, idx) => {
            const status: 'done' | 'active' | 'pending' =
              idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'active' : 'pending'
            return (
              <div key={step.key} className="flex items-center gap-3">
                <span
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    status === 'done' ? 'bg-success' : status === 'active' ? 'bg-primary' : 'bg-gray-200'
                  }`}
                />
                <span
                  className={`text-sm ${
                    status === 'pending' ? 'text-gray-400' : status === 'active' ? 'font-medium' : 'text-gray-700'
                  }`}
                >
                  {step.label}
                </span>
                {status === 'done' && <span className="text-xs text-success">✓</span>}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function MessagesPanel({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <div className="text-sm text-gray-500">메시지가 없습니다.</div>
  }
  return (
    <div className="max-w-3xl space-y-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  )
}

function DeliverablesPanel({ deliverables }: { deliverables: Deliverable[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (deliverables.length === 0) {
    return <div className="text-sm text-gray-500">산출물이 없습니다.</div>
  }

  return (
    <div className="max-w-4xl space-y-3">
      {deliverables.map((d) => {
        const isExpanded = expandedId === d.id
        const label = DELIVERABLE_LABEL[d.type] ?? d.type
        const creatorLabel = AGENT_LABEL[d.created_by as AgentId] ?? d.created_by
        return (
          <div key={d.id} className="border border-border rounded bg-white overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : d.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
            >
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">v{d.version}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    d.status === 'approved' || d.status === 'final'
                      ? 'bg-success/20 text-success'
                      : d.status === 'rejected'
                        ? 'bg-warning/20 text-warning'
                        : 'bg-gray-100 text-gray-600'
                  }`}>{d.status}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {creatorLabel} · {formatDate(d.created_at)}
                  {d.review_score != null && ` · 점수 ${d.review_score}/20`}
                </div>
              </div>
              <span className="text-gray-400 text-sm shrink-0 ml-2">{isExpanded ? '▲' : '▼'}</span>
            </button>
            {isExpanded && (
              <div className="border-t border-border p-4 bg-gray-50">
                {d.raw_markdown ? (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed text-gray-800 font-mono max-h-96 overflow-y-auto">
                    {d.raw_markdown}
                  </div>
                ) : (
                  <pre className="text-xs leading-relaxed text-gray-700 font-mono max-h-96 overflow-y-auto whitespace-pre-wrap">
                    {JSON.stringify(d.data, null, 2)}
                  </pre>
                )}
                {d.review_notes && (
                  <div className="mt-3 pt-3 border-t border-border text-xs text-gray-600">
                    <span className="font-medium">검수 노트:</span> {d.review_notes}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DiariesPanel({ diaries }: { diaries: Diary[] }) {
  if (diaries.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        일기가 없습니다.<br />
        <span className="text-xs text-gray-400">에이전트가 미션 종료 시 회고를 남기면 여기 표시됩니다.</span>
      </div>
    )
  }
  return (
    <div className="max-w-3xl space-y-3">
      {diaries.map((d) => (
        <div key={d.id} className="border border-border rounded bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${AGENT_DOT_COLOR[d.agent_id] ?? 'bg-gray-300'}`} />
              <span className="text-sm font-medium">{AGENT_LABEL[d.agent_id] ?? d.agent_id}</span>
              {d.context_label && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{d.context_label}</span>
              )}
            </div>
            <span className="text-xs text-gray-400">{formatDate(d.created_at)}</span>
          </div>
          {d.difficulty && (
            <div className="mb-2">
              <div className="text-xs font-medium text-gray-500 mb-0.5">난점</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{d.difficulty}</div>
            </div>
          )}
          {d.insight && (
            <div className="mb-2">
              <div className="text-xs font-medium text-gray-500 mb-0.5">통찰</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{d.insight}</div>
            </div>
          )}
          {d.next_try && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-0.5">다음 시도</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{d.next_try}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
