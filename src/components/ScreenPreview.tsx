interface ScreenPreviewProps {
  html: string
  height?: number
}

/**
 * Joi가 생성한 HTML을 iframe으로 안전하게 렌더링.
 * Tailwind CDN 자동 로드.
 */
export default function ScreenPreview({ html, height = 600 }: ScreenPreviewProps) {
  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://cdn.jsdelivr.net">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
    <style>
      body { font-family: 'Pretendard', system-ui, sans-serif; margin: 0; }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`

  return (
    <iframe
      srcDoc={fullHtml}
      className="w-full border border-border rounded-lg bg-white"
      style={{ height: `${height}px` }}
      sandbox="allow-scripts"
      title="Screen Preview"
    />
  )
}
