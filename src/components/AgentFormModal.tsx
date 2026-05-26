import { useState } from 'react'
import { createAgent, updateAgentMeta, validateAgentId } from '@/lib/agents'
import { COLOR_TOKEN_OPTIONS, bgForToken } from '@/lib/agentColors'
import type { Agent } from '@/types/app'

interface AgentFormModalProps {
  initial?: Agent | null
  onClose: () => void
  onSaved: () => void
}

const MODEL_OPTIONS = [
  { value: '', label: '기본값 (Edge Function 결정)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (빠름)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (정확)' },
]

export default function AgentFormModal({ initial, onClose, onSaved }: AgentFormModalProps) {
  const isEdit = initial != null
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '')
  const [colorToken, setColorToken] = useState(initial?.color_token ?? 'agent-friday')
  const [model, setModel] = useState(initial?.model ?? '')
  const [deliverableType, setDeliverableType] = useState(initial?.deliverable_type ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!isEdit) {
      const v = validateAgentId(id.trim())
      if (!v.ok) {
        setError(v.error ?? 'ID 형식 오류')
        return
      }
    }
    if (!name.trim() || !role.trim()) {
      setError('이름·역할은 필수입니다')
      return
    }
    if (!isEdit && !systemPrompt.trim()) {
      setError('시스템 프롬프트는 필수입니다')
      return
    }

    setSaving(true)
    setError(null)

    const result = isEdit
      ? await updateAgentMeta(initial!.id, {
          name: name.trim(),
          role: role.trim(),
          description: description.trim() || null,
          color_token: colorToken,
          model: model || null,
          deliverable_type: deliverableType.trim() || null,
        })
      : await createAgent({
          id: id.trim(),
          name: name.trim(),
          role: role.trim(),
          description: description.trim() || undefined,
          system_prompt: systemPrompt,
          color_token: colorToken,
          model: model || undefined,
          deliverable_type: deliverableType.trim() || undefined,
        })

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
          <h2 className="text-lg font-bold">{isEdit ? '에이전트 편집' : '새 에이전트 추가'}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {isEdit
              ? '메타 정보만 수정합니다. 프롬프트는 상세 화면에서 버전으로 관리하세요.'
              : '메인 워크플로우와 별개로 디렉터가 직접 호출하는 전문가 에이전트를 추가합니다.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">ID *</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                disabled={isEdit}
                placeholder="예: research_helper"
                className="w-full border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary disabled:bg-gray-50 disabled:text-gray-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">소문자/숫자/_ 2~32자, 영문 시작</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">이름 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 리서치 보조"
                className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">역할 (Role) *</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="예: Research Assistant"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="짧게 한 줄 (목록에서 보임)"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">시스템 프롬프트 *</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={10}
                placeholder={'# IDENTITY\n# MISSION\n# OUTPUT — JSON only\n# GUARDRAILS'}
                className="w-full border border-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary resize-y"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                JSON 출력 포맷을 명시하면 산출물로 자동 저장됩니다.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">색상</label>
              <div className="grid grid-cols-5 gap-1.5">
                {COLOR_TOKEN_OPTIONS.map((opt) => (
                  <button
                    key={opt.token}
                    type="button"
                    onClick={() => setColorToken(opt.token)}
                    title={opt.label}
                    className={`h-7 rounded border-2 transition ${bgForToken(opt.token)} ${
                      colorToken === opt.token
                        ? 'border-primary scale-110'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">모델</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">산출물 타입</label>
            <input
              type="text"
              value={deliverableType}
              onChange={(e) => setDeliverableType(e.target.value)}
              placeholder="비워두면 custom_report로 저장됨"
              className="w-full border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              자유 식별자. DB에는 항상 custom_report로 들어가고 metadata에 이 값이 기록됩니다.
            </p>
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
