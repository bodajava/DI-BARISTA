import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { join } from 'path';
import { PrismaService } from '../../database/prisma.service';

const FONT_DIR = join(require.resolve('dejavu-fonts-ttf/package.json'), '..', 'ttf');
const REGULAR = join(FONT_DIR, 'DejaVuSans.ttf');
const BOLD = join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

const C = { ink: '#2B1D14', muted: '#7A6656', line: '#E7DCD1', accent: '#F99D58', soft: '#F6EFE7' };

const METHOD: Record<string, string> = {
  CASH_ON_DELIVERY: 'Cash on delivery · الدفع عند الاستلام',
  PAYMOB_CARD: 'Card · بطاقة',
  MOBILE_WALLET: 'Mobile wallet · محفظة',
};

function money(cents: number): string {
  return `${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} EGP`;
}

/**
 * Printable invoice / packing slip: bilingual, Arabic drawn with a font that has Arabic glyphs.
 * fontkit shapes and orders each Arabic run itself; mixed lines are split into runs and placed
 * right-to-left, so "طلب DIB-123" comes out the right way round.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async render(orderId: string): Promise<Buffer> {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId.toUpperCase() }] },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('This order no longer exists');

    const images = await Promise.all(order.items.map((i) => this.fetchImage(i.imageUrl)));

    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${order.orderNumber}` } });
    doc.registerFont('regular', REGULAR);
    doc.registerFont('bold', BOLD);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const left = 40;
    const width = doc.page.width - 80;
    const right = left + width;

    // Header band
    doc.rect(0, 0, doc.page.width, 8).fill(C.accent);
    doc.font('bold').fontSize(22).fillColor(C.ink).text('DI BARISTA', left, 32, { characterSpacing: 4 });
    this.line(doc, 'Invoice · فاتورة', left, 38, width, { align: 'right', size: 12, bold: true, color: C.muted });
    this.line(doc, order.orderNumber, left, 56, width, { align: 'right', size: 14, bold: true });
    this.line(doc, order.createdAt.toISOString().replace('T', ' ').slice(0, 16), left, 76, width, {
      align: 'right',
      size: 9,
      color: C.muted,
    });

    // Customer + address + payment
    let y = 110;
    doc.roundedRect(left, y, width, 96, 10).fill(C.soft);
    const half = width / 2 - 16;
    this.line(doc, 'Customer · العميل', left + 14, y + 12, half, { size: 8, color: C.muted, bold: true });
    this.line(doc, order.customerName, left + 14, y + 26, half, { size: 11, bold: true });
    this.line(doc, order.customerPhone, left + 14, y + 44, half, { size: 10 });
    this.line(doc, order.customerEmail, left + 14, y + 60, half, { size: 9, color: C.muted });

    const col2 = left + width / 2 + 2;
    this.line(doc, 'Deliver to · التوصيل', col2, y + 12, half, { size: 8, color: C.muted, bold: true });
    this.line(doc, [order.governorate, order.city].filter(Boolean).join(' · '), col2, y + 26, half, { size: 10, bold: true });
    this.line(doc, order.street, col2, y + 42, half, { size: 9 });
    const extra = [
      order.building !== 'NA' ? `Bldg ${order.building}` : '',
      order.floor !== 'NA' ? `Floor ${order.floor}` : '',
      order.apartment !== 'NA' ? `Apt ${order.apartment}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (extra) this.line(doc, extra, col2, y + 56, half, { size: 9 });
    this.line(doc, METHOD[order.paymentMethod] ?? order.paymentMethod, col2, y + 72, half, { size: 9, color: C.muted });

    // Items
    y += 116;
    this.line(doc, 'Pieces · المنتجات', left, y, width, { size: 9, bold: true, color: C.muted });
    y += 18;
    order.items.forEach((item, idx) => {
      if (y > doc.page.height - 200) {
        doc.addPage();
        y = 40;
      }
      const img = images[idx];
      if (img) {
        try {
          doc.image(img, left, y, { fit: [40, 40] });
        } catch {
          /* unsupported image type: skip the photo */
        }
      }
      const textX = left + 52;
      this.line(doc, item.name, textX, y + 2, width - 220, { size: 10, bold: true });
      const sub = [item.variantLabel, item.sku].filter(Boolean).join(' · ');
      this.line(doc, sub, textX, y + 16, width - 220, { size: 8, color: C.muted });
      if (item.nameAr) this.line(doc, item.nameAr, textX, y + 28, width - 220, { size: 8, color: C.muted, align: 'left' });
      this.line(doc, `${item.quantity} × ${money(item.unitPriceCents)}`, right - 210, y + 8, 110, { size: 9, align: 'right' });
      this.line(doc, money(item.lineTotalCents), right - 100, y + 8, 100, { size: 10, bold: true, align: 'right' });
      y += 48;
      doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor(C.line).lineWidth(0.6).stroke();
    });

    // Totals
    y += 6;
    const row = (label: string, value: string, strong = false) => {
      this.line(doc, label, right - 300, y, 190, { size: strong ? 12 : 9, bold: strong, color: strong ? C.ink : C.muted });
      this.line(doc, value, right - 110, y, 110, { size: strong ? 12 : 9, bold: strong, align: 'right' });
      y += strong ? 22 : 16;
    };
    row('Subtotal · المجموع', money(order.subTotalCents));
    if (order.discountCents) row(`Discount${order.couponCode ? ` (${order.couponCode})` : ''} · خصم`, `−${money(order.discountCents)}`);
    row('Delivery · التوصيل', money(order.shippingFeeCents));
    if (order.giftCardCents) row('Gift card · كارت هدية', `−${money(order.giftCardCents)}`);
    if (order.loyaltyCents) row('Points · نقاط', `−${money(order.loyaltyCents)}`);
    row('Total · الإجمالي', money(order.totalCents), true);
    if (order.refundedCents) row('Refunded · مسترد', `−${money(order.refundedCents)}`);

    // Amount to collect (cash orders)
    const collect =
      order.paymentMethod === 'CASH_ON_DELIVERY' &&
      order.paymentStatus === 'UNPAID' &&
      !['CANCELLED', 'REFUNDED'].includes(order.status)
        ? order.totalCents
        : 0;
    y += 10;
    doc.roundedRect(left, y, width, 46, 10).fill(collect ? C.accent : C.soft);
    this.line(doc, collect ? 'Collect on delivery · المطلوب تحصيله' : order.status === 'REFUNDED' ? 'Refunded · مسترد' : order.status === 'CANCELLED' ? 'Cancelled · ملغي' : 'Paid · مدفوع', left + 16, y + 16, width / 2, {
      size: 11,
      bold: true,
    });
    this.line(doc, money(collect || 0), left + width / 2, y + 14, width / 2 - 16, { size: 15, bold: true, align: 'right' });

    if (order.notes) {
      y += 64;
      this.line(doc, 'Notes · ملاحظات', left, y, width, { size: 8, bold: true, color: C.muted });
      this.line(doc, order.notes.slice(0, 400), left, y + 14, width, { size: 9 });
    }

    doc.end();
    return done;
  }

  /** One line of text that may mix Arabic and Latin */
  private line(
    doc: PDFKit.PDFDocument,
    text: string | null | undefined,
    x: number,
    y: number,
    width: number,
    opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' } = {},
  ): void {
    const value = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    doc.font(opts.bold ? 'bold' : 'regular').fontSize(opts.size ?? 10).fillColor(opts.color ?? C.ink);

    if (!ARABIC.test(value)) {
      doc.text(value, x, y, { width, align: opts.align ?? 'left', lineBreak: false, ellipsis: true });
      return;
    }

    // Words are drawn one by one: Arabic words are shaped by fontkit, and the order of the
    // words is laid out right-to-left for Arabic runs (and for the whole line when it starts in
    // Arabic), so mixed lines like "Total · الإجمالي" read correctly.
    const words = value.split(' ');
    const runs: Array<{ rtl: boolean; words: string[] }> = [];
    for (const word of words) {
      const isRtl = ARABIC.test(word);
      const last = runs[runs.length - 1];
      if (last && (last.rtl === isRtl || (!isRtl && /^[\d.,:·\-–()%]+$/.test(word) && last.rtl))) last.words.push(word);
      else runs.push({ rtl: isRtl, words: [word] });
    }
    const lineRtl = ARABIC.test(words[0] ?? '');
    const visual: string[] = [];
    for (const run of lineRtl ? [...runs].reverse() : runs) {
      visual.push(...(run.rtl ? [...run.words].reverse() : run.words));
    }
    const space = doc.widthOfString(' ');
    const widths = visual.map((w) => doc.widthOfString(w));
    const total = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, visual.length - 1);
    const alignRight = opts.align === 'right' || (lineRtl && opts.align !== 'left');
    let cursor = alignRight ? x + Math.max(0, width - total) : x;
    visual.forEach((word, i) => {
      if (cursor + widths[i] <= x + width + 0.5) doc.text(word, cursor, y, { lineBreak: false });
      cursor += widths[i] + space;
    });
  }

  private async fetchImage(url: string | null): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const base = process.env.API_PUBLIC_URL || process.env.STOREFRONT_URL || '';
      const absolute = /^https?:\/\//i.test(url) ? url : `${base.replace(/\/+$/, '')}${url}`;
      if (!/^https?:\/\//i.test(absolute)) return null;
      const res = await fetch(absolute, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      // pdfkit draws JPEG and PNG only
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      return isJpeg || isPng ? buf : null;
    } catch (error) {
      this.logger.debug(`Invoice image skipped: ${(error as Error).message}`);
      return null;
    }
  }
}
