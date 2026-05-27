import { useEffect, useState } from 'react'
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

const SIDEBAR_OPEN = 240
const SIDEBAR_COLLAPSED = 56
const MONITOR_OPEN = 320
const MONITOR_COLLAPSED = 40

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  return v === null ? fallback : v === 'true'
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageKey>('missions')
  const [activeMission, setActiveMission] = useState<Mission | null>(null)

  // Phase 21: 사이드바·모니터 접기 상태 (localStorage 보존)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readBool('ui.sidebarCollapsed', false))
  const [monitorCollapsed, setMonitorCollapsed] = useState(() => readBool('ui.monitorCollapsed', false))

  useEffect(() => {
    window.localStorage.setItem('ui.sidebarCollapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])
  useEffect(() => {
    window.localStorage.setItem('ui.monitorCollapsed', String(monitorCollapsed))
  }, [monitorCollapsed])

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

  // 미션 페이지가 아니면 모니터 패널을 강제로 접음 (사용자 토글은 미션 페이지에서만 의미)
  const effectiveMonitorCollapsed = currentPage !== 'missions' ? true : monitorCollapsed

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_OPEN
  const monitorWidth = effectiveMonitorCollapsed ? MONITOR_COLLAPSED : MONITOR_OPEN

  return (
    <div className="min-h-screen bg-surface text-primary font-sans">
      <div
        className="grid h-screen overflow-hidden"
        style={{ gridTemplateColumns: `${sidebarWidth}px 1fr ${monitorWidth}px` }}
      >
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        <div className="overflow-hidden h-screen flex flex-col">
          <ErrorBoundary label="페이지">
            {currentPage === 'missions' && (
              <MissionsPage onMissionChange={setActiveMission} />
            )}
            {currentPage === 'history' && <HistoryPage />}
            {currentPage === 'agents' && <AgentsPage />}
            {currentPage === 'settings' && <SettingsPage />}
          </ErrorBoundary>
        </div>

        <ErrorBoundary label="모니터 패널">
          <MonitorPanel
            mission={currentPage === 'missions' ? activeMission : null}
            collapsed={effectiveMonitorCollapsed}
            onToggleCollapse={
              currentPage === 'missions' ? () => setMonitorCollapsed((v) => !v) : undefined
            }
          />
        </ErrorBoundary>
      </div>
    </div>
  )
}

export default App
