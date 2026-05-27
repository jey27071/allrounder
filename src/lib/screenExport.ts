/**
 * 시안(screen_designs) 및 디자인 시스템을 외부 형식으로 export하는 유틸.
 * - 각 화면 .html 다운로드
 * - 통째 .json 백업 다운로드
 * - Figma "Tokens Studio for Figma" plugin 호환 design-tokens.json
 *
 * Tokens Studio 포맷 참고: https://docs.tokens.studio/manage-settings/json-format
 *   { "global": { "colors": { "primary": { "value": "#1A1A1A", "type": "color" } } } }
 */

import type { AgentDesignSystem } from '@/types/app'

// deno-lint-ignore no-explicit-any
type Any = any

/** 다운로드 트리거 (브라우저 환경) */
function triggerDownload(content: string | Blob, filename: string, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_\-]/g, '_').slice(0, 60)
}

/** 단일 화면을 standalone .html 파일로 다운로드 */
export function downloadScreenHtml(screenName: string, html: string) {
  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${screenName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
  <style>body { font-family: 'Pretendard', system-ui, sans-serif; margin: 0; }</style>
</head>
<body>
${html}
</body>
</html>`
  triggerDownload(fullHtml, `${sanitizeFilename(screenName)}.html`, 'text/html;charset=utf-8')
}

/** screen_designs deliverable 데이터 전체를 JSON 백업으로 다운로드 */
export function downloadScreenDesignsJson(missionTitle: string, data: Any) {
  const filename = `screens_${sanitizeFilename(missionTitle)}.json`
  triggerDownload(JSON.stringify(data, null, 2), filename, 'application/json')
}

/** 시안의 모든 화면을 단일 멀티 페이지 HTML로 다운로드 (각 화면 사이 page-break) */
export function downloadScreensCombinedHtml(missionTitle: string, data: Any) {
  // deno-lint-ignore no-explicit-any
  const screens: any[] = Array.isArray(data?.screens) ? data.screens : []
  const sections = screens
    .map((s, i) => {
      const html = s.html ?? s.html_tailwind ?? ''
      return `<section data-screen="${i + 1}" style="page-break-after: always; padding: 24px 0; border-bottom: 1px dashed #ddd;">
  <h2 style="font-family: Pretendard; padding: 0 16px; color: #666;">#${i + 1} · ${s.name ?? '(이름 없음)'}</h2>
  ${html}
</section>`
    })
    .join('\n')
  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${missionTitle} — 전체 시안</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
  <style>
    body { font-family: 'Pretendard', system-ui, sans-serif; margin: 0; background: #f5f5f5; }
    @media print { @page { size: A4; margin: 12mm; } body { background: white; } }
  </style>
</head>
<body>
${sections}
</body>
</html>`
  triggerDownload(fullHtml, `${sanitizeFilename(missionTitle)}_all_screens.html`, 'text/html;charset=utf-8')
}

// ============================================================
// Tokens Studio JSON export
// ============================================================

interface TokensStudioToken {
  value: string | number
  type: string
  description?: string
}

interface TokensStudioFile {
  [set: string]: {
    [category: string]: {
      [name: string]: TokensStudioToken | Record<string, TokensStudioToken>
    }
  }
}

function flattenColors(obj: Any, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof obj === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(obj)) {
    out[prefix || 'color'] = obj
    return out
  }
  if (typeof obj === 'object' && obj !== null) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k
      Object.assign(out, flattenColors(v, key))
    }
  }
  return out
}

/**
 * AgentDesignSystem을 Tokens Studio for Figma 형식의 JSON으로 변환.
 * 디자이너가 Figma > Tokens Studio plugin > Import에 paste 가능.
 */
export function designSystemToTokensStudio(ds: AgentDesignSystem): TokensStudioFile {
  const tokens = (ds.tokens ?? {}) as Any
  const set: Record<string, Record<string, TokensStudioToken>> = {}

  // colors
  const colors = flattenColors(tokens.colors ?? {})
  if (Object.keys(colors).length > 0) {
    set.colors = {}
    for (const [name, value] of Object.entries(colors)) {
      set.colors[name] = { value, type: 'color' }
    }
  }

  // typography (간단 변환)
  if (tokens.typography && typeof tokens.typography === 'object') {
    set.typography = {}
    for (const [role, v] of Object.entries(tokens.typography as Any)) {
      if (typeof v === 'string') {
        set.typography[role] = { value: v, type: 'fontFamilies' }
      } else if (typeof v === 'object' && v !== null) {
        // deno-lint-ignore no-explicit-any
        const vv = v as any
        set.typography[role] = {
          value: vv.family ?? vv.fontFamily ?? '',
          type: 'fontFamilies',
          description: [vv.size && `size: ${vv.size}`, vv.weight && `weight: ${vv.weight}`]
            .filter(Boolean)
            .join(', '),
        }
      }
    }
  }

  // spacing
  if (tokens.spacing && typeof tokens.spacing === 'object') {
    set.spacing = {}
    for (const [name, value] of Object.entries(tokens.spacing as Any)) {
      set.spacing[name] = { value: String(value), type: 'spacing' }
    }
  }

  // radius
  if (tokens.radius && typeof tokens.radius === 'object') {
    set.radius = {}
    for (const [name, value] of Object.entries(tokens.radius as Any)) {
      set.radius[name] = { value: String(value), type: 'borderRadius' }
    }
  }

  return { global: set }
}

export function downloadTokensStudioJson(ds: AgentDesignSystem) {
  const json = designSystemToTokensStudio(ds)
  const filename = `${sanitizeFilename(ds.name)}_tokens_studio.json`
  triggerDownload(JSON.stringify(json, null, 2), filename, 'application/json')
}

/**
 * 시안에서 사용된 색상·폰트를 추출해 Tokens Studio JSON으로 만든다.
 * (디자인 시스템 등록 안 한 상태에서도 시안의 토큰을 Figma로 보낼 수 있게)
 */
export function downloadScreenTokensAsTokensStudio(missionTitle: string, data: Any) {
  // deno-lint-ignore no-explicit-any
  const screens: any[] = Array.isArray(data?.screens) ? data.screens : []
  const colors = new Set<string>()
  const fonts = new Set<string>()
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g
  const fontRe = /font-family\s*:\s*([^;"']+)/gi
  for (const s of screens) {
    const html: string = (s.html ?? s.html_tailwind ?? '') as string
    let m: RegExpExecArray | null
    while ((m = hexRe.exec(html)) !== null) colors.add(m[0].toLowerCase())
    while ((m = fontRe.exec(html)) !== null) {
      const f = m[1].split(',')[0].trim().replace(/["']/g, '')
      if (f) fonts.add(f)
    }
  }

  const set: Record<string, Record<string, TokensStudioToken>> = {}
  if (colors.size > 0) {
    set.colors = {}
    let i = 1
    for (const c of colors) set.colors[`color_${i++}`] = { value: c, type: 'color' }
  }
  if (fonts.size > 0) {
    set.typography = {}
    let i = 1
    for (const f of fonts) set.typography[`font_${i++}`] = { value: f, type: 'fontFamilies' }
  }

  const filename = `${sanitizeFilename(missionTitle)}_extracted_tokens.json`
  triggerDownload(JSON.stringify({ global: set }, null, 2), filename, 'application/json')
}
