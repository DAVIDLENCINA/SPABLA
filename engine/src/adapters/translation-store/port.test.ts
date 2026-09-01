/**
 * SPABLA Engine — structural tests for the TranslationStore port.
 *
 * Locks in the shape of the contract independently of any adapter
 * implementation. These tests are the unit floor for `TranslationStore`
 * — RLS, insert races and identity divergence are covered separately by
 * the Supabase integration suite.
 */

import { describe, expect, test } from "vitest";

import {
  TRANSLATION_STORE_OPERATIONS,
  type TranslationInsert,
  type TranslationRecord,
  type TranslationStore,
} from "./port";
import {
  isTranslationStoreError,
  translationStoreError,
  translationStoreErrorWithRetry,
  type TranslationStoreErrorCode,
} from "./errors";
import { asISOTimestamp, asUUID } from "../../types/ids";
import { buildTenantContext } from "../persistence/tenant-context";
import { buildVerifiedIdentityFromTrustedBoundary } from "../persistence/identity";

describe("TranslationStore contract", () => {
  test("declares exactly two operations", () => {
    expect(TRANSLATION_STORE_OPERATIONS).toEqual(["load", "saveServerSide"]);
  });

  test("a structurally-conformant fake satisfies the type", () => {
    const fake: TranslationStore = {
      async load() {
        return null;
      },
      async saveServerSide(_ctx, r) {
        return {
          tenantId: r.tenantId,
          messageId: r.messageId,
          targetLanguage: r.targetLanguage,
          translationVersion: r.translationVersion,
          translatedText: r.translatedText,
          provider: r.provider,
          model: r.model,
          providerRef: r.providerRef,
          createdAt: asISOTimestamp("2026-08-12T00:00:00.000Z"),
        };
      },
    };
    // Instantiate the types once so tsc catches accidental drift.
    const record: TranslationInsert = {
      tenantId: asUUID("00000000-0000-0000-0000-00000000000a"),
      messageId: asUUID("00000000-0000-0000-0000-000000000001"),
      targetLanguage: "en",
      translationVersion: "v1",
      translatedText: "Hello",
      provider: "test",
      model: null,
      providerRef: null,
    };
    const ctx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(
        asUUID("00000000-0000-0000-0000-000000000099"),
        asISOTimestamp("2026-08-12T00:00:00.000Z"),
        "test_fixture",
      ),
      record.tenantId,
    );
    // Simply invoke to prove the shape works end-to-end.
    return fake.saveServerSide(ctx, record).then((out: TranslationRecord) => {
      expect(out.translatedText).toBe("Hello");
    });
  });
});

describe("TranslationStore errors", () => {
  const codes: ReadonlyArray<TranslationStoreErrorCode> = [
    "identity_invalid",
    "tenant_context_invalid",
    "not_found",
    "conflict",
    "constraint_violation",
    "unauthorized",
    "unavailable",
  ];

  test("all known codes round-trip through the guard", () => {
    for (const c of codes) {
      const e = translationStoreError(c, `msg-${c}`);
      expect(isTranslationStoreError(e)).toBe(true);
      expect(e.code).toBe(c);
      expect(e.message).toBe(`msg-${c}`);
    }
  });

  test("only `unavailable` is retryable by default", () => {
    for (const c of codes) {
      const e = translationStoreError(c, "x");
      expect(e.retryable).toBe(c === "unavailable");
    }
  });

  test("retryability can be overridden explicitly", () => {
    const e = translationStoreErrorWithRetry("unauthorized", "x", true);
    expect(e.retryable).toBe(true);
    const f = translationStoreErrorWithRetry("unavailable", "x", false);
    expect(f.retryable).toBe(false);
  });

  test("guard rejects unrelated shapes", () => {
    expect(isTranslationStoreError(null)).toBe(false);
    expect(isTranslationStoreError({})).toBe(false);
    expect(isTranslationStoreError({ code: "identity_invalid" })).toBe(false);
    expect(isTranslationStoreError({ code: "does_not_exist", message: "x", retryable: false })).toBe(false);
    expect(isTranslationStoreError({ code: "not_found", message: 42, retryable: false })).toBe(false);
  });
});
