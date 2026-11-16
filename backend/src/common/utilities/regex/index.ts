/**
 * Escape user input before building a RegExp from it. Unescaped input lets a client inject
 * patterns such as `(a+)+$` that pin the CPU (ReDoS) or match every document.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
