import { RoastLevel, UserRole } from '../../../common/enums';
import { ITokenPair } from '../../../common/interfaces';

export class UserProfileEntity {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  isGuest: boolean;
  guestSessionId?: string | null;
  shippingAddress?: Record<string, unknown> | null;
  isEmailVerified: boolean;
  favoriteRoast?: RoastLevel | string | null;
  createdAt?: Date;

  constructor(partial: Partial<UserProfileEntity>) {
    Object.assign(this, partial);
  }
}

export class AuthResponseEntity {
  user: UserProfileEntity;
  tokens: ITokenPair;

  constructor(partial: Partial<AuthResponseEntity>) {
    Object.assign(this, partial);
  }
}

export class GuestSessionEntity {
  guestSessionId: string;
  expiresInSeconds: number;
  createdAt: string;

  constructor(partial: Partial<GuestSessionEntity>) {
    Object.assign(this, partial);
  }
}
