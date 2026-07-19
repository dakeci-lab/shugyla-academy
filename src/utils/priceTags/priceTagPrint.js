/**
 * Browser print for a single price tag — HTML document, not PDF.
 * Input is a view-model from buildPriceTagViewModel (source-agnostic).
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPrintDocument(viewModel) {
  const { size } = viewModel
  const width = size.widthMm
  const height = size.heightMm
  const isLarge = width >= 105

  const volumeHtml = viewModel.volume
    ? `<p class="tag__volume">${escapeHtml(viewModel.volume)}</p>`
    : ''
  const descHtml = viewModel.description
    ? `<p class="tag__desc">${escapeHtml(viewModel.description)}</p>`
    : ''
  const skuHtml = viewModel.sku
    ? `<p class="tag__sku">арт. ${escapeHtml(viewModel.sku)}</p>`
    : ''
  const barcodeHtml = viewModel.barcode
    ? `<div class="tag__barcode"><span class="tag__barcode-bars" aria-hidden="true"></span><span class="tag__barcode-text">${escapeHtml(viewModel.barcode)}</span></div>`
    : ''
  const oldPriceHtml = viewModel.showOldPrice
    ? `<p class="tag__old-price">${escapeHtml(viewModel.oldPriceLabel)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Ценник — ${escapeHtml(viewModel.name)}</title>
  <style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${width}mm;
      height: ${height}mm;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #111;
      background: #fff;
    }
    .tag {
      width: ${width}mm;
      height: ${height}mm;
      padding: ${isLarge ? '6mm' : '2.5mm'};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 0.3mm solid #222;
      overflow: hidden;
    }
    .tag--promo { border-color: #c0392b; }
    .tag__name {
      font-weight: 700;
      font-size: ${isLarge ? '18pt' : '9pt'};
      line-height: 1.15;
      letter-spacing: -0.02em;
    }
    .tag__volume {
      margin-top: 1mm;
      font-size: ${isLarge ? '12pt' : '7pt'};
      color: #444;
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
      font-size: ${viewModel.isPromo ? (isLarge ? '36pt' : '16pt') : isLarge ? '28pt' : '14pt'};
      line-height: 1;
      color: ${viewModel.isPromo ? '#c0392b' : '#111'};
      letter-spacing: -0.03em;
    }
    .tag__desc {
      margin-top: 1.5mm;
      font-size: ${isLarge ? '11pt' : '6.5pt'};
      color: #333;
    }
    .tag__sku {
      margin-top: 1mm;
      font-size: ${isLarge ? '9pt' : '5.5pt'};
      color: #666;
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
  <article class="tag${viewModel.isPromo ? ' tag--promo' : ''}">
    <div>
      <h1 class="tag__name">${escapeHtml(viewModel.name)}</h1>
      ${volumeHtml}
      ${descHtml}
      ${skuHtml}
    </div>
    <div class="tag__prices">
      ${oldPriceHtml}
      <p class="tag__price">${escapeHtml(viewModel.priceLabel)}</p>
      ${barcodeHtml}
    </div>
  </article>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 80);
    });
  </script>
</body>
</html>`
}

/**
 * Opens a new window with the tag HTML and triggers browser print.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function printPriceTag(viewModel) {
  if (!viewModel?.size) {
    return { ok: false, error: 'Не удалось подготовить ценник к печати' }
  }

  const html = buildPrintDocument(viewModel)
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
