import { useState } from 'react'
import { createWisdom, updateWisdom } from '@/lib/wisdom'
import type { WisdomPrinciple, AgentId } from '@/types/app'

interface WisdomFormModalProps {
  initial?: WisdomPrinciple | null
  onClose: () => void
  onSaved: () => void
}

const AGENT_OPTIONS: { id: AgentId; label: string; kind: 'core' | 'specialist' }[] = [
  { id: 'jarvis', label: 'Jarvis', kind: 'core' },
  { id: 'lumi', label: 'Lumi', kind: 'core' },
  { id: 'aki', label: 'Aki', kind: 'core' },
  { id: 'joi', label: 'Joi', kind: 'core' },
  { id: 'friday', label: 'Friday', kind: 'specialist' },
  { id: 'tars', label: 'TARS', kind: 'specialist' },
  { id: 'echo', label: 'Echo', kind: 'specialist' },
  { id: 'kitt', label: 'KITT', kind: 'specialist' },
  { id: 'ethica', label: 'Ethica', kind: 'specialist' },
  { id: 'qa_bot', label: 'QA봇', kind: 'specialist' },
  { id: 'wordy', label: 'Wordy (UX 라이팅)', kind: 'specialist' },
]

export default function WisdomFormModal({ initial, onClose, onSaved }: WisdomFormModalProps) {
  const isEdit = initial != null
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [appliesTo, setAppliesTo] = useState<AgentId[]>(initial?.applies_to ?? [])
  const [active, setActive] = useState(initial?.active ?? true)
  const [version, setVersion] = useState(initial?.version ?? 'v1.0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleAgent(id: AgentId) {
    setAppliesTo((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]))
  }

  function toggleAll(kind: 'core' | 'specialist' | 'all') {
    const target =
      kind === 'all'
        ? AGENT_OPTIONS.map((a) => a.id)
        : AGENT_OPTIONS.filter((a) => a.kind === kind).map((a) => a.id)
    const allSelected = target.every((id) => appliesTo.includes(id))
    if (allSelected) {
      setAppliesTo((prev) => prev.filter((id) => !target.includes(id)))
    } else {
      setAppliesTo((prev) => Array.from(new Set([...prev, ...target])))
    }
  }

  async function handleSave() {
    if (!title.trim() || !description.trim() || appliesTo.length === 0) {
      setError('제목·설명·적용 대상은 모두 필수입니다')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      title: title.trim(),
      description: description.trim(),
      applies_to: appliesTo,
      version,
      active,
    }

    const result = isEdit
      ? await updateWisdom(initial!.id, payload)
      : await createWisdom(payload)

    if (!result.ok) {
      setError(result.error ?? '저장 실패')
      setSaving(false)
      return
    }
    onSaved()
    onClose()
  }

  const coreIds = AGENT_OPTIONS.filter((a) => a.kind === 'core').map((a) => a.id)
  const specIds = AGENT_OPTIONS.filter((a) => a.kind === 'specialist').map((a) => a.id)
  const allCoreSelected = coreIds.every((id) => appliesTo.includes(id))
  const allSpecSelected = specIds.every((id) => appliesTo.includes(id))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">{isEdit ? '지혜 편집' : '지혜 추가'}</h2>
          <p className="text-xs text-gray-500 mt-1">
            적용 대상 에이전트의 system prompt에 자동으로 주입됩니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='예: "약점은 자수해도 약점이다"'
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">설명 *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="원리의 본질, 위반 시 문제, 적용 예시 등 구체적으로"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">적용 대상 * ({appliesTo.length})</label>
              <div className="flex gap-1">
                <button
                  onClick={() => toggleAll('core')}
                  className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-gray-50"
                >
                  {allCoreSelected ? 'Core 해제' : 'Core 전체'}
                </button>
                <button
                  onClick={() => toggleAll('specialist')}
                  className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-gray-50"
                >
                  {allSpecSelected ? 'Spec 해제' : 'Spec 전체'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {AGENT_OPTIONS.map((opt) => {
                const selected = appliesTo.includes(opt.id)
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleAgent(opt.id)}
                    className={`text-xs px-2 py-1.5 rounded border transition text-left ${
                      selected
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {opt.label}
                    {opt.kind === 'specialist' && (
                      <span className="text-[9px] opacity-60 ml-1">spec</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">버전</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="v1.0"
                className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">상태</label>
              <div className="flex items-center gap-2 mt-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded"
                  />
                  활성 (LLM에 주입)
                </label>
              </div>
            </div>
          </div>

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
