/** Canonical site facts shared by metadata, sitemap, robots and structured data */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

export const SITE_NAME = 'DIBARESTA CAFFE';

export const SITE_DESCRIPTION =
  'Specialty coffee from Cairo: coffee capsules, coffee beans and grinded coffee, delivered across Egypt.';

export const SITE_KEYWORDS = [
  'specialty coffee Egypt',
  'coffee beans Cairo',
  'buy coffee online Egypt',
  'coffee capsules Egypt',
  'Turkish coffee',
  'قهوة مختصة',
  'بن مختص القاهرة',
  'قهوة تركي',
  'شراء قهوة اونلاين مصر',
];

/** Serialize JSON-LD safely: `<` is escaped so data can never close the <script> tag */
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Social accounts shown in the footer. Leave a value empty to hide it.
 * Set them with env vars so no code change is needed, e.g. NEXT_PUBLIC_INSTAGRAM_URL.
 */
export const SOCIAL_LINKS: Array<{ name: string; url: string }> = [
  { name: 'Instagram', url: process.env.NEXT_PUBLIC_INSTAGRAM_URL || '' },
  { name: 'TikTok', url: process.env.NEXT_PUBLIC_TIKTOK_URL || '' },
  { name: 'Facebook', url: process.env.NEXT_PUBLIC_FACEBOOK_URL || '' },
  { name: 'WhatsApp', url: process.env.NEXT_PUBLIC_WHATSAPP_URL || '' },
].filter((link) => /^https:\/\//.test(link.url));
