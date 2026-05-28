/**
 * agent 색상 토큰을 Tailwind 정적 클래스로 매핑한다.
 * Tailwind는 빌드 타임에 클래스를 정적으로 스캔하므로 동적 문자열
 * 보간(`bg-${token}`)을 쓸 수 없다. 모든 후보를 명시.
 */

export type ColorToken =
  | 'agent-jarvis'
  | 'agent-lumi'
  | 'agent-aki'
  | 'agent-joi'
  | 'agent-friday'
  | 'agent-tars'
  | 'agent-echo'
  | 'agent-kitt'
  | 'agent-ethica'
  | 'agent-qa'
  | 'agent-wordy'
  | 'agent-izzy'
  | 'agent-meka'
  | 'agent-forge'
  | 'agent-pako'

const BG: Record<ColorToken, string> = {
  'agent-jarvis': 'bg-agent-jarvis',
  'agent-lumi': 'bg-agent-lumi',
  'agent-aki': 'bg-agent-aki',
  'agent-joi': 'bg-agent-joi',
  'agent-friday': 'bg-agent-friday',
  'agent-tars': 'bg-agent-tars',
  'agent-echo': 'bg-agent-echo',
  'agent-kitt': 'bg-agent-kitt',
  'agent-ethica': 'bg-agent-ethica',
  'agent-qa': 'bg-agent-qa',
  'agent-wordy': 'bg-agent-wordy',
  'agent-izzy': 'bg-agent-izzy',
  'agent-meka': 'bg-agent-meka',
  'agent-forge': 'bg-agent-forge',
  'agent-pako': 'bg-agent-pako',
}

const DEFAULT_BG = 'bg-gray-400'

export function bgForToken(token: string | null | undefined): string {
  if (!token) return DEFAULT_BG
  return BG[token as ColorToken] ?? DEFAULT_BG
}

export const COLOR_TOKEN_OPTIONS: { token: ColorToken; label: string }[] = [
  { token: 'agent-jarvis', label: '딥블루' },
  { token: 'agent-lumi', label: '퍼플' },
  { token: 'agent-aki', label: '세이지' },
  { token: 'agent-joi', label: '코랄' },
  { token: 'agent-friday', label: '골드' },
  { token: 'agent-tars', label: '슬레이트' },
  { token: 'agent-echo', label: '베이지' },
  { token: 'agent-kitt', label: '브릭' },
  { token: 'agent-ethica', label: '라벤더' },
  { token: 'agent-qa', label: '틸' },
  { token: 'agent-wordy', label: '오션블루' },
  { token: 'agent-izzy', label: '올리브' },
  { token: 'agent-meka', label: '스틸' },
  { token: 'agent-forge', label: '커퍼' },
  { token: 'agent-pako', label: '크라프트' },
]
