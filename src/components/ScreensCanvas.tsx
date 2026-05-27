import { useEffect, useRef, useState } from 'react'

interface Screen {
  name?: string
  purpose?: string
  html?: string
  html_tailwind?: string
}

interface ScreensCanvasProps {
  screens: Screen[]
  /** 각 시안 프레임의 기본 너비 (px). 기본 375 (모바일) */
  frameWidth?: number
  /** 각 시안 프레임의 기본 높이 (px). 기본 720 */
  frameHeight?: number
  /** 화면 사이 간격 (px). 기본 40 */
  gap?: number
}

/**
 * Google Stitch 스타일 무한 캔버스.
 * - 자동 그리드 배치 (한 줄에 여러 화면)
 * - 마우스 휠 줌 (Ctrl/Cmd + 휠 OR 그냥 휠)
 * - 드래그 팬 (빈 영역 또는 어디든)
 * - 더블클릭으로 줌 리셋
 *
 * 외부 라이브러리 없이 transform: scale + translate로 구현.
 */
export default function ScreensCanvas({
  screens,
  frameWidth = 375,
  frameHeight = 720,
  gap = 40,
}: ScreensCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  const [tx, setTx] = useState(40)
  const [ty, setTy] = useState(40)
  const drag = useRef<{ x: number; y: number; startTx: number; startTy: number } | null>(null)

  // 자동 그리드: 가로 4열 기본
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(screens.length))))
  const positions = screens.map((_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      x: col * (frameWidth + gap),
      y: row * (frameHeight + 60 + gap),
    }
  })

  function clampScale(v: number) {
    return Math.max(0.1, Math.min(3, v))
  }

  function onWheel(e: React.WheelEvent) {
    if (!containerRef.current) return
    e.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = -e.deltaY * 0.0015
    const newScale = clampScale(scale * (1 + delta))
    // 마우스 위치 기준으로 줌
    const sx = (mx - tx) / scale
    const sy = (my - ty) / scale
    setScale(newScale)
    setTx(mx - sx * newScale)
    setTy(my - sy * newScale)
  }

  function onMouseDown(e: React.MouseEvent) {
    // 좌클릭만, iframe 내부 클릭이 아닐 때
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, startTx: tx, startTy: ty }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return
    setTx(drag.current.startTx + (e.clientX - drag.current.x))
    setTy(drag.current.startTy + (e.clientY - drag.current.y))
  }
  function endDrag() {
    drag.current = null
  }

  function resetView() {
    setScale(0.6)
    setTx(40)
    setTy(40)
  }
  function fitToScreen() {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const totalW = cols * (frameWidth + gap) - gap
    const rows = Math.ceil(screens.length / cols)
    const totalH = rows * (frameHeight + 60 + gap) - gap
    const sx = (rect.width - 80) / totalW
    const sy = (rect.height - 80) / totalH
    const s = clampScale(Math.min(sx, sy))
    setScale(s)
    setTx((rect.width - totalW * s) / 2)
    setTy((rect.height - totalH * s) / 2)
  }

  useEffect(() => {
    // 마운트 시 자동 fit
    const t = setTimeout(fitToScreen, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens.length])

  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-100">
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing select-none"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={resetView}
      >
        <div
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {screens.map((s, i) => {
            const html = s.html ?? s.html_tailwind ?? ''
            const pos = positions[i]
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: frameWidth,
                }}
              >
                <div className="mb-2 px-1">
                  <div className="text-base font-bold text-gray-800">
                    #{i + 1} · {s.name ?? '(이름 없음)'}
                  </div>
                  {s.purpose && (
                    <div className="text-xs text-gray-500 truncate">{s.purpose}</div>
                  )}
                </div>
                <div
                  className="bg-white rounded-lg overflow-hidden border border-gray-300 shadow-lg"
                  style={{ width: frameWidth, height: frameHeight }}
                >
                  <iframe
                    srcDoc={buildIframeHtml(html)}
                    title={`screen-${i}`}
                    sandbox="allow-scripts"
                    className="w-full h-full"
                    style={{ border: 'none', pointerEvents: scale > 0.5 ? 'auto' : 'none' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div className="absolute top-3 right-3 bg-white border border-border rounded shadow flex items-center gap-1 px-2 py-1 text-xs">
        <button onClick={() => setScale((s) => clampScale(s * 0.8))} className="px-2 hover:bg-gray-100 rounded" title="축소">−</button>
        <span className="font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => clampScale(s * 1.25))} className="px-2 hover:bg-gray-100 rounded" title="확대">+</button>
        <span className="text-gray-300 mx-1">|</span>
        <button onClick={fitToScreen} className="px-2 hover:bg-gray-100 rounded" title="전체 맞춤">⤢ Fit</button>
        <button onClick={resetView} className="px-2 hover:bg-gray-100 rounded" title="100% 리셋">↺</button>
      </div>

      {/* 하단 안내 */}
      <div className="absolute bottom-3 left-3 bg-white/90 border border-border rounded px-3 py-1.5 text-[10px] text-gray-500">
        🖱 드래그 = 팬 · 휠 = 줌 · 더블클릭 = 리셋 · 줌 50% 이상이면 화면 내부도 조작 가능
      </div>
    </div>
  )
}

function buildIframeHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
  <style>body { font-family: 'Pretendard', system-ui, sans-serif; margin: 0; }</style>
</head>
<body>${body}</body>
</html>`
}
