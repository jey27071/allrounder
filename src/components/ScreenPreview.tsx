import { useState } from 'react'

interface ScreenPreviewProps {
  html: string
  height?: number
}

type Device = 'mobile' | 'tablet' | 'pc' | 'full'

const DEVICE_PRESETS: Record<Device, { width: number | 'full'; label: string; icon: string }> = {
  mobile: { width: 375, label: 'Mobile · 375', icon: '📱' },
  tablet: { width: 768, label: 'Tablet · 768', icon: '📟' },
  pc: { width: 1280, label: 'PC · 1280', icon: '💻' },
  full: { width: 'full', label: 'Full', icon: '↔' },
}

/**
 * Joi가 생성한 HTML을 iframe으로 안전하게 렌더링.
 * Tailwind CDN 자동 로드.
 * Phase 19-A: 디바이스(모바일/태블릿/PC) 토글 + 디바이스 프레임 시각화.
 */
export default function ScreenPreview({ html, height = 600 }: ScreenPreviewProps) {
  const [device, setDevice] = useState<Device>('pc')

  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://cdn.jsdelivr.net">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
    <style>
      body { font-family: 'Pretendard', system-ui, sans-serif; margin: 0; }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`

  const preset = DEVICE_PRESETS[device]
  const widthStyle: React.CSSProperties = preset.width === 'full'
    ? { width: '100%' }
    : { width: `${preset.width}px`, maxWidth: '100%' }

  return (
    <div>
      {/* 디바이스 토글 */}
      <div className="flex items-center gap-1 mb-2">
        {(Object.keys(DEVICE_PRESETS) as Device[]).map((d) => {
          const p = DEVICE_PRESETS[d]
          const active = d === device
          return (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`text-xs px-2.5 py-1 rounded border transition ${
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-white text-gray-700 hover:border-gray-400'
              }`}
              title={p.label}
            >
              <span className="mr-1">{p.icon}</span>
              <span>{d === 'full' ? 'Full' : `${p.width}`}</span>
            </button>
          )
        })}
        <span className="ml-auto text-[10px] text-gray-400">
          {preset.width === 'full' ? '컨테이너 전체 너비' : `${preset.width}px · ${preset.label}`}
        </span>
      </div>

      {/* 프레임 영역: 디바이스 너비 만큼 가운데 정렬 */}
      <div
        className={`flex justify-center p-2 rounded bg-gray-100 ${preset.width === 'full' ? '' : 'border border-border'}`}
      >
        <div
          style={widthStyle}
          className={
            preset.width === 'full'
              ? ''
              : 'shadow-lg rounded-lg overflow-hidden border border-gray-300 bg-white'
          }
        >
          <iframe
            srcDoc={fullHtml}
            className="w-full bg-white"
            style={{ height: `${height}px`, border: 'none' }}
            sandbox="allow-scripts"
            title="Screen Preview"
          />
        </div>
      </div>
    </div>
  )
}
