import { runPurchaseAndRefundE2E } from '../../../test/purchase-and-refund.e2e-spec';

describe('E2E: Guest Purchase, Paymob Webhook & Order Refund Lifecycle', () => {
  jest.setTimeout(30000);

  it('executes full Guest Cart -> Checkout -> Paymob Webhook -> Refund & Stock Restoration flow', async () => {
    await runPurchaseAndRefundE2E();
  });
});

