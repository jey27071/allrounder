import React from 'react'

interface Props {
  children: React.ReactNode
  label?: string
}

interface State {
  hasError: boolean
  message?: string
}

/**
 * 단일 컴포넌트 트리에서 렌더링 에러를 잡아 페이지 전체가 흰 화면이
 * 되는 걸 막는다. 미션 메시지 매핑 같은 데이터 의존적 영역을 감싼다.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: String(error) }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('ErrorBoundary caught:', error, info)
  }

  reset = () => this.setState({ hasError: false, message: undefined })

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 border border-warning/40 bg-warning/5 rounded text-sm">
          <div className="font-medium text-warning mb-2">
            ⚠ {this.props.label ?? '컴포넌트'} 렌더링 오류
          </div>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap mb-3">
            {this.state.message ?? 'Unknown error'}
          </pre>
          <button
            onClick={this.reset}
            className="text-xs px-2 py-1 rounded border border-border bg-white hover:bg-gray-50"
          >
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
