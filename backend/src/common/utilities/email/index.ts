import { BadRequestException, Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';

const logger = new Logger('EmailDeliverability');

/** Throwaway inboxes that only exist to dodge sign-ups */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
]);

/**
 * Format is checked by the DTO; this also makes sure the domain can actually receive mail
 * (MX or A records), so typos like "gmial.con" are rejected. If DNS itself is unreachable
 * or slow (3s), the visitor is not blocked.
 */
export async function assertDeliverableEmail(email: string): Promise<void> {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domain || DISPOSABLE_DOMAINS.has(domain)) {
    throw new BadRequestException('Please use a real email address');
  }

  const hasRecords = async (resolve: () => Promise<unknown[]>) => {
    try {
      return (await resolve()).length > 0;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENODATA' || code === 'ENOTFOUND') return false;
      throw error;
    }
  };

  const lookup = async () =>
    (await hasRecords(() => dns.resolveMx(domain))) ||
    (await hasRecords(() => dns.resolve4(domain)));

  let deliverable = true;
  try {
    deliverable = await Promise.race([
      lookup(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 3000)),
    ]);
  } catch (error) {
    logger.warn(`DNS check skipped for ${domain}: ${(error as Error).message}`);
  }
  if (!deliverable) {
    throw new BadRequestException('This email domain does not accept mail');
  }
}
