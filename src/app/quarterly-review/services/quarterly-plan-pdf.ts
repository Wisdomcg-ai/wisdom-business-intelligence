/**
 * Draw the client's one-page plan.
 *
 * jsPDF, in the browser, like every other PDF this app makes — the monthly pack
 * records that constraint and there is no HTML-to-PDF renderer anywhere in the
 * codebase to borrow. The corner mark is the pack's, so a client who receives
 * both sees one brand.
 *
 * This file decides nothing about CONTENT: `buildPlanPage` does that, and is
 * tested on its own. Here it is only ink — measure a block, start a new page if
 * it will not fit, draw it.
 */
import jsPDF from 'jspdf';
import { LOGO_CORNER, LOGO_CORNER_SIZE } from '@/app/finances/monthly-report/services/pack-logo';
import type { PlanBlock, PlanPage } from '../utils/quarterly-plan-page';

// tailwind.config.js — the brand's own navy and orange, so the page matches the app.
const NAVY: [number, number, number] = [23, 34, 56];
const ORANGE: [number, number, number] = [245, 130, 31];
const TEXT: [number, number, number] = [33, 33, 33];
const MUTED: [number, number, number] = [117, 117, 117];
const RULE: [number, number, number] = [223, 223, 223];
const TILE: [number, number, number] = [246, 247, 249];

const MARGIN = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - MARGIN;

type Doc = jsPDF;

const setText = (doc: Doc, rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

function wrap(doc: Doc, text: string, size: number, width: number, style: 'normal' | 'bold' = 'normal'): string[] {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  return doc.splitTextToSize(text, width) as string[];
}

/** How tall a block will be, so it is never split across a page mid-thought. */
function blockHeight(doc: Doc, block: PlanBlock): number {
  const titleH = 4.5 + (block.kind === 'figures' && block.note ? 4 : 0);
  switch (block.kind) {
    case 'figures':
      return titleH + 20 + 5;
    case 'inline':
      return titleH + 6 + (block.footnote ? wrap(doc, block.footnote, 10, CONTENT_W).length * 4.6 + 1 : 0) + 4;
    case 'numbered':
    case 'bullets': {
      let h = titleH + 2;
      for (const item of block.items) {
        h += wrap(doc, item.text, 11, CONTENT_W - 9).length * 5;
        if (item.detail) h += wrap(doc, item.detail, 8.5, CONTENT_W - 9).length * 3.9 + 0.5;
        h += 2;
      }
      return h + 4;
    }
    case 'text':
      return titleH + wrap(doc, block.body, 11, CONTENT_W).length * 5 + 6;
    case 'checklist':
      return titleH + 2 + block.items.length * 6 + 4;
  }
}

function drawBlockTitle(doc: Doc, title: string, y: number, note?: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setText(doc, ORANGE);
  doc.text(title.toUpperCase(), MARGIN, y);
  let next = y + 4.5;
  if (note) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(note, MARGIN, next);
    next += 4;
  }
  return next;
}

function drawBlock(doc: Doc, block: PlanBlock, y: number): number {
  let cursor = drawBlockTitle(doc, block.title, y, block.kind === 'figures' ? block.note : undefined);

  switch (block.kind) {
    case 'figures': {
      const gap = 4;
      const w = (CONTENT_W - gap * (block.items.length - 1)) / block.items.length;
      block.items.forEach((item, i) => {
        const x = MARGIN + i * (w + gap);
        doc.setFillColor(TILE[0], TILE[1], TILE[2]);
        doc.roundedRect(x, cursor, w, 20, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        setText(doc, NAVY);
        doc.text(item.value, x + w / 2, cursor + 10.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        setText(doc, MUTED);
        doc.text(item.label, x + w / 2, cursor + 16, { align: 'center' });
      });
      return cursor + 20 + 5;
    }

    case 'inline': {
      // "Revenue $400,000  ·  Gross profit $160,000  ·  Net profit $40,000"
      let x = MARGIN;
      block.items.forEach((item, i) => {
        if (i > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          setText(doc, RULE);
          doc.text('·', x + 1.5, cursor + 3.4);
          x += 5;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setText(doc, MUTED);
        doc.text(item.label, x, cursor + 3.4);
        x += doc.getTextWidth(item.label) + 2;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        setText(doc, NAVY);
        doc.text(item.value, x, cursor + 3.4);
        x += doc.getTextWidth(item.value) + 3;
      });
      cursor += 6;

      if (block.footnote) {
        const lines = wrap(doc, block.footnote, 10, CONTENT_W);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setText(doc, TEXT);
        lines.forEach((line, i) => doc.text(line, MARGIN, cursor + 3.2 + i * 4.6));
        cursor += lines.length * 4.6 + 1;
      }
      return cursor + 4;
    }

    case 'numbered':
    case 'bullets': {
      cursor += 2;
      block.items.forEach((item, i) => {
        const marker = block.kind === 'numbered' ? `${i + 1}.` : '•';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setText(doc, ORANGE);
        doc.text(marker, MARGIN, cursor + 3.6);

        const lines = wrap(doc, item.text, 11, CONTENT_W - 9);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        setText(doc, TEXT);
        lines.forEach((line, li) => doc.text(line, MARGIN + 7, cursor + 3.6 + li * 5));
        cursor += lines.length * 5;

        if (item.detail) {
          const detail = wrap(doc, item.detail, 8.5, CONTENT_W - 9);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          setText(doc, MUTED);
          detail.forEach((line, li) => doc.text(line, MARGIN + 7, cursor + 3.2 + li * 3.9));
          cursor += detail.length * 3.9 + 0.5;
        }
        cursor += 2;
      });
      return cursor + 4;
    }

    case 'text': {
      const lines = wrap(doc, block.body, 11, CONTENT_W);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      setText(doc, TEXT);
      lines.forEach((line, i) => doc.text(line, MARGIN, cursor + 3.6 + i * 5));
      return cursor + lines.length * 5 + 6;
    }

    case 'checklist': {
      cursor += 2;
      block.items.forEach(item => {
        doc.setDrawColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.setLineWidth(0.3);
        doc.roundedRect(MARGIN, cursor, 4, 4, 0.6, 0.6, 'S');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        setText(doc, TEXT);
        doc.text(item, MARGIN + 7, cursor + 3.4);
        cursor += 6;
      });
      return cursor + 4;
    }
  }
}

function drawHeader(doc: Doc, page: PlanPage): number {
  // The corner mark, sized off its native pixels so it is never stretched.
  const markW = 28;
  const markH = (LOGO_CORNER_SIZE.h / LOGO_CORNER_SIZE.w) * markW;
  try {
    doc.addImage(LOGO_CORNER, 'PNG', PAGE_W - MARGIN - markW, MARGIN - 4, markW, markH);
  } catch {
    // A missing mark is not worth losing the client's plan over.
  }

  let y = MARGIN + 2;
  if (page.businessName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(doc, MUTED);
    doc.text(page.businessName.toUpperCase(), MARGIN, y);
    y += 7;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  setText(doc, NAVY);
  doc.text(page.title, MARGIN, y + 2);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  setText(doc, MUTED);
  doc.text(page.period, MARGIN, y + 2);
  y += 7;

  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 8;
}

/**
 * Footers last, once the page count is known.
 *
 * "Page 1 of 1" on a one-page plan is noise, so a single page gets the
 * preparation date alone — which is the fact a client needs when two versions
 * of the plan end up on the same desk.
 */
function drawFooters(doc: Doc, page: PlanPage): void {
  const total = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(page.preparedOn, MARGIN, PAGE_H - 10);
    if (total > 1) doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
}

/** Render the page. Synchronous, like the pack's generate(). */
export function renderPlanPdf(page: PlanPage): jsPDF {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = drawHeader(doc, page);

  for (const block of page.blocks) {
    const h = blockHeight(doc, block);
    if (y + h > BOTTOM && y > MARGIN + 40) {
      doc.addPage();
      y = MARGIN + 2;
    }
    y = drawBlock(doc, block, y);
  }

  drawFooters(doc, page);
  return doc;
}
