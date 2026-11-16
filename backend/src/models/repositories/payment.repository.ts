import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from '../schemas';
import { BaseRepository } from './base.repository';

@Injectable()
export class PaymentRepository extends BaseRepository<PaymentDocument> {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
  ) {
    super(paymentModel);
  }

  async findByPaymobOrderId(
    paymobOrderId: number,
  ): Promise<PaymentDocument | null> {
    return this.findOne({ paymobOrderId });
  }

  async findByOrderReference(
    orderReference: string,
  ): Promise<PaymentDocument | null> {
    return this.findOne({ orderReference: orderReference.trim() });
  }
}

