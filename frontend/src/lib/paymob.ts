import crypto from 'node:crypto';
import { getServerEnv } from './env';

export interface IPaymobTransactionLike {
  amount_cents?: number | string;
  created_at?: string;
  currency?: string;
  error_occured?: boolean | string;
  has_parent_transaction?: boolean | string;
  id?: number | string;
  integration_id?: number | string;
  is_3d_secure?: boolean | string;
  is_auth?: boolean | string;
  is_capture?: boolean | string;
  is_refunded?: boolean | string;
  is_standalone_payment?: boolean | string;
  is_voided?: boolean | string;
  order?: { id?: number | string; merchant_order_id?: string | null };
  owner?: number | string;
  pending?: boolean | string;
  source_data?: {
    pan?: string;
    sub_type?: string;
    type?: string;
  };
  success?: boolean | string;
}

/**
 * Computes Paymob Accept HMAC-SHA512 over the canonical 20 transaction fields
 * and compares in constant time against query HMAC.
 */
export function verifyPaymobWebhookHmac(
  obj: IPaymobTransactionLike | undefined,
  receivedHmac: string | null | undefined,
): boolean {
  const { paymobHmacSecret } = getServerEnv();
  if (!obj || !receivedHmac || !paymobHmacSecret) {
    return false;
  }

  const s = (v: unknown): string =>
    v === undefined || v === null ? '' : String(v);

  const concatenated = [
    s(obj.amount_cents),
    s(obj.created_at),
    s(obj.currency),
    s(obj.error_occured),
    s(obj.has_parent_transaction),
    s(obj.id),
    s(obj.integration_id),
    s(obj.is_3d_secure),
    s(obj.is_auth),
    s(obj.is_capture),
    s(obj.is_refunded),
    s(obj.is_standalone_payment),
    s(obj.is_voided),
    s(obj.order?.id),
    s(obj.owner),
    s(obj.pending),
    s(obj.source_data?.pan),
    s(obj.source_data?.sub_type),
    s(obj.source_data?.type),
    s(obj.success),
  ].join('');

  const computedHex = crypto
    .createHmac('sha512', paymobHmacSecret)
    .update(concatenated)
    .digest('hex');

  try {
    const a = Buffer.from(computedHex, 'hex');
    const b = Buffer.from(receivedHmac.trim(), 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
