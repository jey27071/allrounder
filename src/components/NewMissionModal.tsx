import { useState } from 'react'
import { createMission } from '@/lib/missions'
import type { Mission } from '@/types/app'

interface NewMissionModalProps {
  open: boolean
  onClose: () => void
  onCreated: (mission: Mission) => void
}

const TEMPLATE = {
  title: '디자이너 도구 0→1',
  domain: '디자이너/크리에이터를 위한 도구',
  charter: '도메인 내 유망 하위 영역 5개를 다차원 평가로 발굴·제안하라.',
  context:
    '디렉터: 시니어 UI/UX 디자이너 / 1인 운영 환경 / Figma·Notion·Slack 사용 / 가장 큰 페인은 [작성]',
}

export default function NewMissionModal({ open, onClose, onCreated }: NewMissionModalProps) {
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState('')
  const [charter, setCharter] = useState('')
  const [context, setContext] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function applyTemplate() {
    setTitle(TEMPLATE.title)
    setDomain(TEMPLATE.domain)
    setCharter(TEMPLATE.charter)
    setContext(TEMPLATE.context)
  }

  function reset() {
    setTitle('')
    setDomain('')
    setCharter('')
    setContext('')
    setError(null)
  }

  async function handleSubmit() {
    if (!title.trim() || !domain.trim() || !charter.trim()) {
      setError('제목·도메인·임무는 필수입니다.')
      return
    }
    setSubmitting(true)
    setError(null)
    const mission = await createMission({
      title: title.trim(),
      domain: domain.trim(),
      charter: charter.trim(),
      context: context.trim() || undefined,
    })
    setSubmitting(false)

    if (!mission) {
      setError('미션 생성 실패. 콘솔을 확인해주세요.')
      return
    }

    onCreated(mission)
    reset()
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">새 미션 시작</h2>
            <p className="text-xs text-gray-500 mt-1">자비스에게 어떤 일을 시킬지 정의해주세요.</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-primary transition text-xl">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">미션 제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 디자이너 도구 0→1"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">도메인 *</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="예: 디자이너/크리에이터를 위한 도구"
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">임무 (미션 헌장) *</label>
            <textarea
              value={charter}
              onChange={(e) => setCharter(e.target.value)}
              placeholder="이 도메인에서 무엇을 발굴·설계할지 명확히 적어주세요."
              rows={3}
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">컨텍스트 (선택)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="조직 규모·도구·페인 등 자비스가 알아야 할 배경."
              rows={4}
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <button onClick={applyTemplate} className="text-xs text-gray-500 hover:text-primary transition underline">
            🎯 미션 헌장 템플릿 적용
          </button>

          {error && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
              ⚠ {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex items-center justify-between bg-gray-50">
          <div className="text-xs text-gray-400">
            예상 비용: ~$0.60 / 사이클 (LLM 연동 후)
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-gray-100 transition disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded bg-primary text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? '시작 중...' : '시작하기 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
