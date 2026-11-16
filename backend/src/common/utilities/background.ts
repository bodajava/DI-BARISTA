import { Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

const logger = new Logger('Background');

/**
 * Runs work after the response is sent (emails, notifications) without slowing the request.
 * On Vercel, waitUntil keeps the function alive until the task finishes; on a normal server
 * it simply runs in the background. Errors are logged, never thrown.
 */
export function runInBackground(task: Promise<unknown>, label = 'task'): void {
  const guarded = task.catch((error: unknown) => {
    logger.warn(`Background ${label} failed: ${(error as Error)?.message ?? String(error)}`);
  });
  try {
    waitUntil(guarded);
  } catch {
    // not running inside a Vercel request: the promise still runs on its own
  }
}
