import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { IStorageService, IUploadedFileResult } from '../../interfaces';

export const STORAGE_SERVICE_TOKEN = 'STORAGE_SERVICE_TOKEN';

@Injectable()
export class S3Service implements IStorageService {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly defaultExpiresIn: number;
  private readonly customEndpoint?: string;

  constructor(private readonly configService: ConfigService) {
    this.region =
      this.configService.get<string>('S3_REGION') ||
      this.configService.get<string>('AWS_REGION', 'us-east-1');

    this.bucket =
      this.configService.get<string>('S3_BUCKET_NAME') ||
      this.configService.get<string>('AWS_S3_BUCKET', 'socailapp');

    this.defaultExpiresIn = Number(
      this.configService.get<number>('AWS_EXPIRES_IN', 900),
    );

    this.customEndpoint = this.configService.get<string>('AWS_S3_ENDPOINT', '');

    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY_ID') ||
      this.configService.get<string>('AWS_ACCESS_KEY_ID', 'mock-access-key');

    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY', 'mock-secret-key');

    this.s3Client = new S3Client({
      region: this.region,
      endpoint: this.customEndpoint || undefined,
      forcePathStyle: Boolean(this.customEndpoint),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder = 'general',
  ): Promise<IUploadedFileResult> {
    const extension = extname(file.originalname) || '.bin';
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    const key = `${cleanFolder}/${Date.now()}-${randomUUID()}${extension}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      const url = this.customEndpoint
        ? `${this.customEndpoint.replace(/\/$/, '')}/${this.bucket}/${key}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      return {
        key,
        url,
        bucket: this.bucket,
        mimeType: file.mimetype,
        size: file.size,
      };
    } catch (error) {
      this.logger.error(
        `S3 upload failed for key "${key}": ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to upload file to S3 storage',
      );
    }
  }

  async uploadFiles(
    files: Express.Multer.File[],
    folder = 'general',
  ): Promise<IUploadedFileResult[]> {
    return Promise.all(files.map((file) => this.uploadFile(file, folder)));
  }

  async deleteFile(key: string): Promise<boolean> {
    if (!key) return false;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      this.logger.error(
        `S3 delete failed for key "${key}": ${(error as Error).message}`,
      );
      return false;
    }
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = this.defaultExpiresIn,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }
}
