import { Allow, IsObject, IsOptional, IsString } from 'class-validator';

export interface IPaymobTransactionObj {
  id: number;
  pending: boolean;
  amount_cents: number;
  success: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  is_refunded: boolean;
  is_3d_secure: boolean;
  integration_id: number;
  has_parent_transaction: boolean;
  order: {
    id: number;
    merchant_order_id?: string;
  };
  created_at: string;
  currency: string;
  error_occured: boolean;
  owner: number;
  source_data: {
    pan: string;
    type: string;
    sub_type: string;
  };
  data?: {
    message?: string;
  };
}

export class PaymobWebhookDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsObject()
  obj: IPaymobTransactionObj;

  // Extra top-level fields Paymob sends with every callback. They must be declared, or the
  // global forbidNonWhitelisted validation would reject real webhooks with a 400.
  @Allow()
  issuer_bank?: unknown;

  @Allow()
  transaction_processed_callback_responses?: unknown;
}

