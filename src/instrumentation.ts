// Next.js instrumentation — captures ALL server-side errors (including errors
// render Server Component yang pesannya disembunyikan di production) dan
// mencatatnya lengkap ke log server (Render), beserta `digest` yang sama dengan
// `ref:` di halaman error. Ini bikin akar masalah bisa ditelusuri.
//
// Usage: when an error appears, find `ref: <digest>` on the page, then search
// baris "[onRequestError] digest=<digest>" di Render Logs → di situ pesan aslinya.

export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string }
) {
  const e = err as (Error & { digest?: string }) | undefined;
  // eslint-disable-next-line no-console
  console.error(
    `[onRequestError] digest=${e?.digest ?? "-"} ` +
      `${request?.method ?? ""} ${request?.path ?? ""} ` +
      `(${context?.routeType ?? "?"}:${context?.routePath ?? "?"})\n` +
      `  message: ${e?.message ?? String(err)}\n` +
      `  stack: ${e?.stack ?? "(no stack)"}`
  );
}
