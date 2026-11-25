import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheService } from '../../common/utilities/caching';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_WHEEL, MarqueeConfig, SETTINGS, SettingDefinition, WheelConfig } from './settings.definitions';

const CACHE_KEY = 'settings:all';
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  /** Every setting with its stored value (or default) */
  async all(): Promise<Record<string, unknown>> {
    const cached = await this.cache.get<Record<string, unknown>>(CACHE_KEY);
    if (cached) return cached;
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const values: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(SETTINGS)) {
      values[key] = stored.has(key) ? stored.get(key) : def.default;
    }
    await this.cache.set(CACHE_KEY, values, 300);
    return values;
  }

  async get<T>(key: string): Promise<T> {
    const values = await this.all();
    return values[key] as T;
  }

  async int(key: string): Promise<number> {
    return Number(await this.get<number>(key)) || 0;
  }

  /** Dashboard view: value + type + public flag for each key */
  async adminView() {
    const values = await this.all();
    return Object.entries(SETTINGS).map(([key, def]) => ({
      key,
      type: def.type,
      isPublic: def.isPublic,
      value: values[key],
      min: def.min,
      max: def.max,
    }));
  }

  /** Settings the storefront may read (contact links, free-delivery threshold, marquee lines…) */
  async publicView(): Promise<Record<string, unknown>> {
    const values = await this.all();
    const out: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(SETTINGS)) if (def.isPublic) out[key] = values[key];
    return out;
  }

  async update(changes: Record<string, unknown>, userId?: string): Promise<Record<string, unknown>> {
    const before = await this.all();
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const after: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(changes)) {
      const def = SETTINGS[key];
      if (!def) throw new BadRequestException(`Unknown setting "${key}"`);
      const value = this.validate(key, def, raw);
      after[key] = value;
      ops.push(
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue, isPublic: def.isPublic },
          update: { value: value as Prisma.InputJsonValue, isPublic: def.isPublic },
        }),
      );
    }
    await this.prisma.$transaction(ops);
    await this.cache.del(CACHE_KEY);
    await this.audit.log(
      userId,
      'settings.update',
      'settings',
      null,
      Object.fromEntries(Object.keys(after).map((k) => [k, before[k]])),
      after,
    );
    return this.all();
  }

  private validate(key: string, def: SettingDefinition, raw: unknown): unknown {
    const fail = (msg: string) => {
      throw new BadRequestException(`${key}: ${msg}`);
    };
    switch (def.type) {
      case 'string': {
        if (typeof raw !== 'string') fail('must be text');
        const v = (raw as string).trim();
        if (v.length > 300) fail('is too long');
        return v;
      }
      case 'email': {
        if (typeof raw !== 'string') fail('must be an email');
        const v = (raw as string).trim().toLowerCase();
        if (v && !EMAIL_RX.test(v)) fail('is not a valid email');
        return v;
      }
      case 'url': {
        if (typeof raw !== 'string') fail('must be a link');
        const v = (raw as string).trim();
        if (v && !/^https:\/\/[^\s]+$/i.test(v)) fail('must start with https://');
        return v;
      }
      case 'int':
      case 'money': {
        const n = Number(raw);
        if (!Number.isInteger(n)) fail('must be a whole number');
        if (def.min !== undefined && n < def.min) fail(`must be at least ${def.min}`);
        if (def.max !== undefined && n > def.max) fail(`must be at most ${def.max}`);
        return n;
      }
      case 'bool':
        if (typeof raw !== 'boolean') fail('must be on or off');
        return raw;
      case 'json':
        if (key.startsWith('marquee.')) return this.validateMarquee(raw, fail);
        if (key === 'wheel') return this.validateWheel(raw, fail);
        return raw;
    }
  }

  private validateMarquee(raw: unknown, fail: (m: string) => never): MarqueeConfig {
    const v = raw as MarqueeConfig;
    if (!v || typeof v !== 'object' || !Array.isArray(v.lines)) fail('needs lines');
    if (v.lines.length > 20) fail('has too many lines');
    return {
      enabled: Boolean(v.enabled),
      lines: v.lines
        .map((l) => ({ en: String(l?.en ?? '').trim().slice(0, 160), ar: String(l?.ar ?? '').trim().slice(0, 160) }))
        .filter((l) => l.en || l.ar),
    };
  }

  private validateWheel(raw: unknown, fail: (m: string) => never): WheelConfig {
    const v = { ...DEFAULT_WHEEL, ...(raw as Partial<WheelConfig>) };
    if (!Array.isArray(v.slices) || v.slices.length < 2 || v.slices.length > 12) fail('needs 2 to 12 slices');
    const slices = v.slices.map((s, i) => {
      const prize = ['none', 'percent', 'amount'].includes(s.prize) ? s.prize : 'none';
      const value = Math.max(0, Math.round(Number(s.value) || 0));
      if (prize === 'percent' && (value < 1 || value > 90)) fail(`slice ${i + 1}: % off must be 1 to 90`);
      if (prize === 'amount' && value < 100) fail(`slice ${i + 1}: EGP off must be at least 1 EGP`);
      const weight = Math.max(0, Math.round(Number(s.weight) || 0));
      return {
        labelEn: String(s.labelEn ?? '').trim().slice(0, 40) || `Slice ${i + 1}`,
        labelAr: String(s.labelAr ?? '').trim().slice(0, 40) || `شريحة ${i + 1}`,
        prize,
        value: prize === 'none' ? 0 : value,
        weight,
      } as WheelConfig['slices'][number];
    });
    if (slices.every((s) => s.weight === 0)) fail('at least one slice needs a weight above 0');
    const chosenWinners = (Array.isArray(v.chosenWinners) ? v.chosenWinners : [])
      .map((w) => ({ email: String(w?.email ?? '').trim().toLowerCase(), sliceIndex: Number(w?.sliceIndex) }))
      .filter((w) => EMAIL_RX.test(w.email) && Number.isInteger(w.sliceIndex) && w.sliceIndex >= 0 && w.sliceIndex < slices.length);
    return {
      enabled: Boolean(v.enabled),
      startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null,
      endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null,
      popupDelaySeconds: Math.min(120, Math.max(0, Math.round(Number(v.popupDelaySeconds) || 0))),
      codeValidityDays: Math.min(365, Math.max(1, Math.round(Number(v.codeValidityDays) || 7))),
      minOrderCents: Math.max(0, Math.round(Number(v.minOrderCents) || 0)),
      slices,
      chosenWinners,
      round: Math.max(1, Math.round(Number(v.round) || 1)),
    };
  }
}
