/** Простой рендер Markdown без внешних библиотек */

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export function renderSimpleMarkdown(source) {
  if (!source) return ''

  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const html = []
  let inList = false

  function closeList() {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (trimmed === '---' || trimmed === '***') {
      closeList()
      html.push('<hr class="simple-md__hr" />')
      return
    }

    if (trimmed.startsWith('### ')) {
      closeList()
      html.push(`<h3 class="simple-md__h3">${inlineFormat(trimmed.slice(4))}</h3>`)
      return
    }

    if (trimmed.startsWith('## ')) {
      closeList()
      html.push(`<h2 class="simple-md__h2">${inlineFormat(trimmed.slice(3))}</h2>`)
      return
    }

    if (trimmed.startsWith('# ')) {
      closeList()
      html.push(`<h1 class="simple-md__h1">${inlineFormat(trimmed.slice(2))}</h1>`)
      return
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        html.push('<ul class="simple-md__ul">')
        inList = true
      }
      html.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`)
      return
    }

    closeList()

    if (!trimmed) {
      html.push('<br />')
      return
    }

    html.push(`<p class="simple-md__p">${inlineFormat(line)}</p>`)
  })

  closeList()
  return html.join('\n')
}
