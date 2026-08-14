/**
 * SPABLA V2 · Hito 9.2.4 · Test-only shim for `server-only`.
 *
 * `server-only` is a virtual module intercepted by the Next.js
 * bundler to fail the build if a server-only file leaks into the
 * client bundle. It is not published as an installable package, so
 * Vitest cannot resolve it out of the box.
 *
 * This shim is aliased in `vitest.client.config.ts` under the name
 * `server-only`, resolving the import to a no-op in the test
 * environment. It has no runtime effect and no impact on the
 * production build (Next continues to enforce the invariant).
 *
 * @internal test-only. Do NOT import from productive code.
 */

export {};
