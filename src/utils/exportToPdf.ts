import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';

export interface ExportPdfOptions {
  element: HTMLElement | null;
  fileName: string;
  stockName?: string;
  analysisDate?: string;
  title?: string;
  subtitle?: string;
  appName?: string;
  logoSrc?: string;
}

const MM_PER_INCH = 25.4;
const CSS_DPI = 96;

const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;
const PDF_MARGIN_MM = 8;

const PDF_CONTENT_WIDTH_MM = PDF_PAGE_WIDTH_MM - PDF_MARGIN_MM * 2;
const PDF_CONTENT_HEIGHT_MM = PDF_PAGE_HEIGHT_MM - PDF_MARGIN_MM * 2;

const PDF_CONTENT_WIDTH_PX = Math.round((PDF_CONTENT_WIDTH_MM / MM_PER_INCH) * CSS_DPI);
const PDF_CONTENT_HEIGHT_PX = Math.round((PDF_CONTENT_HEIGHT_MM / MM_PER_INCH) * CSS_DPI);

const MIN_EXPORT_LAYOUT_WIDTH_PX = 520;
const MAX_EXPORT_LAYOUT_WIDTH_PX = PDF_CONTENT_WIDTH_PX;

const MIN_CAPTURE_HEIGHT_PX = 300;
const MAX_CAPTURE_HEIGHT_PX = 25000;

const KEY_VALUE_LABEL_COL_PERCENT = 30;
const KEY_VALUE_VALUE_COL_PERCENT = 70;

const WIDE_KEY_VALUE_LABEL_COL_PERCENT = 22;
const WIDE_KEY_VALUE_VALUE_COL_PERCENT = 78;

const LONG_NUMERIC_WRAP_THRESHOLD = 14;
const VERY_LONG_NUMERIC_WRAP_THRESHOLD = 20;

const WIDE_TABLE_SECTION_TITLES = ['کندل روزانه تعدیل شده', 'خلاصه روزانه سهم'];

const PAGE_PADDING_X = 12;
const PAGE_PADDING_Y = 16;
const WIDE_BLOCK_NEGATIVE_X = 16;
const WIDE_SECTION_GAP_PX = 14;

function normalizeFileName(fileName: string): string {
  const trimmed = typeof fileName === 'string' ? fileName.trim() : '';
  if (!trimmed) return 'analysis-report.pdf';

  const safe = trimmed.replace(/[\\/:*?"<>|]/g, '-');

  if (/\.pdf$/i.test(safe)) return safe;
  if (/\.(html?|htm)$/i.test(safe)) return safe.replace(/\.(html?|htm)$/i, '.pdf');

  return `${safe}.pdf`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFonts(): Promise<void> {
  try {
    if ('fonts' in document && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // ignore
  }
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));

  await Promise.all(
    images.map(async (img) => {
      try {
        if (img.complete && img.naturalWidth > 0) return;

        if (typeof img.decode === 'function') {
          await img.decode();
          return;
        }

        await new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      } catch {
        // ignore
      }
    })
  );
}

async function waitForLayout(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await wait(150);
}

function isLikelyBlankCanvas(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const sampleSize = 160;
  const points = [
    { x: 0, y: 0 },
    { x: Math.max(0, Math.floor((canvas.width - sampleSize) / 2)), y: 0 },
    { x: 0, y: Math.max(0, Math.floor((canvas.height - sampleSize) / 2)) },
    {
      x: Math.max(0, Math.floor((canvas.width - sampleSize) / 2)),
      y: Math.max(0, Math.floor((canvas.height - sampleSize) / 2)),
    },
  ];

  let meaningfulPixels = 0;

  for (const point of points) {
    const w = Math.min(sampleSize, canvas.width - point.x);
    const h = Math.min(sampleSize, canvas.height - point.y);

    if (w <= 0 || h <= 0) continue;

    const { data } = ctx.getImageData(point.x, point.y, w, h);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      const transparent = a < 5;
      const nearWhite = r > 245 && g > 245 && b > 245;

      if (!transparent && !nearWhite) {
        meaningfulPixels += 1;
        if (meaningfulPixels > 80) return false;
      }
    }
  }

  return true;
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('بارگذاری تصویر تولیدشده ناموفق بود.'));
    img.src = dataUrl;
  });
}

async function isLikelyBlankDataUrl(dataUrl: string): Promise<boolean> {
  const img = await loadImageFromDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, img.naturalWidth || img.width);
  canvas.height = Math.max(1, img.naturalHeight || img.height);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  ctx.drawImage(img, 0, 0);
  return isLikelyBlankCanvas(canvas);
}

function syncFormValues(sourceRoot: HTMLElement, targetRoot: HTMLElement): void {
  const sourceFields = Array.from(
    sourceRoot.querySelectorAll('input, textarea, select')
  ) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

  const targetFields = Array.from(
    targetRoot.querySelectorAll('input, textarea, select')
  ) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

  for (let i = 0; i < sourceFields.length; i += 1) {
    const source = sourceFields[i];
    const target = targetFields[i];
    if (!source || !target) continue;

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.value = source.value;

      if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
        target.checked = source.checked;
      }
    }

    if (target instanceof HTMLSelectElement && source instanceof HTMLSelectElement) {
      target.value = source.value;
    }
  }
}

function syncCanvasContents(sourceRoot: HTMLElement, targetRoot: HTMLElement): void {
  const sourceCanvases = Array.from(sourceRoot.querySelectorAll('canvas'));
  const targetCanvases = Array.from(targetRoot.querySelectorAll('canvas'));

  for (let i = 0; i < sourceCanvases.length; i += 1) {
    const sourceCanvas = sourceCanvases[i];
    const targetCanvas = targetCanvases[i];
    if (!sourceCanvas || !targetCanvas) continue;

    try {
      targetCanvas.width = sourceCanvas.width;
      targetCanvas.height = sourceCanvas.height;
      targetCanvas.style.width = `${sourceCanvas.clientWidth || sourceCanvas.width}px`;
      targetCanvas.style.height = `${sourceCanvas.clientHeight || sourceCanvas.height}px`;

      const ctx = targetCanvas.getContext('2d');
      if (!ctx) continue;

      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      ctx.drawImage(sourceCanvas, 0, 0);
    } catch {
      // ignore
    }
  }
}

function cloneNodeForExport(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  syncFormValues(node, clone);
  syncCanvasContents(node, clone);
  return clone;
}

function resolveHeaderTexts(options: ExportPdfOptions): { title: string; subtitle: string } {
  const stockName = options.stockName?.trim();
  const analysisDate = options.analysisDate?.trim();
  const explicitTitle = options.title?.trim();
  const explicitSubtitle = options.subtitle?.trim();

  return {
    title: explicitTitle || (stockName ? `گزارش تحلیل نماد ${stockName}` : 'گزارش تحلیل'),
    subtitle: explicitSubtitle || (analysisDate ? `تاریخ تحلیل: ${analysisDate}` : ''),
  };
}

function getSourceDimensions(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();

  return {
    width: Math.max(
      1,
      Math.ceil(rect.width),
      Math.ceil(element.scrollWidth),
      Math.ceil(element.offsetWidth),
      Math.ceil(element.clientWidth)
    ),
    height: Math.max(
      1,
      Math.ceil(rect.height),
      Math.ceil(element.scrollHeight),
      Math.ceil(element.offsetHeight),
      Math.ceil(element.clientHeight)
    ),
  };
}

function chooseExportLayoutWidth(element: HTMLElement): number {
  const { width } = getSourceDimensions(element);
  return Math.max(MIN_EXPORT_LAYOUT_WIDTH_PX, Math.min(Math.ceil(width), MAX_EXPORT_LAYOUT_WIDTH_PX));
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function normalizeSearchText(value: string): string {
  return normalizeDigits(value)
    .replace(/\s+/g, ' ')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .trim();
}

function getCleanCellText(cell: HTMLElement): string {
  return (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isNumericLikeText(value: string): boolean {
  const normalized = normalizeDigits(value)
    .replace(/[,\u066C\u2009\u202F]/g, '')
    .replace(/[()%٪+\-−]/g, '')
    .replace(/\s+/g, '');

  if (!normalized) return false;
  if (!/[0-9]/.test(normalized)) return false;

  return /^[0-9.]+$/.test(normalized);
}

function addSoftBreaksToNumericText(value: string): string {
  return value
    .replace(/,/g, ',\u200B')
    .replace(/،/g, '،\u200B')
    .replace(/\//g, '/\u200B')
    .replace(/-/g, '-\u200B');
}

function getMaxColumnCount(table: HTMLTableElement): number {
  const rows = Array.from(table.querySelectorAll('tr'));
  let maxCount = 0;

  for (const row of rows) {
    const count = Array.from(row.children).reduce((sum, child) => {
      const cell = child as HTMLTableCellElement;
      return sum + Math.max(1, cell.colSpan || 1);
    }, 0);

    if (count > maxCount) maxCount = count;
  }

  return Math.max(1, maxCount);
}

function isKeyValueTable(table: HTMLTableElement): boolean {
  return getMaxColumnCount(table) === 2;
}

function matchesWideSectionTitle(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return WIDE_TABLE_SECTION_TITLES.some((title) => normalized.includes(normalizeSearchText(title)));
}

function getUniqueElements<T extends HTMLElement>(elements: Array<T | null | undefined>): T[] {
  const result: T[] = [];
  const seen = new Set<T>();

  for (const el of elements) {
    if (!el || seen.has(el)) continue;
    seen.add(el);
    result.push(el);
  }

  return result;
}

function findRelevantHeadingBefore(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node;

  while (current) {
    let sibling = current.previousElementSibling as HTMLElement | null;

    while (sibling) {
      const text = normalizeSearchText(sibling.textContent ?? '');
      if (text && text.length <= 120) return sibling;
      sibling = sibling.previousElementSibling as HTMLElement | null;
    }

    current = current.parentElement;
  }

  return null;
}

function findMatchingWideHeadingBefore(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node;

  while (current) {
    let sibling = current.previousElementSibling as HTMLElement | null;

    while (sibling) {
      const text = normalizeSearchText(sibling.textContent ?? '');
      if (matchesWideSectionTitle(text)) return sibling;
      sibling = sibling.previousElementSibling as HTMLElement | null;
    }

    current = current.parentElement;
  }

  return null;
}

function isWideTargetTable(table: HTMLTableElement): boolean {
  const directText = normalizeSearchText(table.textContent ?? '');
  if (matchesWideSectionTitle(directText)) return true;

  const matchingHeading = findMatchingWideHeadingBefore(table);
  if (matchingHeading) return true;

  const containers = [
    table.closest('[data-section-title]'),
    table.closest('section'),
    table.closest('article'),
    table.parentElement,
    table.parentElement?.parentElement,
  ].filter(Boolean) as HTMLElement[];

  for (const container of containers) {
    const text = normalizeSearchText(container.textContent ?? '');
    if (matchesWideSectionTitle(text)) return true;
  }

  return false;
}

function collectAncestorsUntil(node: HTMLElement, stopAt: HTMLElement | null): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current: HTMLElement | null = node;

  while (current) {
    ancestors.push(current);
    if (current === stopAt) break;
    current = current.parentElement;
  }

  return ancestors;
}

function countDescendantTables(container: HTMLElement): number {
  return container.querySelectorAll('table').length;
}

function countDescendantWideTables(container: HTMLElement): number {
  const tables = Array.from(container.querySelectorAll('table')) as HTMLTableElement[];
  return tables.filter((table) => isWideTargetTable(table)).length;
}

function findBestSectionContainerForWideTable(
  table: HTMLTableElement,
  root: HTMLElement
): HTMLElement | null {
  const heading = findMatchingWideHeadingBefore(table) ?? findRelevantHeadingBefore(table);
  const ancestors = collectAncestorsUntil(table, root);

  for (const candidate of ancestors) {
    if (candidate === table) continue;

    const containsHeading = heading ? candidate.contains(heading) : false;
    const wideTableCount = countDescendantWideTables(candidate);
    const tableCount = countDescendantTables(candidate);

    if (containsHeading && wideTableCount === 1) {
      return candidate;
    }

    if (containsHeading && tableCount === 1) {
      return candidate;
    }

    const candidateText = normalizeSearchText(candidate.textContent ?? '');
    if (matchesWideSectionTitle(candidateText) && wideTableCount === 1) {
      return candidate;
    }
  }

  for (const candidate of ancestors) {
    if (candidate === table) continue;

    const wideTableCount = countDescendantWideTables(candidate);
    if (wideTableCount === 1) {
      return candidate;
    }
  }

  return table.parentElement ?? null;
}

function compareDomOrder(a: Node, b: Node): number {
  if (a === b) return 0;

  const relation = a.compareDocumentPosition(b);

  if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;

  return 0;
}

function findNearestCommonAncestor(
  elements: HTMLElement[],
  boundary: HTMLElement
): HTMLElement | null {
  if (!elements.length) return null;
  if (elements.length === 1) return elements[0].parentElement;

  const firstChain = collectAncestorsUntil(elements[0], boundary);

  for (const candidate of firstChain) {
    if (elements.every((el) => candidate.contains(el))) {
      return candidate;
    }
  }

  return boundary;
}

function ensureKeyValueColGroup(
  table: HTMLTableElement,
  labelPercent: number,
  valuePercent: number
): void {
  const existingGenerated = table.querySelector('colgroup[data-pdf-generated-colgroup="true"]');
  if (existingGenerated) {
    const cols = existingGenerated.querySelectorAll('col');
    if (cols[0]) (cols[0] as HTMLElement).style.width = `${labelPercent}%`;
    if (cols[1]) (cols[1] as HTMLElement).style.width = `${valuePercent}%`;
    return;
  }

  if (table.querySelector('colgroup')) return;

  const colGroup = document.createElement('colgroup');
  colGroup.dataset.pdfGeneratedColgroup = 'true';

  const labelCol = document.createElement('col');
  labelCol.style.width = `${labelPercent}%`;

  const valueCol = document.createElement('col');
  valueCol.style.width = `${valuePercent}%`;

  colGroup.append(labelCol, valueCol);
  table.insertBefore(colGroup, table.firstChild);
}

function styleNumericCell(cell: HTMLElement, text: string): void {
  const normalizedLength = normalizeDigits(text).replace(/\s+/g, '').length;

  cell.dataset.pdfNumeric = 'true';
  cell.style.direction = 'ltr';
  cell.style.unicodeBidi = 'plaintext';
  cell.style.textAlign = 'left';
  cell.style.fontVariantNumeric = 'tabular-nums';
  cell.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
  cell.style.letterSpacing = '0';
  cell.style.lineHeight = '1.45';
  cell.style.wordBreak = 'normal';
  cell.style.overflowWrap = 'normal';
  cell.style.whiteSpace = 'nowrap';
  cell.style.overflow = 'visible';
  cell.style.textOverflow = 'clip';
  cell.style.height = 'auto';
  cell.style.maxHeight = 'none';
  cell.style.minWidth = '0';

  if (normalizedLength >= VERY_LONG_NUMERIC_WRAP_THRESHOLD) {
    cell.style.whiteSpace = 'normal';
    cell.style.fontSize = '11px';
    cell.innerHTML = '';
    cell.textContent = addSoftBreaksToNumericText(text);
    return;
  }

  if (normalizedLength >= LONG_NUMERIC_WRAP_THRESHOLD) {
    cell.style.fontSize = '11.5px';
  }
}

function styleRegularCell(cell: HTMLElement): void {
  cell.style.whiteSpace = 'normal';
  cell.style.wordBreak = 'normal';
  cell.style.overflowWrap = 'break-word';
  cell.style.verticalAlign = 'top';
  cell.style.minWidth = '0';
  cell.style.lineHeight = '1.55';
}

function applyCellPaddingAndSizing(cell: HTMLElement, compact: boolean): void {
  cell.style.padding = compact ? '4px 6px' : '6px 8px';
  cell.style.fontSize = compact ? '11px' : '12px';
}

function forceElementToFullRow(el: HTMLElement): void {
  el.dataset.pdfForceBlock = 'true';
  el.style.display = 'block';
  el.style.width = '100%';
  el.style.maxWidth = 'none';
  el.style.minWidth = '0';
  el.style.flex = '0 0 100%';
  el.style.alignSelf = 'stretch';
  el.style.clear = 'both';
  el.style.marginLeft = '0';
  el.style.marginRight = '0';
}

function markWideSectionBlock(block: HTMLElement): void {
  block.dataset.pdfWideBlock = 'true';
  block.dataset.pdfWideSection = 'true';
  forceElementToFullRow(block);
  block.style.width = `calc(100% + ${WIDE_BLOCK_NEGATIVE_X * 2}px)`;
  block.style.maxWidth = 'none';
  block.style.marginRight = `-${WIDE_BLOCK_NEGATIVE_X}px`;
  block.style.marginLeft = `-${WIDE_BLOCK_NEGATIVE_X}px`;
  block.style.marginBottom = `${WIDE_SECTION_GAP_PX}px`;
  block.style.overflow = 'visible';
}

function expandWideTableContext(table: HTMLTableElement, root?: HTMLElement): void {
  table.dataset.pdfWideTable = 'true';
  table.dataset.pdfForceBlock = 'true';
  table.style.display = 'table';
  table.style.width = '100%';
  table.style.minWidth = '100%';
  table.style.maxWidth = '100%';

  const block = root
    ? findBestSectionContainerForWideTable(table, root)
    : table.parentElement;

  if (!block) return;
  markWideSectionBlock(block);
}

function applyExportTableStyles(table: HTMLTableElement, root?: HTMLElement): void {
  const keyValue = isKeyValueTable(table);
  const columnCount = getMaxColumnCount(table);
  const compact = columnCount >= 5;
  const wideTarget = isWideTargetTable(table);

  const labelPercent = wideTarget ? WIDE_KEY_VALUE_LABEL_COL_PERCENT : KEY_VALUE_LABEL_COL_PERCENT;
  const valuePercent = wideTarget ? WIDE_KEY_VALUE_VALUE_COL_PERCENT : KEY_VALUE_VALUE_COL_PERCENT;

  table.style.width = '100%';
  table.style.maxWidth = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.breakInside = 'avoid';
  table.style.pageBreakInside = 'avoid';
  table.style.tableLayout = keyValue ? 'fixed' : 'auto';
  table.style.overflow = 'visible';

  if (wideTarget) {
    expandWideTableContext(table, root);
  }

  if (keyValue) {
    ensureKeyValueColGroup(table, labelPercent, valuePercent);
  }

  const thead = table.tHead;
  if (thead) thead.style.display = 'table-header-group';

  const tfoot = table.tFoot;
  if (tfoot) tfoot.style.display = 'table-footer-group';

  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
  rows.forEach((row) => {
    row.style.breakInside = 'avoid';
    row.style.pageBreakInside = 'avoid';
  });

  const cells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[];
  cells.forEach((cell) => {
    styleRegularCell(cell);
    applyCellPaddingAndSizing(cell, compact);

    const text = getCleanCellText(cell);
    if (isNumericLikeText(text)) {
      styleNumericCell(cell, text);
    }
  });

  if (keyValue) {
    const rows2 = Array.from(table.querySelectorAll('tr'));
    rows2.forEach((row) => {
      const rowCells = Array.from(row.children) as HTMLElement[];
      if (rowCells.length !== 2) return;

      const labelCell = rowCells[0];
      const valueCell = rowCells[1];

      labelCell.style.width = `${labelPercent}%`;
      valueCell.style.width = `${valuePercent}%`;

      labelCell.style.whiteSpace = 'normal';
      labelCell.style.wordBreak = 'normal';
      labelCell.style.overflowWrap = 'break-word';

      const valueText = getCleanCellText(valueCell);
      if (isNumericLikeText(valueText)) {
        styleNumericCell(valueCell, valueText);
      } else {
        valueCell.style.whiteSpace = 'normal';
        valueCell.style.wordBreak = 'normal';
        valueCell.style.overflowWrap = 'break-word';
      }
    });
  }
}

function createScopedExportStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    .pdf-export-root,
    .pdf-export-root * {
      box-sizing: border-box;
    }

    .pdf-export-root {
      background: #ffffff;
      color: #111827;
      direction: rtl;
      overflow: visible;
    }

    .pdf-export-root img,
    .pdf-export-root svg,
    .pdf-export-root canvas,
    .pdf-export-root video {
      max-width: 100% !important;
      height: auto !important;
    }

    .pdf-export-root table {
      width: 100% !important;
      max-width: 100% !important;
      border-collapse: collapse;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .pdf-export-root [data-pdf-wide-block="true"] {
      width: calc(100% + ${WIDE_BLOCK_NEGATIVE_X * 2}px) !important;
      max-width: none !important;
      margin-right: -${WIDE_BLOCK_NEGATIVE_X}px !important;
      margin-left: -${WIDE_BLOCK_NEGATIVE_X}px !important;
      overflow: visible !important;
    }

    .pdf-export-root [data-pdf-wide-section="true"] {
      display: block !important;
      width: calc(100% + ${WIDE_BLOCK_NEGATIVE_X * 2}px) !important;
      max-width: none !important;
      min-width: 0 !important;
      flex: 0 0 100% !important;
      align-self: stretch !important;
      clear: both !important;
    }

    .pdf-export-root [data-pdf-wide-section="true"] table,
    .pdf-export-root table[data-pdf-wide-table="true"] {
      display: table !important;
      width: 100% !important;
      min-width: 100% !important;
      max-width: 100% !important;
    }

    .pdf-export-root [data-pdf-stack-container="true"],
    .pdf-export-root [data-pdf-wide-stack-wrapper="true"] {
      display: flex !important;
      flex-direction: column !important;
      flex-wrap: nowrap !important;
      align-items: stretch !important;
      width: 100% !important;
      max-width: none !important;
      min-width: 0 !important;
      gap: ${WIDE_SECTION_GAP_PX}px !important;
      overflow: visible !important;
    }

    .pdf-export-root [data-pdf-stack-container="true"] > *,
    .pdf-export-root [data-pdf-wide-stack-wrapper="true"] > * {
      max-width: 100% !important;
      min-width: 0 !important;
    }

    .pdf-export-root thead {
      display: table-header-group;
    }

    .pdf-export-root tfoot {
      display: table-footer-group;
    }

    .pdf-export-root tr,
    .pdf-export-root thead,
    .pdf-export-root tbody,
    .pdf-export-root tfoot,
    .pdf-export-root th,
    .pdf-export-root td,
    .pdf-export-root section,
    .pdf-export-root article,
    .pdf-export-root aside,
    .pdf-export-root div {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .pdf-export-root th,
    .pdf-export-root td {
      overflow: visible !important;
      text-overflow: clip !important;
      height: auto !important;
      max-height: none !important;
      vertical-align: top;
      min-width: 0;
      line-height: 1.55;
      letter-spacing: 0;
    }

    .pdf-export-root [data-pdf-numeric="true"] {
      white-space: nowrap !important;
      direction: ltr !important;
      unicode-bidi: plaintext !important;
      text-align: left !important;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1, "lnum" 1;
      letter-spacing: 0 !important;
      word-break: keep-all !important;
      overflow-wrap: normal !important;
    }

    .pdf-export-root [class*="grid"],
    .pdf-export-root [class*="flex"],
    .pdf-export-root * {
      min-width: 0 !important;
    }

    .pdf-export-root [data-pdf-force-block="true"] {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      flex: 0 0 100% !important;
      align-self: stretch !important;
      clear: both !important;
    }

    .pdf-export-root [data-pdf-ignore="true"] {
      display: none !important;
    }
  `;
  return style;
}

function applyExportBlockStyles(el: HTMLElement): void {
  el.style.boxSizing = 'border-box';
  el.style.minWidth = '0';
  el.style.breakInside = 'avoid';
  el.style.pageBreakInside = 'avoid';
}

function applyExportTextSizing(root: HTMLElement): void {
  const nodes = Array.from(root.querySelectorAll('p, div, span, td, th, li, label')) as HTMLElement[];

  nodes.forEach((node) => {
    if (!node.style.fontSize) return;

    const size = parseFloat(node.style.fontSize);
    if (Number.isFinite(size) && size > 14) {
      node.style.fontSize = '14px';
    }
  });
}

function createWideSectionsWrapper(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.dataset.pdfWideStackWrapper = 'true';
  wrapper.dataset.pdfStackContainer = 'true';
  wrapper.dataset.pdfForceBlock = 'true';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.flexWrap = 'nowrap';
  wrapper.style.alignItems = 'stretch';
  wrapper.style.width = '100%';
  wrapper.style.maxWidth = 'none';
  wrapper.style.minWidth = '0';
  wrapper.style.overflow = 'visible';
  wrapper.style.gap = `${WIDE_SECTION_GAP_PX}px`;
  return wrapper;
}

function reorderWideSectionsIntoDedicatedWrapper(
  root: HTMLElement,
  sections: HTMLElement[]
): void {
  if (sections.length < 2) return;

  const orderedSections = [...sections].sort(compareDomOrder);

  const commonAncestor = findNearestCommonAncestor(orderedSections, root);
  if (!commonAncestor) return;

  const firstSection = orderedSections[0];
  if (!firstSection.parentElement) return;

  const wrapper = createWideSectionsWrapper();

  const insertionParent = firstSection.parentElement;
  insertionParent.insertBefore(wrapper, firstSection);

  orderedSections.forEach((section) => {
    if (!section.isConnected) return;
    wrapper.appendChild(section);
  });

  forceElementToFullRow(wrapper);
}

function stackWideTableSections(root: HTMLElement): void {
  const allTables = Array.from(root.querySelectorAll('table')) as HTMLTableElement[];
  const wideTables = allTables.filter((table) => isWideTargetTable(table));

  if (!wideTables.length) return;

  const wideBlocks = getUniqueElements(
    wideTables.map((table) => {
      forceElementToFullRow(table);
      table.dataset.pdfWideTable = 'true';
      table.style.display = 'table';
      table.style.width = '100%';
      table.style.minWidth = '100%';
      table.style.maxWidth = '100%';

      const block = findBestSectionContainerForWideTable(table, root);
      if (block) {
        markWideSectionBlock(block);
      }

      return block;
    })
  );

  if (!wideBlocks.length) return;

  wideBlocks.forEach((block) => {
    const parent = block.parentElement;
    if (!parent) return;

    const siblingWideBlocks = wideBlocks.filter((candidate) => candidate.parentElement === parent);

    if (siblingWideBlocks.length >= 2) {
      parent.dataset.pdfStackContainer = 'true';
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';
      parent.style.flexWrap = 'nowrap';
      parent.style.alignItems = 'stretch';
      parent.style.width = '100%';
      parent.style.maxWidth = 'none';
      parent.style.minWidth = '0';
      parent.style.overflow = 'visible';
      if (!parent.style.gap) {
        parent.style.gap = `${WIDE_SECTION_GAP_PX}px`;
      }
    }
  });

  reorderWideSectionsIntoDedicatedWrapper(root, wideBlocks);
}

function prepareExportRoot(root: HTMLElement): void {
  root.querySelectorAll('table').forEach((table) => {
    applyExportTableStyles(table as HTMLTableElement, root);
  });

  root.querySelectorAll('section, article, aside, div').forEach((block) => {
    applyExportBlockStyles(block as HTMLElement);
  });

  stackWideTableSections(root);
  applyExportTextSizing(root);
}

function createMeasureRoot(widthPx: number): HTMLDivElement {
  const measureRoot = document.createElement('div');
  measureRoot.style.position = 'fixed';
  measureRoot.style.left = '0';
  measureRoot.style.top = '0';
  measureRoot.style.width = `${widthPx}px`;
  measureRoot.style.opacity = '0';
  measureRoot.style.pointerEvents = 'none';
  measureRoot.style.overflow = 'visible';
  measureRoot.style.background = '#ffffff';
  measureRoot.style.zIndex = '-1';
  return measureRoot;
}

function measureNodeHeight(node: HTMLElement, measureRoot: HTMLElement): number {
  const clone = node.cloneNode(true) as HTMLElement;
  measureRoot.appendChild(clone);
  const height = Math.ceil(clone.getBoundingClientRect().height || clone.scrollHeight || 0);
  clone.remove();
  return height;
}

function createPageShell(
  options: ExportPdfOptions,
  layoutWidthPx: number
): { page: HTMLDivElement; body: HTMLDivElement } {
  const { title, subtitle } = resolveHeaderTexts(options);
  const appName = options.appName?.trim() || 'سامانه تحلیلگر هوشمند بورس رونیا';
  const logoSrc = options.logoSrc?.trim();

  const page = document.createElement('div');
  page.className = 'pdf-export-root';
  page.style.width = `${layoutWidthPx}px`;
  page.style.background = '#ffffff';
  page.style.direction = 'rtl';
  page.style.padding = `${PAGE_PADDING_Y}px ${PAGE_PADDING_X}px`;
  page.style.boxSizing = 'border-box';
  page.style.fontFamily = 'Tahoma, IRANSans, Vazirmatn, Segoe UI, Arial, sans-serif';
  page.style.color = '#111827';
  page.style.position = 'fixed';
  page.style.left = '0';
  page.style.top = '0';
  page.style.visibility = 'visible';
  page.style.opacity = '1';
  page.style.pointerEvents = 'none';
  page.style.zIndex = '-1';
  page.style.overflow = 'visible';

  const styleNode = createScopedExportStyles();
  page.appendChild(styleNode);

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '14px';
  header.style.paddingBottom = '10px';
  header.style.marginBottom = '14px';
  header.style.borderBottom = '2px solid #e5e7eb';

  const texts = document.createElement('div');
  texts.style.display = 'flex';
  texts.style.flexDirection = 'column';
  texts.style.gap = '4px';
  texts.style.minWidth = '0';
  texts.style.flex = '1';

  const appTitle = document.createElement('div');
  appTitle.textContent = appName;
  appTitle.style.fontSize = '18px';
  appTitle.style.fontWeight = '700';
  appTitle.style.lineHeight = '1.4';

  const reportTitle = document.createElement('div');
  reportTitle.textContent = title;
  reportTitle.style.fontSize = '15px';
  reportTitle.style.fontWeight = '700';
  reportTitle.style.lineHeight = '1.4';

  texts.append(appTitle, reportTitle);

  if (subtitle) {
    const reportSubtitle = document.createElement('div');
    reportSubtitle.textContent = subtitle;
    reportSubtitle.style.fontSize = '12px';
    reportSubtitle.style.color = '#4b5563';
    reportSubtitle.style.lineHeight = '1.4';
    texts.appendChild(reportSubtitle);
  }

  header.appendChild(texts);

  if (logoSrc) {
    const logo = document.createElement('img');
    logo.crossOrigin = 'anonymous';
    logo.referrerPolicy = 'no-referrer';
    logo.src = logoSrc;
    logo.alt = appName;
    logo.style.width = '58px';
    logo.style.height = '58px';
    logo.style.objectFit = 'contain';
    logo.style.flexShrink = '0';
    header.appendChild(logo);
  }

  const body = document.createElement('div');
  body.style.width = '100%';
  body.style.boxSizing = 'border-box';
  body.style.overflow = 'visible';

  page.append(header, body);
  return { page, body };
}

function cloneTableSkeleton(sourceTable: HTMLTableElement): HTMLTableElement {
  const table = sourceTable.cloneNode(false) as HTMLTableElement;
  table.innerHTML = '';
  applyExportTableStyles(table);
  return table;
}

function paginateTable(
  sourceTable: HTMLTableElement,
  measureRoot: HTMLElement,
  maxBodyHeightPx: number
): HTMLTableElement[] {
  applyExportTableStyles(sourceTable);

  const fullClone = sourceTable.cloneNode(true) as HTMLTableElement;
  applyExportTableStyles(fullClone);

  if (measureNodeHeight(fullClone, measureRoot) <= maxBodyHeightPx) {
    return [fullClone];
  }

  const fragments: HTMLTableElement[] = [];
  const head = sourceTable.tHead ? (sourceTable.tHead.cloneNode(true) as HTMLTableSectionElement) : null;
  const foot = sourceTable.tFoot ? (sourceTable.tFoot.cloneNode(true) as HTMLTableSectionElement) : null;

  const bodyRows = Array.from(sourceTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
  const rows =
    bodyRows.length > 0
      ? bodyRows
      : (Array.from(sourceTable.querySelectorAll('tr')) as HTMLTableRowElement[]).filter((row) => {
          const parent = row.parentElement?.tagName?.toLowerCase();
          return parent !== 'thead' && parent !== 'tfoot';
        });

  let current = cloneTableSkeleton(sourceTable);
  if (head) current.appendChild(head.cloneNode(true));

  let currentBody = document.createElement('tbody');
  current.appendChild(currentBody);

  for (const row of rows) {
    const rowClone = row.cloneNode(true) as HTMLTableRowElement;
    currentBody.appendChild(rowClone);

    const currentHeight = measureNodeHeight(current, measureRoot);

    if (currentHeight > maxBodyHeightPx && currentBody.children.length > 1) {
      currentBody.removeChild(rowClone);
      fragments.push(current);

      current = cloneTableSkeleton(sourceTable);
      if (head) current.appendChild(head.cloneNode(true));

      currentBody = document.createElement('tbody');
      current.appendChild(currentBody);
      currentBody.appendChild(rowClone);
    }
  }

  if (foot) {
    current.appendChild(foot.cloneNode(true));
  }

  fragments.push(current);
  return fragments;
}

function splitLeafTextElement(
  source: HTMLElement,
  measureRoot: HTMLElement,
  maxBodyHeightPx: number
): HTMLElement[] {
  const rawText = (source.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!rawText) return [source.cloneNode(true) as HTMLElement];

  const tokens = rawText.split(/(\s+)/).filter((part) => part.length > 0);
  const fragments: HTMLElement[] = [];

  let currentText = '';
  let currentEl = source.cloneNode(false) as HTMLElement;
  currentEl.textContent = '';

  for (const token of tokens) {
    const candidate = currentText + token;
    currentEl.textContent = candidate;

    const candidateHeight = measureNodeHeight(currentEl, measureRoot);

    if (candidateHeight <= maxBodyHeightPx || currentText.length === 0) {
      currentText = candidate;
      continue;
    }

    const flushEl = source.cloneNode(false) as HTMLElement;
    flushEl.textContent = currentText.trimEnd();
    fragments.push(flushEl);

    currentText = token.trimStart();
    currentEl = source.cloneNode(false) as HTMLElement;
    currentEl.textContent = currentText;
  }

  if (currentText.trim().length > 0) {
    const flushEl = source.cloneNode(false) as HTMLElement;
    flushEl.textContent = currentText.trimEnd();
    fragments.push(flushEl);
  }

  return fragments.length > 0 ? fragments : [source.cloneNode(true) as HTMLElement];
}

function paginateElementNode(
  source: HTMLElement,
  measureRoot: HTMLElement,
  maxBodyHeightPx: number
): HTMLElement[] {
  const tag = source.tagName.toLowerCase();

  if (tag === 'table') {
    return paginateTable(source as HTMLTableElement, measureRoot, maxBodyHeightPx);
  }

  applyExportBlockStyles(source);

  const fullClone = source.cloneNode(true) as HTMLElement;
  applyExportBlockStyles(fullClone);

  if (measureNodeHeight(fullClone, measureRoot) <= maxBodyHeightPx) {
    return [fullClone];
  }

  const hasElementChildren = Array.from(source.childNodes).some(
    (node) => node.nodeType === Node.ELEMENT_NODE
  );

  if (!hasElementChildren) {
    return splitLeafTextElement(source, measureRoot, maxBodyHeightPx);
  }

  const fragments: HTMLElement[] = [];
  let current = source.cloneNode(false) as HTMLElement;
  current.innerHTML = '';
  applyExportBlockStyles(current);

  const flush = () => {
    if (current.childNodes.length > 0) {
      fragments.push(current);
    }
    current = source.cloneNode(false) as HTMLElement;
    current.innerHTML = '';
    applyExportBlockStyles(current);
  };

  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) continue;

    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (!text.trim() && current.childNodes.length === 0) continue;

      const candidate = current.cloneNode(true) as HTMLElement;
      candidate.appendChild(child.cloneNode(true));
      const candidateHeight = measureNodeHeight(candidate, measureRoot);

      if (current.childNodes.length > 0 && candidateHeight > maxBodyHeightPx) {
        flush();
      }

      current.appendChild(child.cloneNode(true));
      continue;
    }

    const elementChild = child as HTMLElement;
    const pieces = paginateElementNode(elementChild, measureRoot, maxBodyHeightPx);

    for (const piece of pieces) {
      const candidate = current.cloneNode(true) as HTMLElement;
      candidate.appendChild(piece.cloneNode(true));
      const candidateHeight = measureNodeHeight(candidate, measureRoot);

      if (current.childNodes.length > 0 && candidateHeight > maxBodyHeightPx) {
        flush();
      }

      current.appendChild(piece);
    }
  }

  if (current.childNodes.length > 0) {
    fragments.push(current);
  }

  return fragments.length > 0 ? fragments : [fullClone];
}

function paginateContentBlocks(
  sourceRoot: HTMLElement,
  options: ExportPdfOptions,
  layoutWidthPx: number,
  measureRoot: HTMLElement
): HTMLElement[] {
  const pages: HTMLElement[] = [];
  const maxBodyHeightPx = PDF_CONTENT_HEIGHT_PX - 96;

  let current = createPageShell(options, layoutWidthPx);
  let currentHeight = 0;

  const flushPage = () => {
    if (current.body.childElementCount > 0 || current.body.childNodes.length > 0) {
      pages.push(current.page);
    }
    current = createPageShell(options, layoutWidthPx);
    currentHeight = 0;
  };

  const appendFragment = (fragment: HTMLElement) => {
    const fragmentHeight = measureNodeHeight(fragment, measureRoot);

    if (currentHeight > 0 && currentHeight + fragmentHeight > maxBodyHeightPx) {
      flushPage();
    }

    current.body.appendChild(fragment);
    currentHeight += fragmentHeight;
  };

  for (const node of Array.from(sourceRoot.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) continue;

    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent?.trim()) continue;

      const wrapper = document.createElement('div');
      wrapper.textContent = node.textContent;
      applyExportBlockStyles(wrapper);

      const pieces = paginateElementNode(wrapper, measureRoot, maxBodyHeightPx);
      for (const piece of pieces) appendFragment(piece);
      continue;
    }

    const element = node as HTMLElement;
    const pieces = paginateElementNode(element, measureRoot, maxBodyHeightPx);
    for (const piece of pieces) appendFragment(piece);
  }

  if (current.body.childElementCount > 0 || current.body.childNodes.length > 0) {
    pages.push(current.page);
  }

  return pages;
}

function buildCaptureOptions(width: number, height: number) {
  const pixelRatio = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1.5));

  return {
    backgroundColor: '#ffffff',
    cacheBust: true,
    pixelRatio,
    width,
    height,
    canvasWidth: Math.floor(width * pixelRatio),
    canvasHeight: Math.floor(height * pixelRatio),
    skipAutoScale: false,
    useCORS: true,
    style: {
      transform: 'none',
      opacity: '1',
      visibility: 'visible',
      background: '#ffffff',
      overflow: 'visible',
      width: `${width}px`,
      height: `${height}px`,
    },
    filter: (domNode: HTMLElement) => {
      const tag = domNode.tagName?.toLowerCase?.() || '';
      if (['script', 'noscript', 'iframe', 'video'].includes(tag)) return false;

      const el = domNode as HTMLElement;
      if (el.dataset?.pdfIgnore === 'true') return false;
      if (el.getAttribute?.('aria-hidden') === 'true' && el.classList.contains('toast')) return false;

      return true;
    },
  };
}

async function renderNodeToCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  const rect = node.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width), Math.ceil(node.scrollWidth), Math.ceil(node.offsetWidth));
  const height = Math.max(
    MIN_CAPTURE_HEIGHT_PX,
    Math.ceil(rect.height),
    Math.ceil(node.scrollHeight),
    Math.ceil(node.offsetHeight)
  );

  if (height > MAX_CAPTURE_HEIGHT_PX) {
    throw new Error(`ارتفاع صفحه برای خروجی PDF بیش از حد مجاز است (${height}px).`);
  }

  const captureOptions = buildCaptureOptions(width, height);

  await waitForLayout();

  try {
    const canvas = await htmlToImage.toCanvas(node, captureOptions);
    if (!isLikelyBlankCanvas(canvas)) return canvas;
  } catch (error) {
    console.error('toCanvas failed:', error);
  }

  try {
    const jpeg = await htmlToImage.toJpeg(node, {
      ...captureOptions,
      quality: 0.95,
      pixelRatio: 1.5,
    });

    if (await isLikelyBlankDataUrl(jpeg)) {
      throw new Error('تصویر تولیدشده برای PDF خالی است.');
    }

    const img = await loadImageFromDataUrl(jpeg);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, img.naturalWidth || img.width);
    canvas.height = Math.max(1, img.naturalHeight || img.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context برای ساخت PDF در دسترس نیست.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    return canvas;
  } catch (error) {
    console.error('toJpeg failed:', error);
    throw new Error('تبدیل محتوای صفحه به تصویر برای PDF ناموفق بود.');
  }
}

function addPageCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement, addNewPage: boolean): void {
  const renderWidthMm = PDF_CONTENT_WIDTH_MM;
  const renderHeightMm = (canvas.height * renderWidthMm) / canvas.width;

  if (addNewPage) pdf.addPage();

  pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    PDF_MARGIN_MM,
    PDF_MARGIN_MM,
    renderWidthMm,
    renderHeightMm,
    undefined,
    'FAST'
  );
}

function downloadPdfBlob(pdf: jsPDF, fileName: string): void {
  const finalFileName = normalizeFileName(fileName);
  const blob = pdf.output('blob');

  if (!blob || blob.size === 0) {
    throw new Error('فایل PDF تولیدشده خالی است.');
  }

  const pdfBlob =
    blob.type === 'application/pdf'
      ? blob
      : new Blob([blob], { type: 'application/pdf' });

  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');

  link.href = url;
  link.download = finalFileName;
  link.type = 'application/pdf';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportElementToPdf(options: ExportPdfOptions): Promise<void> {
  const { element, fileName } = options;

  if (!element) {
    throw new Error('عنصر مورد نظر برای خروجی PDF پیدا نشد.');
  }

  if (!fileName?.trim()) {
    throw new Error('fileName الزامی است.');
  }

  const { width: sourceWidth, height: sourceHeight } = getSourceDimensions(element);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('محتوای گزارش هنوز کامل رندر نشده است.');
  }

  await waitForFonts();
  await waitForImages(element);
  await waitForLayout();

  const layoutWidthPx = Math.max(chooseExportLayoutWidth(element), PDF_CONTENT_WIDTH_PX);
  const measureRoot = createMeasureRoot(layoutWidthPx);
  document.body.appendChild(measureRoot);

  try {
    const sourceClone = cloneNodeForExport(element);
    sourceClone.style.width = `${layoutWidthPx}px`;
    sourceClone.style.maxWidth = 'none';
    sourceClone.style.minWidth = '0';
    sourceClone.style.background = '#ffffff';
    sourceClone.style.overflow = 'visible';

    prepareExportRoot(sourceClone);

    const pages = paginateContentBlocks(sourceClone, options, layoutWidthPx, measureRoot);

    if (!pages.length) {
      throw new Error('هیچ صفحه‌ای برای خروجی PDF ساخته نشد.');
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      document.body.appendChild(page);

      try {
        await waitForFonts();
        await waitForImages(page);
        await waitForLayout();

        const canvas = await renderNodeToCanvas(page);

        if (isLikelyBlankCanvas(canvas)) {
          throw new Error(`صفحه ${i + 1} خروجی خالی تولید کرد.`);
        }

        addPageCanvasToPdf(pdf, canvas, i > 0);
      } finally {
        page.remove();
      }
    }

    downloadPdfBlob(pdf, fileName);
  } catch (error) {
    console.error('PDF export failed:', error);

    const message =
      error instanceof Error ? error.message : 'خروجی PDF با خطای ناشناخته متوقف شد.';

    throw new Error(`خطا در خروجی PDF: ${message}`);
  } finally {
    measureRoot.remove();
  }
}
