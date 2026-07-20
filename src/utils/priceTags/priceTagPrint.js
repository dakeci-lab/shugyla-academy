/**
 * Browser print for one or many price tags — HTML document, not PDF.
 * Input is view-model(s) from buildPriceTagViewModel (source-agnostic).
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildTagArticleHtml(viewModel) {
  const { size } = viewModel
  const width = size.widthMm
  const height = size.heightMm
  const isLarge = width >= 105

  const unitHtml = viewModel.unitLabel
    ? `<p class="tag__unit">${escapeHtml(viewModel.unitLabel)}</p>`
    : ''
  const descHtml = viewModel.description
    ? `<p class="tag__desc">${escapeHtml(viewModel.description)}</p>`
    : ''
  const barcodeHtml = viewModel.barcode
    ? `<div class="tag__barcode"><span class="tag__barcode-bars" aria-hidden="true"></span><span class="tag__barcode-text">${escapeHtml(viewModel.barcode)}</span></div>`
    : ''
  const oldPriceHtml = viewModel.showOldPrice
    ? `<p class="tag__old-price">${escapeHtml(viewModel.oldPriceLabel)}</p>`
    : ''

  return `<article class="tag${viewModel.isPromo ? ' tag--promo' : ''}" style="width:${width}mm;height:${height}mm;padding:${isLarge ? '6mm' : '2.5mm'}">
    <div>
      <h1 class="tag__name" style="font-size:${isLarge ? '18pt' : '9pt'}">${escapeHtml(viewModel.name)}</h1>
      ${unitHtml}
      ${descHtml}
    </div>
    <div class="tag__prices">
      ${oldPriceHtml}
      <p class="tag__price" style="font-size:${viewModel.isPromo ? (isLarge ? '36pt' : '16pt') : isLarge ? '28pt' : '14pt'};color:${viewModel.isPromo ? '#c0392b' : '#111'}">${escapeHtml(viewModel.priceLabel)}</p>
      ${barcodeHtml}
    </div>
  </article>`
}

function buildPrintDocument(viewModels) {
  const first = viewModels[0]
  const { size } = first
  const width = size.widthMm
  const height = size.heightMm
  const isLarge = width >= 105
  const pages = viewModels.map(buildTagArticleHtml).join('\n')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Ценники — ${escapeHtml(first.name)}${viewModels.length > 1 ? ` (+${viewModels.length - 1})` : ''}</title>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #111;
      background: #fff;
    }
    .tag {
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 0.3mm solid #222;
      overflow: hidden;
    }
    .tag:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .tag--promo { border-color: #c0392b; }
    .tag__name {
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.02em;
    }
    .tag__unit {
      margin-top: 1mm;
      font-size: ${isLarge ? '11pt' : '6.5pt'};
      color: #555;
    }
    .tag__prices { margin-top: auto; padding-top: 2mm; }
    .tag__old-price {
      font-size: ${isLarge ? '14pt' : '8pt'};
      color: #777;
      text-decoration: line-through;
      margin-bottom: 0.5mm;
    }
    .tag__price {
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
    }
    .tag__desc {
      margin-top: 1.5mm;
      font-size: ${isLarge ? '11pt' : '6.5pt'};
      color: #333;
    }
    .tag__barcode {
      margin-top: 1.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.6mm;
    }
    .tag__barcode-bars {
      display: block;
      width: 100%;
      max-width: ${isLarge ? '70mm' : '100%'};
      height: ${isLarge ? '10mm' : '5mm'};
      background: repeating-linear-gradient(
        90deg,
        #111 0,
        #111 0.35mm,
        #fff 0.35mm,
        #fff 0.7mm,
        #111 0.7mm,
        #111 1mm,
        #fff 1mm,
        #fff 1.2mm
      );
    }
    .tag__barcode-text {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: ${isLarge ? '10pt' : '6pt'};
      letter-spacing: 0.08em;
    }
    @media print {
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${pages}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 80);
    });
  </script>
</body>
</html>`
}

/**
 * Opens a new window with tag HTML and triggers browser print.
 * Accepts one view-model or an array.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function printPriceTag(viewModelOrList) {
  const viewModels = Array.isArray(viewModelOrList)
    ? viewModelOrList
    : viewModelOrList
      ? [viewModelOrList]
      : []

  if (!viewModels.length || !viewModels[0]?.size) {
    return { ok: false, error: 'Не удалось подготовить ценник к печати' }
  }

  const html = buildPrintDocument(viewModels)
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=720,height=640')
  if (!printWindow) {
    return {
      ok: false,
      error: 'Не удалось открыть окно печати. Разрешите всплывающие окна для этого сайта.',
    }
  }

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  return { ok: true }
}

/** Alias for multi-tag print. */
export function printPriceTags(viewModels) {
  return printPriceTag(viewModels)
}
