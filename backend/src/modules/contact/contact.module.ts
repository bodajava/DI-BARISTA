import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactMessageRepository } from '../../models/repositories';
import { ContactMessage, ContactMessageSchema } from '../../models/schemas';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ContactMessage.name, schema: ContactMessageSchema }]),
  ],
  controllers: [ContactController],
  providers: [ContactService, ContactMessageRepository],
})
export class ContactModule {}
