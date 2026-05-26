import { useState } from 'react'
import { saveAgentPromptVersion, suggestNextVersion } from '@/lib/agents'
import type { AgentId } from '@/types/app'

interface PromptVersionModalProps {
  agentId: AgentId
  currentVersion: string
  draftPrompt: string
  onClose: () => void
  onSaved: () => void
}

export default function PromptVersionModal({
  agentId,
  currentVersion,
  draftPrompt,
  onClose,
  onSaved,
}: PromptVersionModalProps) {
  const [version, setVersion] = useState(suggestNextVersion(currentVersion))
  const [changelog, setChangelog] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await saveAgentPromptVersion(agentId, version.trim(), draftPrompt, changelog.trim() || undefined)
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
        className="bg-white rounded-lg shadow-lg w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">새 버전으로 저장</h2>
          <p className="text-xs text-gray-500 mt-1">
            현재 버전 <code className="font-mono">{currentVersion}</code> → 새 버전으로 기록됩니다.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">새 버전 *</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder={suggestNextVersion(currentVersion)}
              className="w-full border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">변경 사항 (선택)</label>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              rows={4}
              placeholder="무엇을 어떻게 바꿨는지"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
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
            {saving ? '저장 중...' : '버전 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
