import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { seedDatabase } from '@/lib/seed'
import { listMissions, getMission } from '@/lib/missions'
import type { Mission } from '@/types/app'
import NewMissionModal from '@/components/NewMissionModal'
import MissionChat from '@/components/MissionChat'
import MissionListCard from '@/components/MissionListCard'

interface MissionsPageProps {
  onMissionChange?: (mission: Mission | null) => void
  openModal: boolean
  onCloseModal: () => void
}

export default function MissionsPage({ onMissionChange, openModal, onCloseModal }: MissionsPageProps) {
  const [missions, setMissions] = useState<Mission[]>([])
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupError, setSetupError] = useState<string | null>(null)

  useEffect(() => {
    void initialize()
  }, [])

  useEffect(() => {
    onMissionChange?.(selectedMission)
  }, [selectedMission, onMissionChange])

  useEffect(() => {
    if (!supabase) return

    // Realtime: missions 테이블 변화 구독
    const channel = supabase
      .channel('missions-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => {
        void reloadMissions()
      })
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [])

  async function initialize() {
    if (!isSupabaseConfigured || !supabase) {
      setSetupError('Supabase 미설정')
      setLoading(false)
      return
    }

    // 시드 (멱등적 — 이미 있으면 스킵)
    await seedDatabase()

    // 미션 로드
    const list = await listMissions()
    setMissions(list)
    if (list.length > 0) {
      setSelectedMission(list[0])
    }
    setLoading(false)
  }

  async function reloadMissions() {
    const list = await listMissions()
    setMissions(list)
    // Closure 이슈 회피: 함수형 setState로 현재값 기준 업데이트
    setSelectedMission((current) => {
      if (!current) return current
      return list.find((m) => m.id === current.id) ?? current
    })
  }

  function handleMissionCreated(mission: Mission) {
    setMissions((prev) => [mission, ...prev])
    setSelectedMission(mission)
    onCloseModal()
  }

  async function handleSelectMission(mission: Mission) {
    // 최신 상태로 다시 fetch
    const fresh = await getMission(mission.id)
    setSelectedMission(fresh ?? mission)
  }

  if (setupError) {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold mb-2">미션</h1>
        <div className="mt-4 p-4 bg-warning/10 border border-warning/30 rounded text-sm text-warning max-w-2xl">
          ⚠ {setupError}. 설정 페이지를 확인해주세요.
        </div>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold mb-2">미션</h1>
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      </main>
    )
  }

  return (
    <>
      <main className="flex h-full overflow-hidden">
        {/* Mission list */}
        <div className="w-64 border-r border-border overflow-y-auto p-4 space-y-2 shrink-0">
          <div className="text-xs font-medium text-gray-500 px-1 mb-2">
            미션 ({missions.length})
          </div>
          {missions.length === 0 ? (
            <div className="text-xs text-gray-400 px-1 mt-4">
              미션이 없습니다.<br />좌측 사이드바의 [+ 새 미션]에서 시작하세요.
            </div>
          ) : (
            missions.map((m) => (
              <MissionListCard
                key={m.id}
                mission={m}
                isSelected={selectedMission?.id === m.id}
                onClick={() => void handleSelectMission(m)}
              />
            ))
          )}
        </div>

        {/* Mission detail or empty state */}
        <div className="flex-1 overflow-hidden">
          {selectedMission ? (
            <MissionChat mission={selectedMission} />
          ) : (
            <div className="p-10 h-full flex flex-col items-center justify-center text-center">
              <div className="text-3xl mb-4">🎯</div>
              <h2 className="text-xl font-bold mb-2">첫 미션을 시작해보세요</h2>
              <p className="text-sm text-gray-500 max-w-md">
                좌측 사이드바의 [+ 새 미션]을 클릭하거나, 미션 헌장 템플릿으로 빠르게 시작할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </main>

      <NewMissionModal open={openModal} onClose={onCloseModal} onCreated={handleMissionCreated} />
    </>
  )
}
