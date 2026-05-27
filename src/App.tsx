import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import MonitorPanel from '@/components/MonitorPanel'
import MissionsPage from '@/pages/MissionsPage'
import AgentsPage from '@/pages/AgentsPage'
import HistoryPage from '@/pages/HistoryPage'
import SettingsPage from '@/pages/SettingsPage'
import ScreensFullscreenPage from '@/pages/ScreensFullscreenPage'
import ErrorBoundary from '@/components/ErrorBoundary'
import type { Mission } from '@/types/app'

export type PageKey = 'missions' | 'history' | 'agents' | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<PageKey>('missions')
  const [activeMission, setActiveMission] = useState<Mission | null>(null)
  const [newMissionModalOpen, setNewMissionModalOpen] = useState(false)

  function handleNewMission() {
    setCurrentPage('missions')
    setNewMissionModalOpen(true)
  }

  // URL ?view=screens&did=... 진입 시 풀화면 페이지 (디태치 모드)
  // hooks 호출 뒤에서 분기 (React 규칙)
  const params = new URLSearchParams(window.location.search)
  if (params.get('view') === 'screens') {
    const did = params.get('did')
    if (did) {
      return (
        <ErrorBoundary label="시안 풀화면">
          <ScreensFullscreenPage deliverableId={did} />
        </ErrorBoundary>
      )
    }
  }

  return (
    <div className="min-h-screen bg-surface text-primary font-sans">
      <div className="grid grid-cols-[240px_1fr_320px] h-screen overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onNewMission={handleNewMission} />

        <div className="overflow-hidden h-screen flex flex-col">
          <ErrorBoundary label="페이지">
            {currentPage === 'missions' && (
              <MissionsPage
                onMissionChange={setActiveMission}
                openModal={newMissionModalOpen}
                onCloseModal={() => setNewMissionModalOpen(false)}
              />
            )}
            {currentPage === 'history' && <HistoryPage />}
            {currentPage === 'agents' && <AgentsPage />}
            {currentPage === 'settings' && <SettingsPage />}
          </ErrorBoundary>
        </div>

        <ErrorBoundary label="모니터 패널">
          <MonitorPanel mission={currentPage === 'missions' ? activeMission : null} />
        </ErrorBoundary>
      </div>
    </div>
  )
}

export default App
