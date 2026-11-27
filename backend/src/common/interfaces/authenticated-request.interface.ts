import { Request } from 'express';
import { IJwtPayload } from './jwt-payload.interface';

export interface IAuthenticatedRequest extends Request {
  user?: IJwtPayload;
  guestSessionId?: string;
  /** Real customer IP: from the storefront (trusted with INTERNAL_API_KEY) or the connection */
  clientIp?: string;
  /** The call came from our own storefront server */
  fromStorefront?: boolean;
}
