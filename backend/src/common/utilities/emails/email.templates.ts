/**
 * Transactional emails in the storefront's look: espresso header with the DI BARISTA
 * wordmark, a crema strip, milk-white card, crema pill buttons. Inline styles and tables
 * only, because email clients ignore stylesheets and web fonts.
 *
 * Every value that can come from a customer (names, addresses, messages) is HTML-escaped.
 */

export type EmailLocale = 'en' | 'ar';

export interface IEmailTemplateData {
  fullName?: string;
  otpCode?: string;
  expiresInMinutes?: number;
  orderReference?: string;
  amountFormatted?: string;
  currency?: string;
  couponCode?: string;
  discountDisplay?: string;
  endDateFormatted?: string;
  customMessage?: string;
  locale?: EmailLocale;
}

export interface IEmailOrderItem {
  imageUrl?: string | null;
  name: string;
  quantity: number;
  lineTotalCents: number;
  variantLabel?: string;
}

export interface IEmailOrder {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: IEmailOrderItem[];
  subTotalCents: number;
  discountCents: number;
  couponCode?: string | null;
  shippingFeeCents: number;
  giftCardCents?: number;
  totalCents: number;
  paymentMethod: string;
  status?: string;
  shippingAddress: { governorate?: string | null; street?: string; building?: string; city?: string; floor?: string; apartment?: string };
  notes?: string | null;
  locale?: EmailLocale;
}

export interface IRenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const C = {
  espresso: '#120D0A',
  roast: '#2B1E16',
  milk: '#F3EDE4',
  foam: '#FAF6F0',
  crema: '#F99D58',
  muted: '#6B5646',
  line: '#E2D7C8',
  good: '#3F7D4F',
  bad: '#B42318',
};

const FONT = `'Helvetica Neue', Helvetica, Arial, sans-serif`;
const WIDE = `'Arial Black', 'Helvetica Neue', Arial, sans-serif`;

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function storefrontUrl(): string {
  return (
    process.env.STOREFRONT_URL ||
    (process.env.CORS_ORIGINS || '').split(',')[0] ||
    'http://localhost:3000'
  )
    .trim()
    .replace(/\/+$/, '');
}

function money(cents: number, locale: EmailLocale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

const STRINGS = {
  en: {
    tagline: 'Specialty coffee, roasted in small batches.',
    footer: 'Loved coffee all along.',
    rights: (y: number) => `© ${y} DI BARISTA. All rights reserved.`,
    shop: 'Shop coffee',
    track: 'Track your order',
    hi: (n: string) => `Hi ${n},`,
    order: 'Order',
    item: 'Item',
    qty: 'Qty',
    subtotal: 'Subtotal',
    discount: 'Discount',
    shipping: 'Delivery',
    giftCard: 'Gift card',
    giftTitle: 'You received a gift card',
    giftBody: (amount: string) => `Someone sent you a DI BARISTA gift card worth ${amount}. Use the code below at checkout.`,
    giftExpires: (date: string) => `Valid until ${date}.`,
    total: 'Total',
    deliverTo: 'Delivering to',
    payment: 'Payment',
    methods: {
      CASH_ON_DELIVERY: 'Cash on delivery',
      PAYMOB_CARD: 'Card (paid)',
      MOBILE_WALLET: 'Mobile wallet (paid)',
    } as Record<string, string>,
    confirmedSubject: (n: string) => `Your DI BARISTA order ${n} is confirmed`,
    confirmedTitle: 'Your order is confirmed',
    confirmedCod: 'Thanks for your order! We’re roasting and packing it now. Please have the amount ready for the courier.',
    confirmedPaid: 'Thanks! Your payment went through and we’re roasting and packing your coffee now.',
    statusSubject: (n: string, s: string) => `Order ${n}: ${s}`,
    statuses: {
      CONFIRMED: ['Confirmed', 'Your order is confirmed. We’ll start preparing it soon.'],
      PREPARING: ['Being prepared', 'We’ve started roasting and packing your order.'],
      SHIPPED: ['On the way', 'The courier is on the way. Keep your phone close.'],
      DELIVERED: ['Delivered', 'Your order was delivered. Enjoy every cup!'],
      CANCELLED: ['Cancelled', 'Your order was cancelled. If this is unexpected, just reply to this email.'],
    } as Record<string, [string, string]>,
    refundSubject: (n: string) => `Refund processed for order ${n}`,
    refundTitle: 'Your refund is on its way',
    refundBody: (amount: string, n: string) =>
      `We’ve refunded ${amount} for order ${n}. Banks usually show it within 3–7 business days.`,
    note: 'Note',
    welcomeSubject: 'Welcome to DI BARISTA',
    welcomeTitle: 'You’re on the list',
    welcomeBody:
      'Thanks for subscribing. You’ll be the first to hear about new roasts, limited single origins and offers. No spam, just good coffee.',
    otpSubject: 'Your DI BARISTA verification code',
    otpTitle: 'Verify your email',
    otpBody: 'Use this code to finish creating your account:',
    resetSubject: 'Reset your DI BARISTA password',
    resetTitle: 'Password reset',
    resetBody: 'Use this code to reset your password:',
    expires: (m: number) => `The code expires in ${m} minutes. If you didn’t ask for it, you can ignore this email.`,
    promoTitle: 'A little something for your next cup',
    promoUse: 'Use this code at checkout',
    validUntil: (d: string) => `Valid until ${d}.`,
  },
  ar: {
    tagline: 'قهوة مختصة محمّصة على دفعات صغيرة.',
    footer: 'بنحب القهوة من زمان.',
    rights: (y: number) => `© ${y} دي باريستا. كل الحقوق محفوظة.`,
    shop: 'تسوّق القهوة',
    track: 'تتبع طلبك',
    hi: (n: string) => `أهلًا ${n}،`,
    order: 'طلب',
    item: 'المنتج',
    qty: 'الكمية',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    shipping: 'التوصيل',
    giftCard: 'كارت هدية',
    giftTitle: 'وصلك كارت هدية',
    giftBody: (amount: string) => `حد بعتلك كارت هدية من DI BARISTA بقيمة ${amount}. استخدم الكود ده وقت الدفع.`,
    giftExpires: (date: string) => `صالح لحد ${date}.`,
    total: 'الإجمالي',
    deliverTo: 'التوصيل إلى',
    payment: 'الدفع',
    methods: {
      CASH_ON_DELIVERY: 'كاش عند الاستلام',
      PAYMOB_CARD: 'كارت (مدفوع)',
      MOBILE_WALLET: 'محفظة موبايل (مدفوع)',
    } as Record<string, string>,
    confirmedSubject: (n: string) => `طلبك ${n} من دي باريستا اتأكد`,
    confirmedTitle: 'طلبك اتأكد',
    confirmedCod: 'شكرًا على طلبك! بنحمّص ونجهّز قهوتك دلوقتي. جهّز المبلغ للمندوب لو سمحت.',
    confirmedPaid: 'شكرًا! الدفع وصل، وبنحمّص ونجهّز قهوتك دلوقتي.',
    statusSubject: (n: string, s: string) => `طلب ${n}: ${s}`,
    statuses: {
      CONFIRMED: ['اتأكد', 'طلبك اتأكد، وهنبدأ نجهّزه قريب.'],
      PREPARING: ['بيتجهّز', 'بدأنا نحمّص ونغلّف طلبك.'],
      SHIPPED: ['في الطريق', 'المندوب في الطريق ليك، خلّي موبايلك جنبك.'],
      DELIVERED: ['وصل', 'طلبك وصل. بالهنا والشفا!'],
      CANCELLED: ['اتلغى', 'طلبك اتلغى. لو ده مش متوقع، رد على الإيميل ده.'],
    } as Record<string, [string, string]>,
    refundSubject: (n: string) => `فلوس الطلب ${n} اترجعت`,
    refundTitle: 'فلوسك في الطريق',
    refundBody: (amount: string, n: string) =>
      `رجّعنا ${amount} للطلب ${n}. البنك عادة بيعرضها خلال ٣ لـ ٧ أيام عمل.`,
    note: 'ملاحظة',
    welcomeSubject: 'أهلًا بيك في دي باريستا',
    welcomeTitle: 'اتسجّلت معانا',
    welcomeBody: 'شكرًا على اشتراكك. هتكون أول واحد يعرف بالتحميصات الجديدة والمحاصيل المحدودة والعروض. من غير إزعاج، قهوة حلوة وبس.',
    otpSubject: 'كود التفعيل من دي باريستا',
    otpTitle: 'فعّل إيميلك',
    otpBody: 'استخدم الكود ده علشان تكمّل إنشاء حسابك:',
    resetSubject: 'تغيير كلمة السر في دي باريستا',
    resetTitle: 'تغيير كلمة السر',
    resetBody: 'استخدم الكود ده علشان تغيّر كلمة السر:',
    expires: (m: number) => `الكود صالح لمدة ${m} دقيقة. لو مطلبتهوش، تجاهل الإيميل ده.`,
    promoTitle: 'هدية صغيرة لفنجانك الجاي',
    promoUse: 'استخدم الكود ده وانت بتكمّل الطلب',
    validUntil: (d: string) => `صالح لحد ${d}.`,
  },
};

type Strings = (typeof STRINGS)['en'];

function L(locale?: EmailLocale): { s: Strings; dir: 'ltr' | 'rtl'; align: 'left' | 'right'; locale: EmailLocale } {
  const loc: EmailLocale = locale === 'ar' ? 'ar' : 'en';
  return {
    s: STRINGS[loc] as Strings,
    dir: loc === 'ar' ? 'rtl' : 'ltr',
    align: loc === 'ar' ? 'right' : 'left',
    locale: loc,
  };
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;"><tr><td style="border-radius:999px;background:${C.crema};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-family:${WIDE};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.espresso};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

function eyebrow(text: string): string {
  return `<p style="margin:0 0 10px;font-family:${WIDE};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${C.muted};">${escapeHtml(text)}</p>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:${C.espresso};">${escapeHtml(text)}</h1>`;
}

function para(text: string, color = C.roast): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${color};">${escapeHtml(text)}</p>`;
}

function codeBox(code: string): string {
  return `<div style="margin:22px 0;padding:20px;border:1px dashed ${C.crema};border-radius:16px;background:${C.milk};text-align:center;">
    <span style="font-family:${WIDE};font-size:30px;letter-spacing:10px;color:${C.espresso};">${escapeHtml(code)}</span>
  </div>`;
}

/** Shared frame for every email */
function layout(opts: { title: string; preheader: string; body: string; locale?: EmailLocale }): string {
  const { s, dir, align } = L(opts.locale);
  const site = storefrontUrl();
  const lang = opts.locale === 'ar' ? 'ar' : 'en';
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.milk};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.milk};padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:24px;overflow:hidden;background:${C.foam};" dir="${dir}">
    <tr><td style="height:8px;background:${C.crema};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="background:${C.espresso};padding:30px 32px 26px;text-align:center;">
      <a href="${escapeHtml(site)}/${lang}" style="text-decoration:none;">
        <span style="font-family:${WIDE};font-size:30px;letter-spacing:9px;color:${C.foam};">DI&nbsp;BARISTA</span>
      </a>
      <p style="margin:10px 0 0;font-family:${FONT};font-size:12px;letter-spacing:1px;color:#B9A390;">${escapeHtml(s.tagline)}</p>
    </td></tr>
    <tr><td style="padding:34px 32px 30px;text-align:${align};" dir="${dir}">
      ${opts.body}
    </td></tr>
    <tr><td style="padding:22px 32px 28px;border-top:1px solid ${C.line};text-align:center;">
      <p style="margin:0 0 10px;font-family:${FONT};font-size:14px;font-weight:700;color:${C.espresso};">${escapeHtml(s.footer)}</p>
      <p style="margin:0 0 12px;font-family:${WIDE};font-size:10px;letter-spacing:2px;text-transform:uppercase;">
        <a href="${escapeHtml(site)}/${lang}#shop" style="color:${C.muted};text-decoration:none;">${escapeHtml(s.shop)}</a>
        &nbsp;·&nbsp;
        <a href="${escapeHtml(site)}/${lang}/track-order" style="color:${C.muted};text-decoration:none;">${escapeHtml(s.track)}</a>
      </p>
      <p style="margin:0;font-family:${FONT};font-size:11px;color:#9A8676;">${escapeHtml(s.rights(new Date().getFullYear()))}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function orderTable(order: IEmailOrder, locale: EmailLocale): string {
  const { s, align } = L(locale);
  const end = align === 'left' ? 'right' : 'left';
  const cell = `font-family:${FONT};font-size:14px;color:${C.roast};padding:10px 0;border-bottom:1px solid ${C.line};`;
  const rows = order.items
    .map(
      (it) => `<tr>
        <td style="${cell}text-align:${align};">${
          it.imageUrl
            ? `<img src="${escapeHtml(absoluteUrl(it.imageUrl))}" width="44" height="44" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:10px;vertical-align:middle;margin-${align === 'left' ? 'right' : 'left'}:10px;background:${C.milk};" />`
            : ''
        }${escapeHtml(it.name)}${
          it.variantLabel ? `<br/><span style="font-size:12px;color:${C.muted};">${escapeHtml(it.variantLabel)}</span>` : ''
        }</td>
        <td style="${cell}text-align:center;color:${C.muted};white-space:nowrap;">× ${it.quantity}</td>
        <td style="${cell}text-align:${end};white-space:nowrap;">${escapeHtml(money(it.lineTotalCents, locale))}</td>
      </tr>`,
    )
    .join('');
  const line = (label: string, value: string, strong = false) => `<tr>
      <td colspan="2" style="font-family:${FONT};font-size:${strong ? 16 : 14}px;${strong ? 'font-weight:700;' : ''}color:${strong ? C.espresso : C.muted};padding:${strong ? '12px' : '5px'} 0 0;text-align:${align};">${escapeHtml(label)}</td>
      <td style="font-family:${FONT};font-size:${strong ? 16 : 14}px;${strong ? 'font-weight:700;' : ''}color:${C.espresso};padding:${strong ? '12px' : '5px'} 0 0;text-align:${end};white-space:nowrap;">${escapeHtml(value)}</td>
    </tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;">
    ${rows}
    ${line(s.subtotal, money(order.subTotalCents, locale))}
    ${order.discountCents > 0 ? line(`${s.discount}${order.couponCode ? ` (${order.couponCode})` : ''}`, `−${money(order.discountCents, locale)}`) : ''}
    ${line(s.shipping, money(order.shippingFeeCents, locale))}
    ${order.giftCardCents ? line(s.giftCard, `−${money(order.giftCardCents, locale)}`) : ''}
    ${line(s.total, money(order.totalCents, locale), true)}
  </table>`;
}

function orderMeta(order: IEmailOrder, locale: EmailLocale): string {
  const { s } = L(locale);
  const a = order.shippingAddress || {};
  const address = [a.street, a.building, a.city, a.governorate].filter(Boolean).join(locale === 'ar' ? '، ' : ', ');
  const block = (label: string, value: string) =>
    `<td valign="top" style="padding:14px 16px;background:${C.milk};border-radius:14px;width:50%;">
      ${eyebrow(label)}
      <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.roast};">${escapeHtml(value)}</p>
    </td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin:14px -8px 0;">
    <tr>
      ${block(s.deliverTo, address || '—')}
      ${block(s.payment, s.methods[order.paymentMethod] || order.paymentMethod)}
    </tr>
  </table>`;
}

function absoluteUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${storefrontUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
}

function trackUrl(order: IEmailOrder, locale: EmailLocale): string {
  return `${storefrontUrl()}/${locale}/track-order?order=${encodeURIComponent(order.orderNumber)}`;
}

function textVersion(lines: Array<string | false | undefined>): string {
  return lines.filter(Boolean).join('\n');
}

export class EmailTemplates {
  /** Order placed (cash) or paid (card / wallet) */
  static orderConfirmation(order: IEmailOrder, paid: boolean): IRenderedEmail {
    const { s, locale } = L(order.locale);
    const subject = s.confirmedSubject(order.orderNumber);
    const intro = paid ? s.confirmedPaid : s.confirmedCod;
    const body = `
      ${eyebrow(`${s.order} ${order.orderNumber}`)}
      ${heading(s.confirmedTitle)}
      ${para(s.hi(order.customerName))}
      ${para(intro)}
      ${orderTable(order, locale)}
      ${orderMeta(order, locale)}
      ${button(trackUrl(order, locale), s.track)}`;
    return {
      subject,
      html: layout({ title: subject, preheader: intro, body, locale }),
      text: textVersion([
        s.confirmedTitle,
        `${s.order}: ${order.orderNumber}`,
        intro,
        ...order.items.map((i) => `- ${i.name} x${i.quantity}: ${money(i.lineTotalCents, locale)}`),
        `${s.total}: ${money(order.totalCents, locale)}`,
        `${s.track}: ${trackUrl(order, locale)}`,
      ]),
    };
  }

  /** Staff moved the order forward (roasting, out for delivery, delivered, cancelled…) */
  static orderStatusUpdate(order: IEmailOrder, status: string): IRenderedEmail | null {
    const { s, locale } = L(order.locale);
    const copy = s.statuses[status];
    if (!copy) return null;
    const [label, message] = copy;
    const subject = s.statusSubject(order.orderNumber, label);
    const body = `
      ${eyebrow(`${s.order} ${order.orderNumber}`)}
      ${heading(label)}
      ${para(s.hi(order.customerName))}
      ${para(message)}
      ${status === 'CANCELLED' ? '' : button(trackUrl(order, locale), s.track)}`;
    return {
      subject,
      html: layout({ title: subject, preheader: message, body, locale }),
      text: textVersion([label, `${s.order}: ${order.orderNumber}`, message, `${s.track}: ${trackUrl(order, locale)}`]),
    };
  }

  static newsletterWelcome(locale?: EmailLocale): IRenderedEmail {
    const { s, locale: loc } = L(locale);
    const body = `
      ${heading(s.welcomeTitle)}
      ${para(s.welcomeBody)}
      ${button(`${storefrontUrl()}/${loc}#shop`, s.shop)}`;
    return {
      subject: s.welcomeSubject,
      html: layout({ title: s.welcomeSubject, preheader: s.welcomeBody, body, locale: loc }),
      text: textVersion([s.welcomeTitle, s.welcomeBody, `${storefrontUrl()}/${loc}`]),
    };
  }

  /** Internal: a new order landed (sent to ADMIN_NOTIFY_EMAIL) */
  static adminNewOrder(order: IEmailOrder, paid: boolean): IRenderedEmail {
    const subject = `New order ${order.orderNumber} · ${money(order.totalCents, 'en')}${paid ? ' · PAID' : ' · COD'}`;
    const body = `
      ${eyebrow('New order')}
      ${heading(order.orderNumber)}
      ${para(`${order.customerName} · ${order.customerEmail}${order.customerPhone ? ` · ${order.customerPhone}` : ''}`)}
      ${order.notes ? para(`Notes: ${order.notes}`, C.muted) : ''}
      ${orderTable({ ...order, locale: 'en' }, 'en')}
      ${orderMeta({ ...order, locale: 'en' }, 'en')}
      ${button(`${storefrontUrl()}/admin`, 'Open dashboard')}`;
    return {
      subject,
      html: layout({ title: subject, preheader: subject, body, locale: 'en' }),
      text: textVersion([subject, `${order.customerName} <${order.customerEmail}>`]),
    };
  }

  /** Internal: a customer wrote through the footer form */
  static adminNewMessage(msg: { email: string; message: string; locale?: string }): IRenderedEmail {
    const subject = `New message from ${msg.email}`;
    const body = `
      ${eyebrow(`Customer message · ${String(msg.locale || 'en').toUpperCase()}`)}
      ${heading(msg.email)}
      <div style="margin:8px 0 0;padding:18px;border-radius:14px;background:${C.milk};font-family:${FONT};font-size:15px;line-height:1.65;color:${C.roast};white-space:pre-wrap;" dir="auto">${escapeHtml(msg.message)}</div>
      ${button(`mailto:${msg.email}`, 'Reply')}`;
    return {
      subject,
      html: layout({ title: subject, preheader: msg.message.slice(0, 90), body, locale: 'en' }),
      text: textVersion([subject, '', msg.message]),
    };
  }

  static verificationOtp(data: IEmailTemplateData): IRenderedEmail {
    const { s, locale } = L(data.locale);
    const minutes = data.expiresInMinutes ?? 10;
    const body = `
      ${heading(s.otpTitle)}
      ${data.fullName ? para(s.hi(data.fullName)) : ''}
      ${para(s.otpBody)}
      ${codeBox(data.otpCode || '')}
      ${para(s.expires(minutes), C.muted)}`;
    return {
      subject: s.otpSubject,
      html: layout({ title: s.otpSubject, preheader: s.otpBody, body, locale }),
      text: textVersion([s.otpTitle, s.otpBody, data.otpCode, s.expires(minutes)]),
    };
  }

  static passwordResetOtp(data: IEmailTemplateData): IRenderedEmail {
    const { s, locale } = L(data.locale);
    const minutes = data.expiresInMinutes ?? 10;
    const body = `
      ${heading(s.resetTitle)}
      ${data.fullName ? para(s.hi(data.fullName)) : ''}
      ${para(s.resetBody)}
      ${codeBox(data.otpCode || '')}
      ${para(s.expires(minutes), C.muted)}`;
    return {
      subject: s.resetSubject,
      html: layout({ title: s.resetSubject, preheader: s.resetBody, body, locale }),
      text: textVersion([s.resetTitle, s.resetBody, data.otpCode, s.expires(minutes)]),
    };
  }

  /** Kept for callers that only know the amount (prefer orderConfirmation) */
  static paymentReceipt(data: IEmailTemplateData): IRenderedEmail {
    const { s, locale } = L(data.locale);
    const subject = s.confirmedSubject(data.orderReference || '');
    const body = `
      ${eyebrow(`${s.order} ${data.orderReference || ''}`)}
      ${heading(s.confirmedTitle)}
      ${data.fullName ? para(s.hi(data.fullName)) : ''}
      ${para(s.confirmedPaid)}
      ${para(`${s.total}: ${data.amountFormatted || ''} ${data.currency || 'EGP'}`)}`;
    return {
      subject,
      html: layout({ title: subject, preheader: s.confirmedPaid, body, locale }),
      text: textVersion([s.confirmedTitle, data.orderReference, s.confirmedPaid]),
    };
  }

  static promoCouponAnnouncement(data: IEmailTemplateData): IRenderedEmail {
    const { s, locale } = L(data.locale);
    const subject = `${s.promoTitle}: ${data.discountDisplay ?? ''} · ${data.couponCode ?? ''}`;
    const body = `
      ${heading(s.promoTitle)}
      ${data.customMessage ? para(data.customMessage) : ''}
      ${eyebrow(s.promoUse)}
      ${codeBox(data.couponCode || '')}
      ${para(`${data.discountDisplay ?? ''}. ${data.endDateFormatted ? s.validUntil(data.endDateFormatted) : ''}`, C.muted)}
      ${button(`${storefrontUrl()}/${locale}#shop`, s.shop)}`;
    return {
      subject,
      html: layout({ title: subject, preheader: subject, body, locale }),
      text: textVersion([s.promoTitle, data.customMessage, data.couponCode, data.discountDisplay]),
    };
  }

  static orderRefunded(data: IEmailTemplateData): IRenderedEmail {
    const { s, locale } = L(data.locale);
    const amount = `${data.amountFormatted ?? ''} ${data.currency ?? 'EGP'}`.trim();
    const subject = s.refundSubject(data.orderReference || '');
    const message = s.refundBody(amount, data.orderReference || '');
    const body = `
      ${eyebrow(`${s.order} ${data.orderReference || ''}`)}
      ${heading(s.refundTitle)}
      ${data.fullName ? para(s.hi(data.fullName)) : ''}
      ${para(message)}
      ${data.customMessage ? para(`${s.note}: ${data.customMessage}`, C.muted) : ''}`;
    return {
      subject,
      html: layout({ title: subject, preheader: message, body, locale }),
      text: textVersion([s.refundTitle, message, data.customMessage]),
    };
  }

  static giftCard(data: { code: string; amountCents: number; message?: string | null; expiresAt?: Date | null; locale?: EmailLocale }): IRenderedEmail {
    const { s, locale } = L(data.locale);
    const amount = money(data.amountCents, locale);
    const subject = `${s.giftTitle} · ${amount}`;
    const body = `
      ${heading(s.giftTitle)}
      ${para(s.giftBody(amount))}
      ${data.message ? `<div style="margin:0 0 14px;padding:16px;border-radius:14px;background:${C.milk};font-family:${FONT};font-size:15px;line-height:1.6;color:${C.roast};white-space:pre-wrap;" dir="auto">${escapeHtml(data.message)}</div>` : ''}
      ${codeBox(data.code)}
      ${data.expiresAt ? para(s.giftExpires(data.expiresAt.toISOString().slice(0, 10)), C.muted) : ''}
      ${button(`${storefrontUrl()}/${locale}#shop`, s.shop)}`;
    return {
      subject,
      html: layout({ title: subject, preheader: s.giftBody(amount), body, locale }),
      text: textVersion([s.giftTitle, s.giftBody(amount), data.message ?? undefined, data.code]),
    };
  }
}
