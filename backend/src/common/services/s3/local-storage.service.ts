import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve, sep } from 'path';
import { IStorageService, IUploadedFileResult } from '../../interfaces';

/** Real image type from the file's first bytes (never trust the name or browser mime type) */
function sniffImage(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: '.webp' };
  }
  const brand = buffer.toString('ascii', 4, 12);
  if (brand === 'ftypavif' || brand === 'ftypavis') {
    return { mime: 'image/avif', ext: '.avif' };
  }
  return null;
}

/**
 * Stores uploads on the server's own disk (e.g. a Hostinger VPS) under UPLOAD_DIR and serves
 * them from /uploads on the API (see main.ts). No cloud bucket, no extra cost.
 * Keep UPLOAD_DIR outside the code folder (or back it up) so redeploys don't wipe it.
 */
@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly root: string;
  private readonly publicBase: string;

  constructor(private readonly configService: ConfigService) {
    this.root = resolve(this.configService.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads'));
    // Relative by default ("/uploads/..."): the storefront proxies /uploads to the API, so the
    // links survive a domain change. Set UPLOADS_PUBLIC_URL only to serve them from elsewhere.
    this.publicBase = (this.configService.get<string>('UPLOADS_PUBLIC_URL') || '/uploads').replace(/\/+$/, '');
  }

  get directory(): string {
    return this.root;
  }

  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new BadRequestException('Invalid file key');
    }
    return full;
  }

  async uploadFile(file: Express.Multer.File, folder = 'general'): Promise<IUploadedFileResult> {
    const kind = sniffImage(file.buffer);
    if (!kind) {
      throw new BadRequestException('Only JPG, PNG, WEBP or AVIF images are allowed');
    }
    const cleanFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'general';
    const key = `${cleanFolder}/${Date.now()}-${randomUUID()}${kind.ext}`;
    const target = this.pathFor(key);
    try {
      await fs.mkdir(join(target, '..'), { recursive: true });
      await fs.writeFile(target, file.buffer, { flag: 'wx' });
    } catch (error) {
      this.logger.error(`Saving upload "${key}" failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Could not save the uploaded file');
    }
    return {
      key,
      url: `${this.publicBase}/${key}`,
      bucket: 'local',
      mimeType: kind.mime,
      size: file.size,
    };
  }

  async uploadFiles(files: Express.Multer.File[], folder = 'general'): Promise<IUploadedFileResult[]> {
    const results: IUploadedFileResult[] = [];
    for (const file of files) results.push(await this.uploadFile(file, folder));
    return results;
  }

  async deleteFile(key: string): Promise<boolean> {
    if (!key) return false;
    try {
      await fs.unlink(this.pathFor(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Deleting upload "${key}" failed: ${(error as Error).message}`);
      }
      return false;
    }
  }

  /** Local files are public; there is nothing to sign */
  async getPresignedUrl(key: string): Promise<string> {
    return `${this.publicBase}/${key}`;
  }
}
