import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public, RateLimit, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { AiService } from './ai.service';
import {
  AdminAdvisorQueryDto,
  AdminChatQueryDto,
  ChatCustomerDto,
} from './dto';

@Controller()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Customer AI Assistant: "Dibaresta Coffee Sommelier & Customer Guide"
   * POST /api/v1/ai/customer/chat
   */
  @Public()
  @RateLimit({ limit: 20, windowSeconds: 10 * 60 })
  @Post('ai/customer/chat')
  @HttpCode(HttpStatus.OK)
  async chatCustomer(@Body() dto: ChatCustomerDto) {
    return this.aiService.chatWithCustomer(dto);
  }

  /**
   * Admin AI Business & Forecasting Advisor
   * POST /api/v1/admin/ai/advisor
   */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post(['admin/ai/advisor', 'ai/admin/advisor'])
  @HttpCode(HttpStatus.OK)
  async getAdminAdvisor(
    @Body() bodyDto: AdminAdvisorQueryDto,
    @Query() queryDto: AdminAdvisorQueryDto,
  ) {
    const focusArea =
      bodyDto?.focusArea && bodyDto.focusArea !== 'GENERAL'
        ? bodyDto.focusArea
        : queryDto?.focusArea || bodyDto?.focusArea || 'GENERAL';

    return this.aiService.getAdminBusinessAdvisor({ focusArea });
  }

  /**
   * Standalone Database-Aware AI Analyst Chat
   * POST /api/v1/admin/ai/chat
   */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post(['admin/ai/chat', 'ai/admin/chat'])
  @HttpCode(HttpStatus.OK)
  async chatAdminAnalyst(@Body() dto: AdminChatQueryDto) {
    return this.aiService.chatWithAdminAnalyst(dto);
  }
}
