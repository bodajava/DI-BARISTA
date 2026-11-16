export interface IUploadedFileResult {
  key: string;
  url: string;
  bucket: string;
  mimeType: string;
  size: number;
}

export interface IStorageService {
  uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<IUploadedFileResult>;
  uploadFiles(
    files: Express.Multer.File[],
    folder?: string,
  ): Promise<IUploadedFileResult[]>;
  deleteFile(key: string): Promise<boolean>;
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

