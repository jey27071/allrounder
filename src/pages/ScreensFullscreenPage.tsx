/**
 * 풀화면 시안 보기 페이지. 디태치 새 창에서 진입.
 * URL: /?view=screens&did=<deliverable_id>
 *
 * - 좌측 사이드바·헤더 모두 숨김
 * - 화면 가득 캔버스 또는 단일 시안 미리보기
 * - 디바이스 토글 (단일 모드)
 * - 캔버스 모드 토글 (Stitch 스타일)
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Deliverable } from '@/types/app'
import ScreensCanvas from '@/components/ScreensCanvas'
import ScreenPreview from '@/components/ScreenPreview'

interface ScreensFullscreenPageProps {
  deliverableId: string
}

// deno-lint-ignore no-explicit-any
type Any = any

export default function ScreensFullscreenPage({ deliverableId }: ScreensFullscreenPageProps) {
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'canvas' | 'single'>('canvas')
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverableId])

  async function load() {
    if (!supabase) {
      setError('Supabase 미설정')
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('deliverables')
      .select('*')
      .eq('id', deliverableId)
      .single()
    if (error) setError(error.message)
    else setDeliverable(data as Deliverable)
    setLoading(false)
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-sm text-gray-500">불러오는 중...</div>
  }
  if (error || !deliverable) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-sm text-warning">⚠ {error ?? '시안을 찾을 수 없습니다'}</div>
      </div>
    )
  }

  const data = deliverable.data as Any
  const screens: Any[] = Array.isArray(data?.screens) ? data.screens : []

  if (screens.length === 0) {
    return <div className="h-screen flex items-center justify-center text-sm text-gray-500">화면이 없습니다.</div>
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 슬림 헤더 */}
      <div className="shrink-0 bg-white border-b border-border px-4 py-2 flex items-center gap-3">
        <div className="font-bold text-sm">디자인 시안</div>
        <span className="text-xs text-gray-400">v{deliverable.version}</span>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-500">{screens.length}개 화면</span>
        <div className="ml-auto flex items-center gap-1 border border-border rounded">
          <button
            onClick={() => setMode('canvas')}
            className={`text-xs px-3 py-1 ${mode === 'canvas' ? 'bg-primary text-white' : 'bg-white text-gray-700'}`}
          >
            🗺 캔버스
          </button>
          <button
            onClick={() => setMode('single')}
            className={`text-xs px-3 py-1 ${mode === 'single' ? 'bg-primary text-white' : 'bg-white text-gray-700'}`}
          >
            📱 단일
          </button>
        </div>
        <button
          onClick={() => window.close()}
          className="text-xs text-gray-400 hover:text-gray-700 px-2"
          title="이 창 닫기"
        >
          ✕
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {mode === 'canvas' ? (
          <ScreensCanvas screens={screens} />
        ) : (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              {/* 화면 선택 탭 */}
              <div className="flex flex-wrap gap-2 mb-4">
                {screens.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveIdx(i)}
                    className={`text-xs px-3 py-1.5 rounded border ${
                      i === activeIdx
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white hover:border-gray-400'
                    }`}
                  >
                    #{i + 1} {s.name ?? ''}
                  </button>
                ))}
              </div>
              <div>
                <h2 className="font-bold text-lg mb-1">{screens[activeIdx]?.name}</h2>
                <p className="text-sm text-gray-600 mb-3">{screens[activeIdx]?.purpose}</p>
                <ScreenPreview
                  html={screens[activeIdx]?.html ?? screens[activeIdx]?.html_tailwind ?? ''}
                  height={800}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
