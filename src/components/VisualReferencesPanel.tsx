import { useEffect, useState } from 'react'
import {
  listVisualReferences,
  uploadVisualReference,
  setReferenceActive,
  deleteVisualReference,
  getSignedUrl,
  moveReferenceToCollection,
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  setCollectionImagesActive,
  MAX_ACTIVE_REFERENCES,
} from '@/lib/visualReferences'
import type {
  AgentId,
  AgentVisualReference,
  AgentReferenceCollection,
} from '@/types/app'

interface Props {
  agentId: AgentId
}

// 'all' = 전체, null = 미분류, string = 컬렉션 id
type CollectionFilter = 'all' | null | string

interface ItemViewProps {
  ref_: AgentVisualReference
  collections: AgentReferenceCollection[]
  onChanged: () => void
}

function ItemView({ ref_, collections, onChanged }: ItemViewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [showMove, setShowMove] = useState(false)
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
  async function moveTo(cid: string | null) {
    const r = await moveReferenceToCollection(ref_.id, cid)
    if (!r.ok) alert(r.error)
    setShowMove(false)
    onChanged()
  }

  const sizeKB = ref_.file_size ? Math.round(ref_.file_size / 1024) : null

  return (
    <div
      className={`relative border rounded p-2 ${
        ref_.active ? 'border-primary/50 bg-primary/5' : 'border-border bg-white opacity-70'
      }`}
    >
      <div className="aspect-video bg-gray-100 rounded overflow-hidden mb-2 flex items-center justify-center">
        {url ? (
          <img src={url} alt={ref_.name} className="w-full h-full object-contain" />
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
      <div className="flex gap-1">
        <button
          onClick={() => void toggle()}
          className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-50"
        >
          {ref_.active ? '비활성' : '활성'}
        </button>
        <button
          onClick={() => setShowMove((v) => !v)}
          className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-50"
          title="다른 컬렉션으로 이동"
        >
          ↪
        </button>
        <button
          onClick={() => void remove()}
          className="text-[10px] px-1.5 py-0.5 rounded border border-warning/40 text-warning hover:bg-warning/5"
        >
          ✕
        </button>
      </div>
      {showMove && (
        <div className="absolute z-10 left-2 right-2 top-full mt-1 bg-white border border-border rounded shadow-lg p-1 max-h-48 overflow-y-auto">
          <div className="text-[10px] text-gray-400 px-2 py-1">이동:</div>
          <button
            onClick={() => void moveTo(null)}
            className="w-full text-left text-[11px] px-2 py-1 hover:bg-gray-50 rounded"
          >
            (미분류)
          </button>
          {collections.map((c) => (
            <button
              key={c.id}
              onClick={() => void moveTo(c.id)}
              className="w-full text-left text-[11px] px-2 py-1 hover:bg-gray-50 rounded"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VisualReferencesPanel({ agentId }: Props) {
  const [collections, setCollections] = useState<AgentReferenceCollection[]>([])
  const [items, setItems] = useState<AgentVisualReference[]>([])
  const [selectedFilter, setSelectedFilter] = useState<CollectionFilter>('all')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [editingColl, setEditingColl] = useState<AgentReferenceCollection | null>(null)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, selectedFilter])

  async function load() {
    setLoading(true)
    const [cols, list] = await Promise.all([
      listCollections(agentId),
      listVisualReferences(agentId, { collectionId: selectedFilter }),
    ])
    setCollections(cols)
    setItems(list)
    setLoading(false)
  }

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    setUploading(true)
    const cid: string | null =
      selectedFilter === 'all' ? null : (selectedFilter as string | null)
    const arr = Array.from(files)
    for (const file of arr) {
      const r = await uploadVisualReference(agentId, file, { collectionId: cid })
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
    if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files)
  }
  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files)
      e.target.value = ''
    }
  }

  async function handleAddCollection() {
    const name = newCollName.trim()
    if (!name) return
    const r = await createCollection(agentId, { name })
    if (!r.ok) {
      alert(r.error)
      return
    }
    setNewCollName('')
    if (r.collection) setSelectedFilter(r.collection.id)
    void load()
  }

  async function handleDeleteCollection(c: AgentReferenceCollection) {
    if (!confirm(`"${c.name}" 컬렉션을 삭제할까요?\n안 이미지는 (미분류)로 이동되며 보존됩니다.`)) return
    const r = await deleteCollection(c.id)
    if (!r.ok) alert(r.error)
    if (selectedFilter === c.id) setSelectedFilter('all')
    void load()
  }

  async function handleRenameCollection() {
    if (!editingColl) return
    const r = await updateCollection(editingColl.id, { name: editingColl.name })
    if (!r.ok) alert(r.error)
    setEditingColl(null)
    void load()
  }

  async function handleBulkToggle(cid: string | null, active: boolean) {
    const r = await setCollectionImagesActive(agentId, cid, active)
    if (!r.ok) alert(r.error)
    void load()
  }

  const activeCount = items.filter((i) => i.active).length

  if (loading) return <div className="text-xs text-gray-400 p-4">불러오는 중...</div>

  return (
    <div className="grid grid-cols-[200px_1fr] gap-4">
      {/* 좌측: 컬렉션 목록 */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase text-gray-400 tracking-wider mb-1 px-1">
          컬렉션
        </div>
        <CollectionRow
          label="전체"
          icon="📚"
          active={selectedFilter === 'all'}
          onSelect={() => setSelectedFilter('all')}
        />
        <CollectionRow
          label="(미분류)"
          icon="📂"
          active={selectedFilter === null}
          onSelect={() => setSelectedFilter(null)}
        />
        {collections.map((c) => (
          <div key={c.id} className="group">
            {editingColl?.id === c.id ? (
              <div className="flex gap-1 items-center px-1">
                <input
                  value={editingColl.name}
                  onChange={(e) => setEditingColl({ ...editingColl, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRenameCollection()
                    if (e.key === 'Escape') setEditingColl(null)
                  }}
                  autoFocus
                  className="text-xs flex-1 border border-primary rounded px-1.5 py-1"
                />
                <button onClick={() => void handleRenameCollection()} className="text-[10px] px-1">✓</button>
                <button onClick={() => setEditingColl(null)} className="text-[10px] px-1 text-gray-400">✕</button>
              </div>
            ) : (
              <div className="flex items-center group">
                <CollectionRow
                  label={c.name}
                  icon="📁"
                  active={selectedFilter === c.id}
                  onSelect={() => setSelectedFilter(c.id)}
                />
                <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 pr-1">
                  <button
                    onClick={() => setEditingColl(c)}
                    className="text-[9px] px-1 text-gray-400 hover:text-gray-700"
                    title="이름 변경"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => void handleDeleteCollection(c)}
                    className="text-[9px] px-1 text-gray-400 hover:text-warning"
                    title="컬렉션 삭제 (이미지는 보존)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* + 새 컬렉션 */}
        <div className="flex gap-1 px-1 mt-2">
          <input
            value={newCollName}
            onChange={(e) => setNewCollName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCollection()}
            placeholder="+ 새 컬렉션"
            className="text-xs flex-1 border border-border rounded px-2 py-1 focus:border-primary focus:outline-none"
          />
          {newCollName.trim() && (
            <button
              onClick={() => void handleAddCollection()}
              className="text-[10px] px-2 py-1 rounded bg-primary text-white"
            >
              추가
            </button>
          )}
        </div>
      </div>

      {/* 우측: 이미지 그리드 + 업로드 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-gray-500">
            {selectedFilter === 'all' && '전체'}
            {selectedFilter === null && '(미분류)'}
            {typeof selectedFilter === 'string' &&
              selectedFilter !== 'all' &&
              collections.find((c) => c.id === selectedFilter)?.name}
            <span className="ml-2 text-gray-400">
              · {items.length}개 (활성 {activeCount})
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(selectedFilter === null || typeof selectedFilter === 'string') &&
              selectedFilter !== 'all' &&
              items.length > 0 && (
                <>
                  <button
                    onClick={() =>
                      void handleBulkToggle(selectedFilter as string | null, true)
                    }
                    className="text-[10px] px-2 py-1 rounded border border-border hover:bg-gray-50"
                    title="이 컬렉션의 모든 이미지를 활성으로 (한도 내)"
                  >
                    모두 활성
                  </button>
                  <button
                    onClick={() =>
                      void handleBulkToggle(selectedFilter as string | null, false)
                    }
                    className="text-[10px] px-2 py-1 rounded border border-border hover:bg-gray-50"
                  >
                    모두 비활성
                  </button>
                </>
              )}
            <label className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:opacity-90 cursor-pointer ml-1">
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
        </div>

        <div className="text-[10px] text-gray-400 mb-2">
          활성 한도 {MAX_ACTIVE_REFERENCES}장 · PNG/JPG/WebP, 4MB 이하
          {selectedFilter !== 'all' && ' · 업로드 시 현재 컬렉션에 자동 분류'}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded p-4 mb-4 text-center transition ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border bg-gray-50'
          }`}
        >
          <div className="text-xs text-gray-500">
            {uploading
              ? '⏳ 업로드 중...'
              : dragOver
                ? '✨ 여기에 놓으세요'
                : '🖼 이미지를 드래그·드롭'}
          </div>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
            ⚠ {error}
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-6 border border-dashed border-border rounded">
            {selectedFilter === 'all'
              ? '참고 이미지가 없습니다. 컬렉션을 만들고 이미지를 올려보세요.'
              : '이 컬렉션엔 아직 이미지가 없습니다.'}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((it) => (
              <ItemView key={it.id} ref_={it} collections={collections} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CollectionRow({
  label,
  icon,
  active,
  onSelect,
}: {
  label: string
  icon: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex-1 text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 ${
        active ? 'bg-primary text-white' : 'hover:bg-gray-100 text-gray-700'
      }`}
    >
      <span className="text-xs">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
