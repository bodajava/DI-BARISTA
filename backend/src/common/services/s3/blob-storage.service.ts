import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { IStorageService, IUploadedFileResult } from '../../interfaces';
import { sniffImage } from './local-storage.service';

/**
 * Vercel Blob storage (STORAGE_DRIVER=blob), for deployments on Vercel where the server disk
 * is temporary. Needs BLOB_READ_WRITE_TOKEN (added automatically when a Blob store is
 * connected to the Vercel project). Files are public, cached CDN URLs.
 */
@Injectable()
export class BlobStorageService implements IStorageService {
  private readonly logger = new Logger(BlobStorageService.name);
  private readonly token?: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('BLOB_READ_WRITE_TOKEN') || undefined;
    if (!this.token) {
      this.logger.warn('BLOB_READ_WRITE_TOKEN is not set: image uploads will fail');
    }
  }

  async uploadFile(file: Express.Multer.File, folder = 'general'): Promise<IUploadedFileResult> {
    const kind = sniffImage(file.buffer);
    if (!kind) {
      throw new BadRequestException('Only JPG, PNG, WEBP or AVIF images are allowed');
    }
    const cleanFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'general';
    const pathname = `${cleanFolder}/${Date.now()}-${randomUUID()}${kind.ext}`;
    try {
      const blob = await put(pathname, file.buffer, {
        access: 'public',
        contentType: kind.mime,
        addRandomSuffix: false,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        token: this.token,
      });
      // key = pathname, so "which uploads are still in use" checks (url ends with /key) keep working
      return { key: blob.pathname, url: blob.url, bucket: 'vercel-blob', mimeType: kind.mime, size: file.size };
    } catch (error) {
      this.logger.error(`Blob upload "${pathname}" failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Could not save the uploaded file');
    }
  }

  async uploadFiles(files: Express.Multer.File[], folder = 'general'): Promise<IUploadedFileResult[]> {
    const results: IUploadedFileResult[] = [];
    for (const file of files) results.push(await this.uploadFile(file, folder));
    return results;
  }

  async deleteFile(key: string): Promise<boolean> {
    if (!key) return false;
    try {
      await del(key, { token: this.token });
      return true;
    } catch (error) {
      this.logger.warn(`Blob delete "${key}" failed: ${(error as Error).message}`);
      return false;
    }
  }

  /** Blob files are public; nothing to sign */
  async getPresignedUrl(key: string): Promise<string> {
    return key;
  }
}
