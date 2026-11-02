import { renderFlowchart } from './render-flowchart'

export interface TocItem {
  id: string
  text: string
  level: number
}

export interface RenderResult {
  html: string
  toc: TocItem[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-äöüß]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function renderMarkdown(markdown: string): RenderResult {
  const lines = markdown.split(/\r?\n/)
  const toc: TocItem[] = []
  const output: string[] = []

  let inCodeBlock = false
  let codeBlockLang = ''
  let codeBlockContent: string[] = []

  let inTable = false
  let tableRows: string[][] = []

  let inList = false
  let listType: 'ul' | 'ol' = 'ul'

  let inBlockquote = false
  let blockquoteType: 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'quote' = 'quote'
  let blockquoteContent: string[] = []

  function flushList() {
    if (inList) {
      output.push(listType === 'ul' ? '</ul>' : '</ol>')
      inList = false
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      let tableHtml = '<div class="table-container"><table class="docs-table">'
      if (tableRows.length > 0) {
        tableHtml += '<thead><tr>'
        for (const cell of tableRows[0]) {
          tableHtml += `<th>${cell}</th>`
        }
        tableHtml += '</tr></thead>'
      }
      if (tableRows.length > 1) {
        tableHtml += '<tbody>'
        for (let i = 1; i < tableRows.length; i++) {
          tableHtml += '<tr>'
          for (const cell of tableRows[i]) {
            tableHtml += `<td>${cell}</td>`
          }
          tableHtml += '</tr>'
        }
        tableHtml += '</tbody>'
      }
      tableHtml += '</table></div>'
      output.push(tableHtml)
      inTable = false
      tableRows = []
    }
  }

  function flushBlockquote() {
    if (inBlockquote) {
      const innerHtml = blockquoteContent.map((l) => formatInline(l)).join('<br/>')
      let title = 'Hinweis'
      let icon = 'ℹ️'

      switch (blockquoteType) {
        case 'tip':
          title = 'Tipp'
          icon = '💡'
          break
        case 'important':
          title = 'Wichtig'
          icon = '📌'
          break
        case 'warning':
          title = 'Achtung'
          icon = '⚠️'
          break
        case 'caution':
          title = 'Vorsicht'
          icon = '🛑'
          break
        case 'note':
          title = 'Information'
          icon = 'ℹ️'
          break
        default:
          title = ''
          icon = ''
      }

      if (blockquoteType === 'quote') {
        output.push(`<blockquote><p>${innerHtml}</p></blockquote>`)
      } else {
        output.push(`
          <div class="callout callout-${blockquoteType}">
            <div class="callout-header">
              <span class="callout-icon">${icon}</span>
              <span class="callout-title">${title}</span>
            </div>
            <div class="callout-body">${innerHtml}</div>
          </div>
        `)
      }

      inBlockquote = false
      blockquoteContent = []
      blockquoteType = 'quote'
    }
  }

  function formatInline(text: string): string {
    // Images: ![caption](url) optionally with:
    // ![caption](url =500)
    // ![caption|500](url)
    // ![caption](url){width=500}
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?/g, (_, rawCaption, rawUrl, rawAttrs) => {
      let cleanUrl = rawUrl.trim()
      let cleanCaption = rawCaption.trim()
      let width = ''

      // Check url for "=500" or "=500x300"
      const urlWidthMatch = cleanUrl.match(/\s+=\s*(\d+(?:%|px)?)(?:x\d*)?$/)
      if (urlWidthMatch) {
        width = urlWidthMatch[1]
        cleanUrl = cleanUrl.replace(/\s+=\s*(\d+(?:%|px)?)(?:x\d*)?$/, '').trim()
      }

      // Check attrs: {width=500} or {500px} or {width: 500px}
      if (!width && rawAttrs) {
        const attrMatch = rawAttrs.match(/(?:width[=:]\s*["']?|(?:\b))(\d+(?:%|px)?)(?:["']?|$)/i)
        if (attrMatch) {
          width = attrMatch[1]
        }
      }

      // Check caption for "|500" or "|500px" or "|50%"
      if (!width && cleanCaption.includes('|')) {
        const parts = cleanCaption.split('|')
        const last = parts[parts.length - 1].trim()
        if (/^\d+(?:%|px)?$/.test(last)) {
          width = last
          cleanCaption = parts.slice(0, -1).join('|').trim()
        }
      }

      if (width && /^\d+$/.test(width)) {
        width = `${width}px`
      }

      const filename = cleanUrl.split('/').pop() || ''
      const isPosImage = cleanUrl.includes('/docs/images/') && !filename.startsWith('quixpos-')

      const deviceSwitcherHtml = isPosImage
        ? `
          <div class="device-switch-bar">
            <div class="device-switch-group">
              <span class="device-switch-label">Gerät:</span>
              <div class="device-segmented-control" role="group" aria-label="Gerätegröße">
                <button type="button" class="device-btn" data-device-btn="phone" data-img-name="${filename}" title="Smartphone (z.B. Galaxy A52s)">📱 Phone</button>
                <button type="button" class="device-btn" data-device-btn="tab-small" data-img-name="${filename}" title="Kleines Tablet (z.B. Tab A11)">📲 Tab klein</button>
                <button type="button" class="device-btn active" data-device-btn="tab-big" data-img-name="${filename}" title="Großes Tablet (z.B. Tab S7+)">💻 Tab groß</button>
              </div>
            </div>
            <div class="device-switch-group">
              <span class="device-switch-label">Format:</span>
              <div class="device-segmented-control" role="group" aria-label="Ausrichtung">
                <button type="button" class="device-btn active" data-orient-btn="landscape" data-img-name="${filename}" title="Querformat (Landscape)">📐 Quer</button>
                <button type="button" class="device-btn" data-orient-btn="portrait" data-img-name="${filename}" title="Hochformat (Portrait)">📱 Hoch</button>
              </div>
            </div>
          </div>
        `
        : ''

      const styleWrapper = width ? ` style="max-width: ${width}; margin: 0 auto;"` : ''
      const styleCaption = width ? ` style="max-width: ${width}; margin: 0.75rem auto 0 auto; text-align: center;"` : ''
      const figureClass = isPosImage ? 'docs-figure' : 'docs-figure is-standalone'

      return `
        <figure class="${figureClass}"${isPosImage ? ` data-figure-container data-image-name="${filename}"` : ''}>
          ${deviceSwitcherHtml}
          <div class="docs-img-wrapper"${styleWrapper} data-lightbox-src="${cleanUrl}" data-caption="${escapeHtml(cleanCaption)}">
            <img src="${cleanUrl}" alt="${escapeHtml(cleanCaption)}" loading="lazy" class="docs-img" />
            <div class="docs-img-overlay">
              <span class="zoom-icon">🔍</span>
              <span class="zoom-text">Klicken zum Vergrößern</span>
            </div>
          </div>
          ${cleanCaption ? `<figcaption class="docs-figcaption"${styleCaption}>${escapeHtml(cleanCaption)}</figcaption>` : ''}
        </figure>
      `
    })

    // Keyboard keys: <kbd>key</kbd> or `[kbd:key]`
    text = text.replace(/\[kbd:([^\]]+)\]/g, '<kbd class="kbd">$1</kbd>')
    text = text.replace(/<kbd>([^<]+)<\/kbd>/g, '<kbd class="kbd">$1</kbd>')

    // Badges: [badge:text:color]
    text = text.replace(/\[badge:([^:]+):?([^\]]*)\]/g, (_, label, color) => {
      const c = color ? `badge-${color}` : 'badge-default'
      return `<span class="badge ${c}">${label}</span>`
    })

    // Inline links: [label](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const isExt = url.startsWith('http')
      const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `<a href="${url}" class="docs-link"${target}>${label}${isExt ? ' ↗' : ''}</a>`
    })

    // Bold + Italic: ***text***
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')

    // Bold: **text**
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

    // Italic: *text* or _text_
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>')

    // Inline Code: `code`
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

    return text
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // Fenced Code Blocks
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        flushList()
        flushTable()
        flushBlockquote()
        inCodeBlock = true
        codeBlockLang = trimmed.replace(/^```/, '').trim()
        codeBlockContent = []
        continue
      } else {
        inCodeBlock = false
        if (codeBlockLang === 'mermaid') {
          let diagramSvg: string
          try {
            diagramSvg = renderFlowchart(codeBlockContent.join('\n'))
          } catch {
            diagramSvg = `<pre>${escapeHtml(codeBlockContent.join('\n'))}</pre>`
          }
          output.push(`
            <div class="mermaid-block">
              ${diagramSvg}
            </div>
          `)
        } else {
          const codeText = escapeHtml(codeBlockContent.join('\n'))
          output.push(`
            <div class="code-block">
              ${codeBlockLang ? `<div class="code-header"><span>${codeBlockLang}</span></div>` : ''}
              <pre><code class="language-${codeBlockLang}">${codeText}</code></pre>
            </div>
          `)
        }
        continue
      }

    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine)
      continue
    }

    // Callout / Blockquote
    if (trimmed.startsWith('>')) {
      flushList()
      flushTable()
      const quoteText = trimmed.replace(/^>\s?/, '')

      // Check alert types
      if (quoteText.startsWith('[!NOTE]')) {
        inBlockquote = true
        blockquoteType = 'note'
        continue
      } else if (quoteText.startsWith('[!TIP]')) {
        inBlockquote = true
        blockquoteType = 'tip'
        continue
      } else if (quoteText.startsWith('[!IMPORTANT]')) {
        inBlockquote = true
        blockquoteType = 'important'
        continue
      } else if (quoteText.startsWith('[!WARNING]')) {
        inBlockquote = true
        blockquoteType = 'warning'
        continue
      } else if (quoteText.startsWith('[!CAUTION]')) {
        inBlockquote = true
        blockquoteType = 'caution'
        continue
      }

      if (!inBlockquote) {
        inBlockquote = true
        blockquoteType = 'quote'
      }
      blockquoteContent.push(quoteText)
      continue
    } else {
      flushBlockquote()
    }

    // Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList()
      // Check if it's separator row: | --- | :---: |
      if (/^\|(\s*:?-+:?\s*\|)+$/.test(trimmed)) {
        continue
      }
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => formatInline(c.trim()))

      if (!inTable) {
        inTable = true
        tableRows = []
      }
      tableRows.push(cells)
      continue
    } else {
      flushTable()
    }

    // Empty lines
    if (!trimmed) {
      flushList()
      continue
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList()
      output.push('<hr class="docs-hr" />')
      continue
    }

    // Headings
    const headingMatch = rawLine.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      flushList()
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      const id = slugify(title)
      toc.push({ id, text: title, level })

      const headingClass = `heading-${level}`
      output.push(`
        <h${level} id="${id}" class="${headingClass}">
          <a href="#${id}" class="anchor-link" aria-hidden="true">#</a>
          <span>${formatInline(title)}</span>
        </h${level}>
      `)
      continue
    }

    // Unordered / Ordered Lists
    const ulMatch = rawLine.match(/^(\s*)([-*+])\s+(.+)$/)
    const olMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/)

    if (ulMatch || olMatch) {
      const isOl = Boolean(olMatch)
      const content = isOl ? olMatch![3] : ulMatch![3]

      if (!inList || listType !== (isOl ? 'ol' : 'ul')) {
        flushList()
        inList = true
        listType = isOl ? 'ol' : 'ul'
        output.push(listType === 'ul' ? '<ul class="docs-list">' : '<ol class="docs-list">')
      }

      // Checkbox list
      let itemContent = content
      if (itemContent.startsWith('[ ] ')) {
        itemContent = `<input type="checkbox" disabled class="task-checkbox" /> ${itemContent.slice(4)}`
      } else if (itemContent.startsWith('[x] ') || itemContent.startsWith('[X] ')) {
        itemContent = `<input type="checkbox" checked disabled class="task-checkbox" /> ${itemContent.slice(4)}`
      }

      output.push(`<li>${formatInline(itemContent)}</li>`)
      continue
    } else {
      flushList()
    }

    // Regular Paragraph
    output.push(`<p class="docs-paragraph">${formatInline(trimmed)}</p>`)
  }

  flushList()
  flushTable()
  flushBlockquote()

  return {
    html: output.join('\n'),
    toc,
  }
}
