import { RoastLevel, UserRole } from '../../../common/enums';
import { ITokenPair } from '../../../common/interfaces';
import { CustomerShippingAddress } from '../../../models/schemas';

export class UserProfileEntity {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  isGuest: boolean;
  guestSessionId?: string | null;
  shippingAddress?: CustomerShippingAddress | null;
  isEmailVerified: boolean;
  favoriteRoast?: RoastLevel;
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
