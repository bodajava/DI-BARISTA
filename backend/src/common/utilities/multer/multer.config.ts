import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

export const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function createMulterMemoryOptions(options?: {
  allowedMimeTypes?: string[];
  maxFileSizeBytes?: number;
}): MulterOptions {
  const allowedTypes = options?.allowedMimeTypes ?? ALLOWED_IMAGE_MIME_TYPES;
  const maxSize = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  return {
    storage: memoryStorage(),
    limits: {
      fileSize: maxSize,
    },
    fileFilter: (_req, file, callback) => {
      if (!allowedTypes.includes(file.mimetype)) {
        return callback(
          new BadRequestException(
            `Unsupported file type "${file.mimetype}". Allowed types: ${allowedTypes.join(', ')}`,
          ),
          false,
        );
      }
      callback(null, true);
    },
  };
}

