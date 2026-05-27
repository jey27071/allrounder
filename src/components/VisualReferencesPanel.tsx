import { useEffect, useState } from 'react'
import {
  listVisualReferences,
  uploadVisualReference,
  setReferenceActive,
  deleteVisualReference,
  getSignedUrl,
  MAX_ACTIVE_REFERENCES,
} from '@/lib/visualReferences'
import type { AgentId, AgentVisualReference } from '@/types/app'

interface VisualReferencesPanelProps {
  agentId: AgentId
}

interface ItemViewProps {
  ref_: AgentVisualReference
  onChanged: () => void
}

function ItemView({ ref_, onChanged }: ItemViewProps) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    void getSignedUrl(ref_.storage_path).then(setUrl)
  }, [ref_.storage_path])

  async function toggle() {
    const r = await setReferenceActive(ref_.agent_id, ref_.id, !ref_.active)
    if (!r.ok) alert(r.error)
    onChanged()
  }
  async function remove() {
    if (!confirm(`"${ref_.name}" 삭제할까요?`)) return
    const r = await deleteVisualReference(ref_.id, ref_.storage_path)
    if (!r.ok) alert(r.error)
    onChanged()
  }

  const sizeKB = ref_.file_size ? Math.round(ref_.file_size / 1024) : null

  return (
    <div
      className={`border rounded p-2 ${
        ref_.active ? 'border-primary/50 bg-primary/5' : 'border-border bg-white opacity-70'
      }`}
    >
      <div className="aspect-video bg-gray-100 rounded overflow-hidden mb-2 flex items-center justify-center">
        {url ? (
          <img
            src={url}
            alt={ref_.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <span className="text-[10px] text-gray-400">로딩...</span>
        )}
      </div>
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" title={ref_.name}>
            {ref_.name}
          </div>
          <div className="text-[10px] text-gray-400">
            {ref_.width && ref_.height ? `${ref_.width}×${ref_.height}` : ''}
            {sizeKB && ` · ${sizeKB}KB`}
          </div>
        </div>
        {ref_.active && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-primary text-white shrink-0">활성</span>
        )}
      </div>
      {ref_.description && (
        <div className="text-[10px] text-gray-500 line-clamp-2 mb-1">{ref_.description}</div>
      )}
      <div className="flex gap-1">
        <button
          onClick={() => void toggle()}
          className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-50"
        >
          {ref_.active ? '비활성' : '활성'}
        </button>
        <button
          onClick={() => void remove()}
          className="text-[10px] px-1.5 py-0.5 rounded border border-warning/40 text-warning hover:bg-warning/5"
        >
          삭제
        </button>
      </div>
    </div>
  )
}

export default function VisualReferencesPanel({ agentId }: VisualReferencesPanelProps) {
  const [items, setItems] = useState<AgentVisualReference[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  async function load() {
    setLoading(true)
    const list = await listVisualReferences(agentId)
    setItems(list)
    setLoading(false)
  }

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    setUploading(true)
    const arr = Array.from(files)
    for (const file of arr) {
      const r = await uploadVisualReference(agentId, file)
      if (!r.ok) {
        setError(r.error ?? '업로드 실패')
        break
      }
    }
    setUploading(false)
    void load()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files)
      e.target.value = ''
    }
  }

  const activeCount = items.filter((i) => i.active).length

  if (loading) {
    return <div className="text-xs text-gray-400 p-4">불러오는 중...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium text-gray-500">
          참고 이미지 ({items.length}개 · 활성 {activeCount}/{MAX_ACTIVE_REFERENCES})
          <span className="ml-2 text-[10px] text-gray-400">
            — 활성 항목은 호출 시 시스템에 첨부됩니다
          </span>
        </div>
        <label className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:opacity-90 cursor-pointer">
          + 이미지 추가
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            multiple
            onChange={onFileInput}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {/* 드래그·드롭 영역 */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded p-6 mb-4 text-center transition ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border bg-gray-50'
        }`}
      >
        <div className="text-xs text-gray-500">
          {uploading
            ? '⏳ 업로드 중...'
            : dragOver
              ? '✨ 여기에 놓으세요'
              : '🖼 이미지 파일을 여기로 드래그·드롭하거나 위 버튼 사용 · PNG/JPG/WebP, 4MB 이하'}
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
          ⚠ {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-6 border border-dashed border-border rounded">
          참고 이미지가 없습니다. 디자인 시스템 캡처·컴포넌트 카탈로그·레퍼런스 등을 올리세요.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => (
            <ItemView key={it.id} ref_={it} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}
