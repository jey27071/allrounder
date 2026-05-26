import { useEffect, useState, useCallback } from 'react'

interface Slide {
  title?: string
  layout?: 'title' | 'bullets' | 'two_column' | 'quote' | 'metrics' | 'comparison'
  content?: {
    headline?: string
    bullets?: string[]
    left?: string
    right?: string
    quote?: string
    metrics?: { label: string; value: string; note?: string }[]
    compare?: { name: string; items: string[] }[]
  }
  speaker_notes?: string
}

export interface SlideDeck {
  title?: string
  subtitle?: string
  slides?: Slide[]
}

interface SlideDeckViewerProps {
  deck: SlideDeck
  onClose: () => void
}

export default function SlideDeckViewer({ deck, onClose }: SlideDeckViewerProps) {
  const slides = deck.slides ?? []
  const [idx, setIdx] = useState(0)
  const [showNotes, setShowNotes] = useState(false)

  const go = useCallback((n: number) => {
    setIdx((cur) => Math.max(0, Math.min(slides.length - 1, cur + n)))
  }, [slides.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'n' || e.key === 'N') {
        setShowNotes((v) => !v)
      } else if (e.key === 'p' || e.key === 'P') {
        window.print()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded p-6 text-sm">슬라이드가 없습니다.</div>
      </div>
    )
  }

  const cur = slides[idx]

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col print:bg-white print:static">
      {/* 헤더 — 인쇄시 숨김 */}
      <div className="px-4 py-2 flex items-center justify-between bg-black/90 text-white text-xs print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="hover:bg-white/10 px-2 py-1 rounded">✕ 닫기</button>
          <span className="text-white/60">{deck.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono">{idx + 1} / {slides.length}</span>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="hover:bg-white/10 px-2 py-1 rounded"
            title="발표자 노트 (N)"
          >
            노트 {showNotes ? '🔽' : '▶'}
          </button>
          <button
            onClick={() => window.print()}
            className="hover:bg-white/10 px-2 py-1 rounded"
            title="브라우저 인쇄 → PDF로 저장 (P)"
          >
            🖨 인쇄·PDF
          </button>
        </div>
      </div>

      {/* 슬라이드 영역 */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 print:p-0">
        <div className="slide-page bg-white shadow-2xl w-full max-w-5xl aspect-[16/9] flex flex-col print:shadow-none print:max-w-none print:aspect-auto print:h-screen">
          <SlideContent slide={cur} />
        </div>

        {showNotes && cur.speaker_notes && (
          <div className="mt-3 max-w-5xl w-full bg-gray-900 text-gray-100 text-sm p-3 rounded print:hidden">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">발표자 노트</div>
            {cur.speaker_notes}
          </div>
        )}
      </div>

      {/* 네비 화살표 — 인쇄시 숨김 */}
      <div className="px-4 py-2 flex items-center justify-between bg-black/90 text-white print:hidden">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="px-4 py-2 hover:bg-white/10 rounded disabled:opacity-30"
        >
          ← 이전
        </button>
        <div className="text-[10px] text-white/40">
          좌우키·스페이스 이동 · N 노트 · P 인쇄 · ESC 닫기
        </div>
        <button
          onClick={() => go(1)}
          disabled={idx === slides.length - 1}
          className="px-4 py-2 hover:bg-white/10 rounded disabled:opacity-30"
        >
          다음 →
        </button>
      </div>

      {/* 인쇄 모드: 모든 슬라이드 한 페이지씩 */}
      <div className="hidden print:block">
        {slides.map((s, i) => (
          <div key={i} className="slide-page-print" style={{ pageBreakAfter: 'always' }}>
            <SlideContent slide={s} />
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          @page { size: landscape; margin: 0; }
          body { margin: 0; }
          .slide-page-print { width: 100vw; height: 100vh; padding: 4vh 6vw; box-sizing: border-box; }
        }
      `}</style>
    </div>
  )
}

function SlideContent({ slide }: { slide: Slide }) {
  const c = slide.content ?? {}
  const layout = slide.layout ?? 'bullets'

  if (layout === 'title') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">{slide.title}</h1>
        {c.headline && <p className="text-xl text-gray-600">{c.headline}</p>}
      </div>
    )
  }

  if (layout === 'quote') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <div className="text-4xl text-primary mb-4">"</div>
        <p className="text-2xl font-medium text-gray-800 max-w-3xl leading-relaxed">
          {c.quote ?? slide.title}
        </p>
      </div>
    )
  }

  if (layout === 'metrics' && c.metrics?.length) {
    return (
      <div className="flex-1 flex flex-col p-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
        <div className="grid grid-cols-3 gap-6 flex-1 items-center">
          {c.metrics.map((m, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl font-bold text-primary mb-1">{m.value}</div>
              <div className="text-sm font-medium text-gray-700 mb-1">{m.label}</div>
              {m.note && <div className="text-xs text-gray-500">{m.note}</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (layout === 'two_column') {
    return (
      <div className="flex-1 flex flex-col p-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
        <div className="grid grid-cols-2 gap-8 flex-1">
          <div className="text-base text-gray-700 whitespace-pre-wrap">{c.left}</div>
          <div className="text-base text-gray-700 whitespace-pre-wrap">{c.right}</div>
        </div>
      </div>
    )
  }

  if (layout === 'comparison' && c.compare?.length) {
    return (
      <div className="flex-1 flex flex-col p-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${c.compare.length}, 1fr)` }}>
          {c.compare.map((col, i) => (
            <div key={i} className="border border-border rounded-lg p-4">
              <div className="font-bold text-base text-gray-900 mb-3">{col.name}</div>
              <ul className="space-y-1.5">
                {col.items.map((item, j) => (
                  <li key={j} className="text-sm text-gray-700 leading-relaxed">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Default: bullets
  return (
    <div className="flex-1 flex flex-col p-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{slide.title}</h2>
      {c.headline && (
        <p className="text-xl text-primary font-medium mb-6">{c.headline}</p>
      )}
      {c.bullets?.length ? (
        <ul className="space-y-3 flex-1">
          {c.bullets.map((b, i) => (
            <li key={i} className="text-base text-gray-700 leading-relaxed flex">
              <span className="text-primary mr-2 mt-0.5">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
