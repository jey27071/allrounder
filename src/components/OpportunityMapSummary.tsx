/**
 * Opportunity Map 요약 카드.
 * - TL;DR 한 단락 (디렉터가 3초 안에 파악)
 * - 5개 후보를 점수 시각화된 카드로
 * 채팅 메시지의 metadata.parsed 에서 데이터를 받아 렌더링.
 */

interface Candidate {
  number: number
  name: string
  scores: { T: number; U: number; P: number; B: number }
  total: number
  what?: string
  why_now?: string
  data_gap?: string
}

interface OpportunityMapData {
  tldr?: string
  summary?: string
  candidates?: Candidate[]
}

interface OpportunityMapSummaryProps {
  data: OpportunityMapData
  onConvertToSlides?: () => void
  converting?: boolean
}

const SCORE_DIMS: { key: keyof Candidate['scores']; label: string }[] = [
  { key: 'T', label: 'Tech' },
  { key: 'U', label: 'User' },
  { key: 'P', label: 'Product' },
  { key: 'B', label: 'Business' },
]

export default function OpportunityMapSummary({
  data,
  onConvertToSlides,
  converting,
}: OpportunityMapSummaryProps) {
  const candidates = data.candidates ?? []
  const sorted = [...candidates].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))

  return (
    <div className="border-2 border-primary/30 rounded-lg bg-primary/[0.03] p-4 mb-2">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">
            📌 TL;DR
          </div>
          {data.tldr ? (
            <p className="text-sm text-gray-800 leading-relaxed">{data.tldr}</p>
          ) : (
            <p className="text-xs text-gray-400 italic">요약이 제공되지 않았습니다.</p>
          )}
        </div>
        {onConvertToSlides && (
          <button
            onClick={onConvertToSlides}
            disabled={converting}
            className="shrink-0 text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
            title="이 결과를 슬라이드로 변환"
          >
            {converting ? '⏳ 변환 중...' : '📊 슬라이드로 변환'}
          </button>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {sorted.map((c) => (
            <CandidateMini key={c.number} cand={c} isTop={c === sorted[0]} />
          ))}
        </div>
      )}
    </div>
  )
}

function CandidateMini({ cand, isTop }: { cand: Candidate; isTop: boolean }) {
  const maxScore = 5
  return (
    <div
      className={`border rounded p-2.5 bg-white ${
        isTop ? 'border-primary' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-mono text-gray-400">#{cand.number}</span>
        <span className="text-xs font-bold flex-1 truncate">{cand.name}</span>
        <span className="text-xs font-mono text-primary font-bold">{cand.total}/20</span>
        {isTop && <span className="text-[9px] px-1 rounded bg-primary text-white">TOP</span>}
      </div>
      {/* 점수 막대 4개 (가로) */}
      <div className="space-y-1 mb-1.5">
        {SCORE_DIMS.map((dim) => {
          const val = cand.scores?.[dim.key] ?? 0
          return (
            <div key={dim.key} className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-500 w-12 shrink-0">{dim.label}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(val / maxScore) * 100}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-gray-400 w-3 text-right">{val}</span>
            </div>
          )
        })}
      </div>
      {cand.what && (
        <div className="text-[11px] text-gray-600 leading-snug line-clamp-2">{cand.what}</div>
      )}
      {cand.data_gap && (
        <div className="text-[10px] text-warning mt-1 line-clamp-1" title={cand.data_gap}>
          🚨 {cand.data_gap}
        </div>
      )}
    </div>
  )
}
