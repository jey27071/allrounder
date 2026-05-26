/**
 * Opportunity Map 요약 카드.
 * - TL;DR 한 단락 (디렉터가 3초 안에 파악)
 * - 5개 후보를 점수 시각화된 카드로
 * 채팅 메시지의 metadata.parsed 에서 데이터를 받아 렌더링.
 *
 * 데이터 형식이 예상과 다를 수 있으므로 모든 접근을 방어적으로 처리한다.
 */

interface OpportunityMapSummaryProps {
  data: unknown
  onConvertToSlides?: () => void
  converting?: boolean
}

const SCORE_DIMS: { key: 'T' | 'U' | 'P' | 'B'; label: string }[] = [
  { key: 'T', label: 'Tech' },
  { key: 'U', label: 'User' },
  { key: 'P', label: 'Product' },
  { key: 'B', label: 'Business' },
]

// deno-lint-ignore no-explicit-any
function asObject(v: unknown): any {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}
// deno-lint-ignore no-explicit-any
function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : []
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export default function OpportunityMapSummary({
  data,
  onConvertToSlides,
  converting,
}: OpportunityMapSummaryProps) {
  const obj = asObject(data)
  const tldr = asString(obj.tldr)
  const candidates = asArray(obj.candidates).map(asObject)
  const sorted = [...candidates].sort((a, b) => asNumber(b.total) - asNumber(a.total))

  return (
    <div className="border-2 border-primary/30 rounded-lg bg-primary/[0.03] p-4 mb-2">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">
            📌 TL;DR
          </div>
          {tldr ? (
            <p className="text-sm text-gray-800 leading-relaxed">{tldr}</p>
          ) : (
            <p className="text-xs text-gray-400 italic">
              요약이 제공되지 않았습니다. (이전에 생성된 산출물일 수 있음)
            </p>
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
          {sorted.map((c, i) => (
            <CandidateMini key={i} cand={c} isTop={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}

// deno-lint-ignore no-explicit-any
function CandidateMini({ cand, isTop }: { cand: any; isTop: boolean }) {
  const maxScore = 5
  const number = asNumber(cand.number) || '-'
  const name = asString(cand.name) || '(이름 없음)'
  const total = asNumber(cand.total)
  const scores = asObject(cand.scores)
  const what = asString(cand.what)
  const dataGap = asString(cand.data_gap)

  return (
    <div
      className={`border rounded p-2.5 bg-white ${
        isTop ? 'border-primary' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-mono text-gray-400">#{number}</span>
        <span className="text-xs font-bold flex-1 truncate">{name}</span>
        <span className="text-xs font-mono text-primary font-bold">{total}/20</span>
        {isTop && <span className="text-[9px] px-1 rounded bg-primary text-white">TOP</span>}
      </div>
      <div className="space-y-1 mb-1.5">
        {SCORE_DIMS.map((dim) => {
          const val = asNumber(scores[dim.key])
          const pct = Math.max(0, Math.min(100, (val / maxScore) * 100))
          return (
            <div key={dim.key} className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-500 w-12 shrink-0">{dim.label}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[9px] font-mono text-gray-400 w-3 text-right">{val}</span>
            </div>
          )
        })}
      </div>
      {what && (
        <div className="text-[11px] text-gray-600 leading-snug line-clamp-2">{what}</div>
      )}
      {dataGap && (
        <div className="text-[10px] text-warning mt-1 line-clamp-1" title={dataGap}>
          🚨 {dataGap}
        </div>
      )}
    </div>
  )
}
