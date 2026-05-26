import { useState } from 'react'
import { createKnowledge, updateKnowledge } from '@/lib/agents'
import type { AgentKnowledge, AgentId } from '@/types/app'

interface KnowledgeFormModalProps {
  agentId: AgentId
  initial?: AgentKnowledge | null
  onClose: () => void
  onSaved: () => void
}

export default function KnowledgeFormModal({
  agentId,
  initial,
  onClose,
  onSaved,
}: KnowledgeFormModalProps) {
  const isEdit = initial != null
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      setError('제목·내용은 필수입니다')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      title: title.trim(),
      content: content.trim(),
      source: source.trim() || null,
      active,
    }
    const result = isEdit
      ? await updateKnowledge(initial!.id, payload)
      : await createKnowledge(agentId, payload)

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
        className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">{isEdit ? '지식 편집' : '지식 추가'}</h2>
          <p className="text-xs text-gray-500 mt-1">
            활성화된 항목은 호출 시 시스템 프롬프트 뒤에 자동으로 첨부됩니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 회사 톤앤매너 가이드"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">내용 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              placeholder="에이전트가 알아야 할 지식·가이드라인·도메인 정보 등"
              className="w-full border border-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary resize-y"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              너무 길면 토큰 한도를 초과할 수 있습니다 (권장 2,000자 이내).
            </p>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">출처 (선택)</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="예: 사내 위키 / 외부 링크 / 문서명"
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
