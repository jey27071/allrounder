import { useState } from 'react'
import {
  createDesignSystem,
  updateDesignSystem,
  parseDesignTokensJson,
} from '@/lib/designSystems'
import type { AgentDesignSystem, AgentId } from '@/types/app'

interface DesignSystemFormModalProps {
  agentId: AgentId
  initial?: AgentDesignSystem | null
  onClose: () => void
  onSaved: () => void
}

type Mode = 'form' | 'json'

interface ColorRow {
  name: string
  value: string
}
interface FontRow {
  role: string
  family: string
  weight?: string
  size?: string
}
interface SpacingRow {
  name: string
  value: string
}
interface ComponentRow {
  name: string
  purpose: string
  notes?: string
}

function tokensToRows(tokens: Record<string, unknown>): {
  colors: ColorRow[]
  fonts: FontRow[]
  spacing: SpacingRow[]
  radius: SpacingRow[]
} {
  // deno-lint-ignore no-explicit-any
  const c: any = tokens.colors ?? {}
  // deno-lint-ignore no-explicit-any
  const t: any = tokens.typography ?? {}
  // deno-lint-ignore no-explicit-any
  const s: any = tokens.spacing ?? {}
  // deno-lint-ignore no-explicit-any
  const r: any = tokens.radius ?? {}
  const colors: ColorRow[] = []
  const fonts: FontRow[] = []
  const spacing: SpacingRow[] = []
  const radius: SpacingRow[] = []
  // 평탄화: {primary: '#xxx', surface: {DEFAULT: '#xxx', dark: ...}}
  const flatten = (prefix: string, obj: unknown, out: { name: string; value: string }[]) => {
    if (typeof obj === 'string' || typeof obj === 'number') {
      out.push({ name: prefix, value: String(obj) })
      return
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const [k, v] of Object.entries(obj)) {
        flatten(prefix ? `${prefix}.${k}` : k, v, out)
      }
    }
  }
  flatten('', c, colors)
  flatten('', s, spacing)
  flatten('', r, radius)
  if (typeof t === 'object' && t !== null && !Array.isArray(t)) {
    for (const [role, v] of Object.entries(t)) {
      if (typeof v === 'string') {
        fonts.push({ role, family: v })
      } else if (typeof v === 'object' && v !== null) {
        // deno-lint-ignore no-explicit-any
        const vv = v as any
        fonts.push({
          role,
          family: vv.family ?? vv.fontFamily ?? '',
          weight: vv.weight ?? vv.fontWeight,
          size: vv.size ?? vv.fontSize,
        })
      }
    }
  }
  return { colors, fonts, spacing, radius }
}

function rowsToTokens(
  colors: ColorRow[],
  fonts: FontRow[],
  spacing: SpacingRow[],
  radius: SpacingRow[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  if (colors.length > 0) {
    const colorObj: Record<string, string> = {}
    for (const r of colors) if (r.name.trim()) colorObj[r.name.trim()] = r.value
    obj.colors = colorObj
  }
  if (fonts.length > 0) {
    const fontObj: Record<string, unknown> = {}
    for (const f of fonts)
      if (f.role.trim()) {
        fontObj[f.role.trim()] = {
          family: f.family,
          ...(f.weight ? { weight: f.weight } : {}),
          ...(f.size ? { size: f.size } : {}),
        }
      }
    obj.typography = fontObj
  }
  if (spacing.length > 0) {
    const spObj: Record<string, string> = {}
    for (const r of spacing) if (r.name.trim()) spObj[r.name.trim()] = r.value
    obj.spacing = spObj
  }
  if (radius.length > 0) {
    const rObj: Record<string, string> = {}
    for (const r of radius) if (r.name.trim()) rObj[r.name.trim()] = r.value
    obj.radius = rObj
  }
  return obj
}

export default function DesignSystemFormModal({
  agentId,
  initial,
  onClose,
  onSaved,
}: DesignSystemFormModalProps) {
  const isEdit = initial != null
  const initialRows = initial ? tokensToRows(initial.tokens) : {
    colors: [{ name: 'primary', value: '#1A1A1A' }],
    fonts: [{ role: 'sans', family: 'Pretendard' }],
    spacing: [],
    radius: [],
  }

  const [mode, setMode] = useState<Mode>('form')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [principles, setPrinciples] = useState(initial?.principles ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [colors, setColors] = useState<ColorRow[]>(initialRows.colors.length > 0 ? initialRows.colors : [{ name: '', value: '' }])
  const [fonts, setFonts] = useState<FontRow[]>(initialRows.fonts.length > 0 ? initialRows.fonts : [{ role: '', family: '' }])
  const [spacing, setSpacing] = useState<SpacingRow[]>(initialRows.spacing)
  const [radius, setRadius] = useState<SpacingRow[]>(initialRows.radius)
  const [components, setComponents] = useState<ComponentRow[]>(
    Array.isArray(initial?.components)
      // deno-lint-ignore no-explicit-any
      ? (initial!.components as any[]).map((c) => ({ name: c.name ?? '', purpose: c.purpose ?? '', notes: c.notes }))
      : [],
  )

  const [jsonText, setJsonText] = useState(initial?.source_raw ?? '')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleJsonApply() {
    setJsonError(null)
    const r = parseDesignTokensJson(jsonText)
    if (!r.ok) {
      setJsonError(r.error ?? '파싱 실패')
      return
    }
    const rows = tokensToRows(r.tokens ?? {})
    setColors(rows.colors.length > 0 ? rows.colors : [{ name: '', value: '' }])
    setFonts(rows.fonts.length > 0 ? rows.fonts : [{ role: '', family: '' }])
    setSpacing(rows.spacing)
    setRadius(rows.radius)
    if (Array.isArray(r.components)) {
      // deno-lint-ignore no-explicit-any
      setComponents(r.components.map((c: any) => ({ name: c.name ?? '', purpose: c.purpose ?? '', notes: c.notes })))
    }
    setMode('form')
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('이름은 필수입니다')
      return
    }
    setSaving(true)
    setError(null)
    const tokens = rowsToTokens(colors, fonts, spacing, radius)
    const componentList = components.filter((c) => c.name.trim()).map((c) => ({
      name: c.name.trim(),
      purpose: c.purpose.trim(),
      ...(c.notes?.trim() ? { notes: c.notes.trim() } : {}),
    }))
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      tokens,
      components: componentList,
      principles: principles.trim() || null,
      source_raw: jsonText.trim() || null,
      active,
    }
    const result = isEdit
      ? await updateDesignSystem(initial!.id, payload, agentId)
      : await createDesignSystem(agentId, payload)
    if (!result.ok) {
      setError(result.error ?? '저장 실패')
      setSaving(false)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{isEdit ? '디자인 시스템 편집' : '디자인 시스템 추가'}</h2>
            <p className="text-xs text-gray-500 mt-1">
              활성화된 항목은 시안 생성 시 자동으로 첨부됩니다 (에이전트당 동시에 하나).
            </p>
          </div>
          <div className="flex items-center gap-1 border border-border rounded">
            <button
              onClick={() => setMode('form')}
              className={`text-xs px-3 py-1.5 ${mode === 'form' ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}
            >
              폼 입력
            </button>
            <button
              onClick={() => setMode('json')}
              className={`text-xs px-3 py-1.5 ${mode === 'json' ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}
            >
              JSON paste
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 공통 메타 */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">이름 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: Allrounder DS v1"
                className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm pb-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded"
              />
              활성
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이 디자인 시스템의 적용 범위·맥락"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {mode === 'json' ? (
            <>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">디자인 토큰 JSON</label>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={16}
                  placeholder='{"colors":{"primary":"#1A1A1A"},"typography":{"sans":{"family":"Pretendard"}}, ...}'
                  className="w-full border border-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Tokens Studio, Style Dictionary, Tailwind config, 또는 평면 JSON 등 자동 인식.
                </p>
                {jsonError && (
                  <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
                    ⚠ {jsonError}
                  </div>
                )}
              </div>
              <button
                onClick={handleJsonApply}
                className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-90"
              >
                폼으로 변환 적용
              </button>
            </>
          ) : (
            <>
              {/* 색상 */}
              <Section title="색상" onAdd={() => setColors([...colors, { name: '', value: '' }])}>
                {colors.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded border border-border shrink-0"
                      style={{ backgroundColor: row.value || 'transparent' }}
                    />
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => {
                        const next = [...colors]
                        next[idx] = { ...next[idx], name: e.target.value }
                        setColors(next)
                      }}
                      placeholder="primary"
                      className="border border-border rounded px-2 py-1 text-xs flex-1 font-mono"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => {
                        const next = [...colors]
                        next[idx] = { ...next[idx], value: e.target.value }
                        setColors(next)
                      }}
                      placeholder="#1A1A1A"
                      className="border border-border rounded px-2 py-1 text-xs w-28 font-mono"
                    />
                    <button
                      onClick={() => setColors(colors.filter((_, i) => i !== idx))}
                      className="text-[10px] text-gray-400 hover:text-warning px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </Section>

              {/* 폰트 */}
              <Section title="폰트·타이포" onAdd={() => setFonts([...fonts, { role: '', family: '' }])}>
                {fonts.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1.5fr_0.8fr_0.8fr_auto] gap-1 items-center">
                    <input
                      type="text"
                      value={row.role}
                      onChange={(e) => {
                        const next = [...fonts]
                        next[idx] = { ...next[idx], role: e.target.value }
                        setFonts(next)
                      }}
                      placeholder="h1 / body / sans"
                      className="border border-border rounded px-2 py-1 text-xs font-mono"
                    />
                    <input
                      type="text"
                      value={row.family}
                      onChange={(e) => {
                        const next = [...fonts]
                        next[idx] = { ...next[idx], family: e.target.value }
                        setFonts(next)
                      }}
                      placeholder="Pretendard"
                      className="border border-border rounded px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={row.weight ?? ''}
                      onChange={(e) => {
                        const next = [...fonts]
                        next[idx] = { ...next[idx], weight: e.target.value }
                        setFonts(next)
                      }}
                      placeholder="600"
                      className="border border-border rounded px-2 py-1 text-xs font-mono"
                    />
                    <input
                      type="text"
                      value={row.size ?? ''}
                      onChange={(e) => {
                        const next = [...fonts]
                        next[idx] = { ...next[idx], size: e.target.value }
                        setFonts(next)
                      }}
                      placeholder="14px"
                      className="border border-border rounded px-2 py-1 text-xs font-mono"
                    />
                    <button
                      onClick={() => setFonts(fonts.filter((_, i) => i !== idx))}
                      className="text-[10px] text-gray-400 hover:text-warning px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </Section>

              {/* 간격 */}
              <Section title="간격(Spacing)" onAdd={() => setSpacing([...spacing, { name: '', value: '' }])}>
                {spacing.map((row, idx) => (
                  <KeyValueRow
                    key={idx}
                    row={row}
                    onChange={(r) => {
                      const n = [...spacing]
                      n[idx] = r
                      setSpacing(n)
                    }}
                    onRemove={() => setSpacing(spacing.filter((_, i) => i !== idx))}
                    placeholderName="md"
                    placeholderValue="16px"
                  />
                ))}
              </Section>

              {/* 라운드 */}
              <Section title="모서리 둥글기(Radius)" onAdd={() => setRadius([...radius, { name: '', value: '' }])}>
                {radius.map((row, idx) => (
                  <KeyValueRow
                    key={idx}
                    row={row}
                    onChange={(r) => {
                      const n = [...radius]
                      n[idx] = r
                      setRadius(n)
                    }}
                    onRemove={() => setRadius(radius.filter((_, i) => i !== idx))}
                    placeholderName="md"
                    placeholderValue="8px"
                  />
                ))}
              </Section>

              {/* 컴포넌트 */}
              <Section title="컴포넌트 카탈로그" onAdd={() => setComponents([...components, { name: '', purpose: '', notes: '' }])}>
                {components.map((row, idx) => (
                  <div key={idx} className="border border-border rounded p-2 space-y-1">
                    <div className="grid grid-cols-[1fr_2fr_auto] gap-1">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => {
                          const n = [...components]
                          n[idx] = { ...n[idx], name: e.target.value }
                          setComponents(n)
                        }}
                        placeholder="PrimaryButton"
                        className="border border-border rounded px-2 py-1 text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={row.purpose}
                        onChange={(e) => {
                          const n = [...components]
                          n[idx] = { ...n[idx], purpose: e.target.value }
                          setComponents(n)
                        }}
                        placeholder="용도"
                        className="border border-border rounded px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => setComponents(components.filter((_, i) => i !== idx))}
                        className="text-[10px] text-gray-400 hover:text-warning px-1"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="text"
                      value={row.notes ?? ''}
                      onChange={(e) => {
                        const n = [...components]
                        n[idx] = { ...n[idx], notes: e.target.value }
                        setComponents(n)
                      }}
                      placeholder="메모 (상태·예외·접근성)"
                      className="border border-border rounded px-2 py-1 text-xs w-full"
                    />
                  </div>
                ))}
              </Section>

              {/* 원칙 */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">원칙·금기사항 (자유 텍스트)</label>
                <textarea
                  value={principles}
                  onChange={(e) => setPrinciples(e.target.value)}
                  rows={4}
                  placeholder={'예) 그림자는 단일 단계만 사용\n예) 한국어 가독성을 위해 line-height 1.5 이상'}
                  className="w-full border border-border rounded px-3 py-2 text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </>
          )}

          {error && (
            <div className="p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
              ⚠ {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded border border-border hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-sm rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '저장 중...' : isEdit ? '변경 저장' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface SectionProps {
  title: string
  onAdd: () => void
  children: React.ReactNode
}

function Section({ title, onAdd, children }: SectionProps) {
  return (
    <div className="border border-border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-700">{title}</div>
        <button
          onClick={onAdd}
          className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-gray-50"
        >
          + 항목
        </button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

interface KVRowProps {
  row: { name: string; value: string }
  onChange: (r: { name: string; value: string }) => void
  onRemove: () => void
  placeholderName: string
  placeholderValue: string
}

function KeyValueRow({ row, onChange, onRemove, placeholderName, placeholderValue }: KVRowProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={row.name}
        onChange={(e) => onChange({ ...row, name: e.target.value })}
        placeholder={placeholderName}
        className="border border-border rounded px-2 py-1 text-xs flex-1 font-mono"
      />
      <input
        type="text"
        value={row.value}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        placeholder={placeholderValue}
        className="border border-border rounded px-2 py-1 text-xs w-28 font-mono"
      />
      <button onClick={onRemove} className="text-[10px] text-gray-400 hover:text-warning px-1">
        ✕
      </button>
    </div>
  )
}
