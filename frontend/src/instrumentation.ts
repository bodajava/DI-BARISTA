import type { Instrumentation } from "next";

/**
 * Server-side error tracking for the storefront: every failed render or route handler is
 * logged once in a structured line (Vercel → di-barista-store → Logs, filter "[request-error]").
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    "[request-error]",
    JSON.stringify({
      digest: err.digest,
      message: err.message,
      method: request.method,
      path: request.path,
      route: context.routePath,
      type: context.routeType,
    }),
  );
};
