import { TokenType, UserRole } from '../enums';

export interface IJwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  jti: string;
  type: TokenType;
  iat?: number;
  exp?: number;
}

export interface ITokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
}

