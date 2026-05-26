import { useState } from 'react'
import { createExample, updateExample } from '@/lib/agents'
import type { AgentExample, AgentId } from '@/types/app'

interface ExampleFormModalProps {
  agentId: AgentId
  initial?: AgentExample | null
  onClose: () => void
  onSaved: () => void
}

export default function ExampleFormModal({
  agentId,
  initial,
  onClose,
  onSaved,
}: ExampleFormModalProps) {
  const isEdit = initial != null
  const [label, setLabel] = useState(initial?.label ?? '')
  const [input, setInput] = useState(initial?.input ?? '')
  const [output, setOutput] = useState(initial?.output ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!input.trim() || !output.trim()) {
      setError('입력·출력 모두 필수입니다')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      label: label.trim() || null,
      input: input.trim(),
      output: output.trim(),
      notes: notes.trim() || null,
      active,
    }
    const result = isEdit
      ? await updateExample(initial!.id, payload)
      : await createExample(agentId, payload)
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
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">{isEdit ? '예시 편집' : 'few-shot 예시 추가'}</h2>
          <p className="text-xs text-gray-500 mt-1">
            "이런 입력이 오면 이런 출력을 만들어라" 형태로 학습됩니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">라벨 (선택)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 시장 분석 - B2C"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">입력 (예시 질문/상황) *</label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={10}
                placeholder={'예시 입력을 그대로 작성'}
                className="w-full border border-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary resize-y"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">이상적 출력 *</label>
              <textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                rows={10}
                placeholder={'기대하는 출력 (JSON이라면 JSON 형식 그대로)'}
                className="w-full border border-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary resize-y"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">메모 (선택)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="이 예시의 의도·주의점"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded"
            />
            활성 (호출 시 주입)
          </label>

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
