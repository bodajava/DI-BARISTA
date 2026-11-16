import { randomBytes } from 'crypto';

const ARABIC_DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u0640]/g;

/**
 * Generates an English and Arabic URL-safe slug (stripping diacritics and replacing whitespace/special chars with dashes)
 */
export function generateSlug(
  value: string,
  appendUniqueSuffix = false,
): string {
  if (!value || !value.trim()) {
    return appendUniqueSuffix ? randomBytes(3).toString('hex') : '';
  }

  let slug = value
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    // Strip Arabic diacritics (Tashkeel) and Tatweel
    .replace(ARABIC_DIACRITICS_REGEX, '')
    // Normalize Arabic Alef variants (أ إ آ -> ا)
    .replace(/[أإآ]/g, 'ا')
    // Keep Latin a-z0-9, Arabic letters (\u0621-\u064A), and spaces/hyphens
    .replace(/[^a-z0-9\u0621-\u064A\s-]/g, '')
    // Replace whitespace and underscores with hyphens
    .replace(/[\s_-]+/g, '-')
    // Collapse multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');

  if (appendUniqueSuffix) {
    const suffix = randomBytes(3).toString('hex');
    slug = slug ? `${slug}-${suffix}` : suffix;
  }

  return slug;
}

export class SlugUtil {
  static generate(input: string, appendUniqueSuffix = false): string {
    return generateSlug(input, appendUniqueSuffix);
  }

  static generateSlug(input: string, appendUniqueSuffix = false): string {
    return generateSlug(input, appendUniqueSuffix);
  }
}
