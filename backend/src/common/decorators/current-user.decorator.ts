import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IAuthenticatedRequest, IJwtPayload } from '../interfaces';

export const CurrentUser = createParamDecorator(
  (data: keyof IJwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<IAuthenticatedRequest>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

export const GuestSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<IAuthenticatedRequest>();
    // Populated by AuthMiddleware only when the header has a valid `guest_<uuid>` format
    return request.guestSessionId;
  },
);
