import { useEffect, useState } from 'react'
import { getLatestDeliverable } from '@/lib/deliverables'
import { decideCp2 } from '@/lib/orchestrate'
import type { Mission } from '@/types/app'

interface Cp2ModalProps {
  mission: Mission
  onClose: () => void
}

export default function Cp2Modal({ mission, onClose }: Cp2ModalProps) {
  const [blueprintMd, setBlueprintMd] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviseComments, setReviseComments] = useState('')
  const [showReviseInput, setShowReviseInput] = useState(false)

  useEffect(() => {
    void loadData()
  }, [mission.id])

  async function loadData() {
    setLoading(true)
    const d = await getLatestDeliverable(mission.id, 'product_blueprint')
    if (d) setBlueprintMd(d.raw_markdown ?? '')
    setLoading(false)
  }

  async function handleApprove() {
    setSubmitting(true)
    setError(null)
    const result = await decideCp2(mission.id, 'approve')
    if (!result.ok) {
      setError(result.error ?? '승인 실패')
      setSubmitting(false)
      return
    }
    onClose()
  }

  async function handleRevise() {
    if (!showReviseInput) {
      setShowReviseInput(true)
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await decideCp2(mission.id, 'revise', reviseComments || undefined)
    if (!result.ok) {
      setError(result.error ?? '수정 요청 실패')
      setSubmitting(false)
      return
    }
    onClose()
  }

  function handleDownload() {
    const blob = new Blob([blueprintMd], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${mission.title}-Blueprint.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border">
          <div className="text-xs font-bold text-agent-jarvis mb-1">★ CP2 — 디렉터의 최종 검토</div>
          <h2 className="text-lg font-bold">{mission.title}</h2>
          <p className="text-sm text-gray-500 mt-1">아키의 Product Blueprint v1.0을 검토하고 결정해주세요.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-sm text-gray-500">불러오는 중...</div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{blueprintMd}</pre>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-3 p-3 bg-warning/10 border border-warning/30 rounded text-xs text-warning">⚠ {error}</div>
        )}

        {showReviseInput && (
          <div className="px-6 pb-3">
            <label className="text-xs font-medium text-gray-700 mb-1 block">수정 요청 내용</label>
            <textarea
              value={reviseComments}
              onChange={(e) => setReviseComments(e.target.value)}
              rows={3}
              placeholder="구체적으로 어떤 부분을 어떻게 수정해야 할지 적어주세요."
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>
        )}

        <div className="p-4 border-t border-border flex items-center justify-between bg-gray-50">
          <div className="flex gap-2">
            <button onClick={handleDownload} className="px-3 py-2 text-xs rounded border border-border hover:bg-gray-100">
              📥 .md 다운로드
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleRevise()}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-gray-100 disabled:opacity-50"
            >
              {showReviseInput ? '수정 요청 전송' : '🔄 수정 요청'}
            </button>
            <button
              onClick={() => void handleApprove()}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? '진행 중...' : '✅ 승인'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
