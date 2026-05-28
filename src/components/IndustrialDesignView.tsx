/**
 * 물리 제품 산업디자인(이지 산출물) 표시 컴포넌트.
 * Cp3Modal에서 mission_type='physical_product'일 때 사용.
 */

import { useEffect, useState } from 'react'
import { getSignedUrl } from '@/lib/visualReferences'

interface Material { part?: string; material?: string; finish?: string }
interface Color { name?: string; hex?: string; rationale?: string }
interface InteractionElement { type?: string; location?: string; behavior?: string }
interface Concept {
  name?: string
  tagline?: string
  form_factor?: string
  materials?: Material[]
  colors?: Color[]
  interaction_elements?: InteractionElement[]
  ergonomics?: string
  reference_aesthetic?: string
  rendering_brief_en?: string
  image_storage_path?: string
}

export interface IndustrialDesignData {
  design_intent?: string
  concepts?: Concept[]
  recommended_concept_index?: number
  common_principles?: string[]
}

interface Props {
  data: IndustrialDesignData
}

export default function IndustrialDesignView({ data }: Props) {
  const concepts = data.concepts ?? []
  const [activeIdx, setActiveIdx] = useState(0)
  const current = concepts[activeIdx]
  const recommended = data.recommended_concept_index ?? 0

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => alert('복사됨'),
      () => alert('복사 실패'),
    )
  }

  if (concepts.length === 0) {
    return <div className="p-6 text-sm text-gray-500">컨셉 데이터 없음</div>
  }

  return (
    <div className="flex h-full">
      {/* 좌측: 컨셉 탭 */}
      <div className="w-56 border-r border-border overflow-y-auto p-4 space-y-2 shrink-0 bg-gray-50">
        <div className="text-xs font-medium text-gray-500 mb-2">컨셉 ({concepts.length})</div>
        {concepts.map((c, i) => (
          <button
            key={i}
            onClick={() => setActiveIdx(i)}
            className={`w-full text-left p-3 rounded border transition ${
              i === activeIdx
                ? 'border-agent-izzy bg-white font-medium'
                : 'border-border bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-gray-400">#{i + 1}</span>
              <span className="text-sm flex-1 truncate">{c.name ?? `컨셉 ${i + 1}`}</span>
              {i === recommended && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-agent-izzy text-white">추천</span>
              )}
            </div>
            {c.tagline && (
              <div className="text-[10px] text-gray-500 mt-1 line-clamp-2">{c.tagline}</div>
            )}
          </button>
        ))}

        {Array.isArray(data.common_principles) && data.common_principles.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="text-[10px] uppercase text-gray-400 tracking-wider mb-2">공통 원칙</div>
            <ul className="text-[11px] text-gray-600 space-y-1">
              {data.common_principles.map((p, i) => (
                <li key={i}>· {p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 우측: 컨셉 상세 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {current && (
          <>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-base">{current.name}</h3>
                {activeIdx === recommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-agent-izzy text-white">추천 컨셉</span>
                )}
              </div>
              {current.tagline && <p className="text-sm text-gray-600 italic">"{current.tagline}"</p>}
            </div>

            {/* Phase 26: Imagen 자동 생성 이미지 */}
            {current.image_storage_path && (
              <ConceptImage path={current.image_storage_path} alt={current.name ?? '컨셉'} />
            )}

            {current.form_factor && (
              <Section title="형태 / 치수">
                <div className="text-sm text-gray-700">{current.form_factor}</div>
              </Section>
            )}

            {Array.isArray(current.materials) && current.materials.length > 0 && (
              <Section title="소재 · 마감">
                <div className="grid grid-cols-1 gap-1.5">
                  {current.materials.map((m, i) => (
                    <div key={i} className="text-sm border border-border rounded p-2 bg-white">
                      <span className="font-medium text-gray-800">{m.part}</span>
                      <span className="text-gray-500 mx-1">·</span>
                      <span className="text-gray-700">{m.material}</span>
                      {m.finish && <span className="text-xs text-gray-500"> ({m.finish})</span>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {Array.isArray(current.colors) && current.colors.length > 0 && (
              <Section title="색상">
                <div className="flex flex-wrap gap-2">
                  {current.colors.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 border border-border rounded px-2 py-1.5 bg-white">
                      <span
                        className="w-5 h-5 rounded border border-border shrink-0"
                        style={{ backgroundColor: c.hex || 'transparent' }}
                      />
                      <div className="text-xs">
                        <div className="font-medium">
                          {c.name} <span className="font-mono text-gray-400">{c.hex}</span>
                        </div>
                        {c.rationale && <div className="text-[10px] text-gray-500">{c.rationale}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {Array.isArray(current.interaction_elements) && current.interaction_elements.length > 0 && (
              <Section title="인터랙션 요소">
                <ul className="text-sm space-y-1.5">
                  {current.interaction_elements.map((e, i) => (
                    <li key={i} className="border border-border rounded p-2 bg-white">
                      <span className="text-xs font-mono text-agent-izzy">{e.type}</span>
                      <span className="text-xs text-gray-400 mx-1">@</span>
                      <span className="text-xs text-gray-700">{e.location}</span>
                      {e.behavior && <div className="text-xs text-gray-600 mt-0.5">{e.behavior}</div>}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {current.ergonomics && (
              <Section title="에르고노믹스">
                <div className="text-sm text-gray-700">{current.ergonomics}</div>
              </Section>
            )}

            {current.reference_aesthetic && (
              <Section title="레퍼런스 미학">
                <div className="text-sm text-gray-700">{current.reference_aesthetic}</div>
              </Section>
            )}

            {current.rendering_brief_en && (
              <Section title="🎨 Midjourney / Imagen 프롬프트 (영문)">
                <div className="bg-gray-900 text-gray-100 rounded p-3 text-xs font-mono whitespace-pre-wrap">
                  {current.rendering_brief_en}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => copyToClipboard(current.rendering_brief_en!)}
                    className="text-xs px-3 py-1 rounded bg-primary text-white hover:opacity-90"
                  >
                    📋 프롬프트 복사
                  </button>
                  <span className="text-[10px] text-gray-500 self-center">
                    Midjourney·Imagen·Leonardo에 그대로 붙여넣으세요
                  </span>
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-400 tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  )
}

function ConceptImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    void getSignedUrl(path).then(setUrl)
  }, [path])
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-gray-50">
      {url ? (
        <img src={url} alt={alt} className="w-full h-auto block" />
      ) : (
        <div className="aspect-square flex items-center justify-center text-xs text-gray-400">
          이미지 로딩 중...
        </div>
      )}
      <div className="px-2 py-1 text-[10px] text-gray-500 border-t border-border bg-white">
        🎨 Imagen 3 자동 생성 · 무드보드용 (정확한 설계도 아님)
      </div>
    </div>
  )
}
