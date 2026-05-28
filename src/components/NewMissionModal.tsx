import { useState } from 'react'
import { createMission } from '@/lib/missions'
import type { Mission, MissionType } from '@/types/app'

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
  const [missionType, setMissionType] = useState<MissionType>('ui_design')
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
    setMissionType('ui_design')
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
      mission_type: missionType,
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
          {/* Phase 25: 미션 타입 선택 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">미션 타입 *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMissionType('ui_design')}
                className={`text-left p-3 rounded border-2 transition ${
                  missionType === 'ui_design'
                    ? 'border-agent-joi bg-agent-joi/5'
                    : 'border-border hover:border-gray-400'
                }`}
              >
                <div className="text-sm font-medium mb-0.5">💻 UI 디자인</div>
                <div className="text-[11px] text-gray-500 leading-snug">
                  웹·앱·SaaS. 조이가 HTML 시안 작성
                </div>
              </button>
              <button
                onClick={() => setMissionType('physical_product')}
                className={`text-left p-3 rounded border-2 transition ${
                  missionType === 'physical_product'
                    ? 'border-agent-izzy bg-agent-izzy/5'
                    : 'border-border hover:border-gray-400'
                }`}
              >
                <div className="text-sm font-medium mb-0.5">📦 물리 제품</div>
                <div className="text-[11px] text-gray-500 leading-snug">
                  가전·IoT·액세서리. 이지가 산업디자인 명세
                </div>
              </button>
            </div>
            {missionType === 'physical_product' && (
              <div className="mt-2 text-[10px] text-gray-500 leading-relaxed">
                💡 메카(하드웨어)·포지(제조성)·파코(패키징)는 디렉터가 [팀원 호출]에서 추가로 부르실 수 있어요. Gemini는 렌더링·도면을 직접 생성하지 못하니 명세 위주(Midjourney 프롬프트·치수·소재).
              </div>
            )}
          </div>

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
