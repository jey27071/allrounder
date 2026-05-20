import { useEffect, useState } from 'react'
import { getLatestDeliverable } from '@/lib/deliverables'
import { decideCp1 } from '@/lib/orchestrate'
import type { Mission } from '@/types/app'

interface Cp1ModalProps {
  mission: Mission
  onClose: () => void
}

interface Candidate {
  number: number
  name: string
  scores: { T: number; U: number; P: number; B: number }
  total: number
  what: string
  who: string
  signals: string[]
  why_now: string
  data_gap: string
  open_questions: string
}

export default function Cp1Modal({ mission, onClose }: Cp1ModalProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [summary, setSummary] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailIdx, setDetailIdx] = useState<number | null>(null)

  useEffect(() => {
    void loadData()
  }, [mission.id])

  async function loadData() {
    setLoading(true)
    const d = await getLatestDeliverable(mission.id, 'opportunity_map')
    if (!d) {
      setError('Opportunity Map 찾을 수 없음')
    } else {
      const data = d.data as { summary?: string; candidates?: Candidate[] }
      setSummary(data.summary ?? '')
      setCandidates(data.candidates ?? [])
    }
    setLoading(false)
  }

  async function handleSelect(num: number) {
    setSelecting(num)
    setError(null)
    const result = await decideCp1(mission.id, num)
    if (!result.ok) {
      setError(result.error ?? '선택 실패')
      setSelecting(null)
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border">
          <div className="text-xs font-bold text-agent-jarvis mb-1">★ CP1 — 디렉터의 결정 시간</div>
          <h2 className="text-lg font-bold">루미가 5개 후보를 발굴했습니다</h2>
          <p className="text-sm text-gray-500 mt-1">어떤 영역을 아키에게 넘겨 Product Blueprint로 만들까요?</p>
          {summary && <p className="mt-3 text-sm text-gray-600 leading-relaxed">{summary}</p>}
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-gray-500">불러오는 중...</div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {candidates.map((c) => (
                <div
                  key={c.number}
                  className="border border-border rounded-lg p-4 hover:border-primary transition flex flex-col"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs text-gray-500">#{c.number}</div>
                    <div className="text-sm font-bold">{c.total}/20</div>
                  </div>
                  <div className="font-bold text-sm mb-2">{c.name}</div>
                  <div className="text-xs font-mono space-y-0.5 mb-3 text-gray-600">
                    <div>T {'★'.repeat(c.scores.T)}</div>
                    <div>U {'★'.repeat(c.scores.U)}</div>
                    <div>P {'★'.repeat(c.scores.P)}</div>
                    <div>B {'★'.repeat(c.scores.B)}</div>
                  </div>
                  <div className="text-xs text-gray-600 mb-3 line-clamp-3 flex-1">{c.what}</div>
                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => setDetailIdx(c.number)}
                      className="flex-1 text-xs px-2 py-1.5 rounded border border-border hover:bg-gray-100"
                    >
                      자세히
                    </button>
                    <button
                      onClick={() => void handleSelect(c.number)}
                      disabled={selecting !== null}
                      className="flex-1 text-xs px-2 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {selecting === c.number ? '진행 중...' : '선택 ✓'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded text-xs text-warning">⚠ {error}</div>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-border hover:bg-gray-100">
            나중에 결정
          </button>
        </div>

        {/* Detail drawer */}
        {detailIdx !== null && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-6" onClick={() => setDetailIdx(null)}>
            <div className="bg-white border border-border rounded-lg shadow-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const c = candidates.find((x) => x.number === detailIdx)
                if (!c) return null
                return (
                  <>
                    <div className="text-xs text-gray-500 mb-1">#{c.number} · 총점 {c.total}/20</div>
                    <h3 className="text-lg font-bold mb-4">{c.name}</h3>
                    <Section label="What" value={c.what} />
                    <Section label="Who" value={c.who} />
                    <SectionList label="Signals" items={c.signals} />
                    <Section label="Why now" value={c.why_now} />
                    <Section label="🚨 Data Gap" value={c.data_gap} warning />
                    <Section label="Open Questions" value={c.open_questions} />
                    <div className="mt-6 flex gap-2">
                      <button onClick={() => setDetailIdx(null)} className="flex-1 px-4 py-2 text-sm rounded border border-border hover:bg-gray-100">닫기</button>
                      <button onClick={() => void handleSelect(c.number)} className="flex-1 px-4 py-2 text-sm rounded bg-primary text-white hover:opacity-90">이 후보 선택</button>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`mb-3 ${warning ? 'p-2 bg-warning/10 rounded' : ''}`}>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className="text-sm leading-relaxed">{value}</div>
    </div>
  )
}

function SectionList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <ul className="text-sm leading-relaxed list-disc pl-5 space-y-1">
        {(items ?? []).map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  )
}
