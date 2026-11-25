import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  GuestSession,
  Public,
  Roles,
} from '../../common/decorators';
import type { Response } from 'express';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IJwtPayload } from '../../common/interfaces';
import { InitiatePaymentDto, PaymobWebhookDto, RefundPaymobOrderDto } from './dto';
import { PaymentService } from './payment.service';

@Controller('payments')
@UseGuards(AuthGuard, RolesGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Staff-only manual payment link. Customers pay through POST /orders/checkout, which
   * computes the amount server-side; this endpoint trusts the amount in the body.
   */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('paymob/initiate')
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() user?: IJwtPayload,
    @GuestSession() guestSessionId?: string,
  ) {
    return this.paymentService.initiatePaymobCheckout(
      dto,
      user,
      guestSessionId,
    );
  }

  @Public()
  @Post('paymob/webhook')
  @HttpCode(HttpStatus.OK)
  async handlePaymobWebhook(
    // Plain object on purpose: Paymob adds top-level fields over time (accept_fees, issuer_bank…)
    // and the global forbidNonWhitelisted validation would reject the real callback with a 400.
    // Authenticity is enforced by the HMAC check in the service, not by the body shape.
    @Body() body: Record<string, unknown>,
    @Query('hmac') hmac: string,
  ) {
    if (!body || typeof body !== 'object' || typeof body.obj !== 'object' || body.obj === null) {
      throw new BadRequestException('Malformed Paymob webhook payload');
    }
    return this.paymentService.handlePaymobWebhook(body as unknown as PaymobWebhookDto, hmac);
  }

  /**
   * Paymob sends the customer's browser here after the payment page. We only forward the
   * (untrusted) query to the storefront result page, which confirms the real status from the
   * order itself; the order is only marked paid by the HMAC-verified webhook.
   */
  @Public()
  @Get('paymob/callback')
  handlePaymobRedirectCallback(
    @Query() query: Record<string, string>,
    // Raw response: a redirect must bypass the JSON response interceptor
    @Res() res: Response,
  ) {
    const storefront = (
      process.env.STOREFRONT_URL ||
      (process.env.CORS_ORIGINS || '').split(',')[0] ||
      'http://localhost:3000'
    )
      .trim()
      .replace(/\/+$/, '');
    const params = new URLSearchParams();
    const order = query.merchant_order_id || '';
    if (/^[A-Za-z0-9-]{4,40}$/.test(order)) params.set('order', order);
    params.set('paid', query.success === 'true' ? '1' : '0');
    if (query.pending === 'true') params.set('pending', '1');
    res.redirect(302, `${storefront}/checkout/complete?${params}`);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @Get('order/:orderReference')
  async getPaymentByOrderReference(
    @Param('orderReference') orderReference: string,
  ): Promise<unknown> {
    return this.paymentService.getPaymentByOrderReference(orderReference);
  }

  /**
   * Admin Refund Action (POST /api/v1/payments/paymob/refund)
   */
  @Post('paymob/refund')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async refundPaymobOrder(
    @Body() body: RefundPaymobOrderDto,
    @CurrentUser('sub') staffUserId?: string,
  ) {
    return this.paymentService.refundPaymobOrder(body, staffUserId);
  }
}
