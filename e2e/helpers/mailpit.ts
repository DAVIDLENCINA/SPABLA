/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q3 · Mailpit helper for OTP E2E.
 *
 * Extracts the 6-digit OTP from the Mailpit inbox for a specific
 * mailbox WITHOUT ever printing the code. Guarantees:
 *
 *   - Search scoped to the mailbox (which carries `runId`).
 *   - Reject zero messages (throw with sanitised message).
 *   - Reject ambiguity when caller expects exactly one message.
 *   - Verify subject contains "SPABLA".
 *   - Verify exactly one 6-digit code in the body.
 *   - Verify NO `/auth/v1/verify` URL, NO magic link.
 *   - Return the OTP in memory only; caller MUST NOT log it.
 *   - Delete the Mailpit message after extraction.
 */

import { createHash } from "node:crypto";

export type MailpitOtp = {
  /** The 6-digit code. Consumer must never log/print/persist this. */
  readonly code: string;
  /** Mailpit message ID (already deleted by the helper). */
  readonly id: string;
  /** Subject (safe to log — server-owned). */
  readonly subject: string;
};

export type MailpitClient = {
  readonly baseUrl: string;
};

export function sha12(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

async function search(client: MailpitClient, mailbox: string): Promise<Array<{ ID: string }>> {
  const url = `${client.baseUrl}/api/v1/search?query=${encodeURIComponent(`to:${mailbox}`)}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  return ((await r.json()) as { messages?: Array<{ ID: string }> }).messages ?? [];
}

async function fetchMessage(
  client: MailpitClient,
  id: string,
): Promise<{ Text?: string; HTML?: string; Subject?: string }> {
  const r = await fetch(`${client.baseUrl}/api/v1/message/${id}`);
  if (!r.ok) throw new Error(`[mailpit] fetch message ${id} failed status=${r.status}`);
  return (await r.json()) as { Text?: string; HTML?: string; Subject?: string };
}

async function deleteMessage(client: MailpitClient, id: string): Promise<void> {
  // Mailpit's per-message delete is exposed as
  // `DELETE /api/v1/messages` with `{IDs: [...]}`. The singular
  // `/api/v1/message/<id>` route only supports GET/HEAD/OPTIONS and
  // returns 405 for DELETE, so the previous shape silently left the
  // message in the mailbox and made downstream scenarios ambiguous.
  await fetch(`${client.baseUrl}/api/v1/messages`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ IDs: [id] }),
  }).catch(() => undefined);
}

/**
 * Waits until Mailpit delivers exactly one OTP mail to `mailbox` and
 * returns the code plus subject. Throws with a sanitised message on:
 * timeout, zero mails, more than one mail (when `expectOne=true`),
 * subject not matching SPABLA, missing/multiple 6-digit codes, or
 * any auth verify URL in the body.
 *
 * The extracted code lives ONLY in the returned object; it is
 * neither logged nor stored inside the helper.
 */
export async function waitForOtp(
  client: MailpitClient,
  mailbox: string,
  opts: { readonly timeoutMs?: number; readonly expectOne?: boolean } = {},
): Promise<MailpitOtp> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const expectOne = opts.expectOne ?? true;
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  while (Date.now() < deadline) {
    const msgs = await search(client, mailbox);
    lastCount = msgs.length;
    if (msgs.length > 0) {
      if (expectOne && msgs.length > 1) {
        throw new Error(
          `[mailpit] ambiguous: expected exactly 1 message for mailbox_hash=${sha12(mailbox)}, got ${msgs.length}`,
        );
      }
      const message = await fetchMessage(client, msgs[0].ID);
      // Prefer TEXT-only for code extraction: HTML bodies embed CSS
      // colour hex literals (e.g. `#334155`) that would otherwise be
      // mis-matched as 6-digit tokens. `/auth/v1/verify` is still
      // scanned across the union so a template regression that adds
      // the URL only to the HTML variant is caught.
      const text = message.Text ?? "";
      const src = text + "\n" + (message.HTML ?? "");
      const subject = message.Subject ?? "";
      if (!/SPABLA/i.test(subject)) {
        throw new Error(`[mailpit] subject missing 'SPABLA' (subject_hash=${sha12(subject)})`);
      }
      if (/\/auth\/v1\/verify/.test(src)) {
        // NEVER include the offending URL in the error message.
        throw new Error(
          `[mailpit] template regression: /auth/v1/verify present in body (mailbox_hash=${sha12(mailbox)})`,
        );
      }
      const codes = text.match(/\b\d{6}\b/g) ?? [];
      if (codes.length === 0) {
        throw new Error(
          `[mailpit] no 6-digit code in body (mailbox_hash=${sha12(mailbox)})`,
        );
      }
      if (codes.length > 1 && new Set(codes).size > 1) {
        throw new Error(
          `[mailpit] multiple distinct 6-digit codes found (mailbox_hash=${sha12(mailbox)})`,
        );
      }
      const code = codes[0]!;
      const id = msgs[0]!.ID;
      // Delete after use — one-shot semantics.
      await deleteMessage(client, id);
      return { code, id, subject };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `[mailpit] no OTP mail arrived within ${timeoutMs}ms for mailbox_hash=${sha12(mailbox)} (final count=${lastCount})`,
  );
}

/**
 * Bulk-delete every message currently in `mailbox`. Used by cleanup
 * hooks to guarantee zero residual mail per runId.
 */
export async function purgeMailbox(client: MailpitClient, runIdOrMailbox: string): Promise<number> {
  const msgs = await search(client, runIdOrMailbox);
  for (const m of msgs) await deleteMessage(client, m.ID);
  return msgs.length;
}
