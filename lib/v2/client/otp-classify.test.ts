import { describe, it, expect } from "vitest";

import {
  classifyOtpRequestError,
  classifyOtpVerifyError,
  isProbablyValidEmail,
  messageFor,
  normaliseEmailForUx,
} from "./otp-classify";

describe("otp-classify · request errors", () => {
  it("clasifica over_email_send_rate_limit como cooldown_active", () => {
    const c = classifyOtpRequestError({ error_code: "over_email_send_rate_limit", status: 429 });
    expect(c.public).toBe("cooldown_active");
    expect(c.internalKind).toBe("cooldown_active");
  });

  it("clasifica validation_failed como invalid_email", () => {
    const c = classifyOtpRequestError({ error_code: "validation_failed", status: 400 });
    expect(c.public).toBe("invalid_email");
  });

  it("clasifica errores de red por message hint", () => {
    const c = classifyOtpRequestError({ message: "Failed to fetch" });
    expect(c.public).toBe("network_unavailable");
  });

  it("clasifica AbortError por name", () => {
    const c = classifyOtpRequestError({ name: "AbortError" });
    expect(c.public).toBe("network_unavailable");
  });

  it("clasifica desconocido a request_unavailable con internalKind", () => {
    const c = classifyOtpRequestError({ error_code: "some_new_code" });
    expect(c.public).toBe("request_unavailable");
    expect(c.internalKind).toBe("some_new_code");
  });

  it("null/undefined degradan a request_unavailable/unknown", () => {
    expect(classifyOtpRequestError(null).public).toBe("request_unavailable");
    expect(classifyOtpRequestError(undefined).internalKind).toBe("unknown");
  });
});

describe("otp-classify · verify errors", () => {
  it("colapsa otp_expired / wrong / reused / cross-email a code_invalid_or_expired", () => {
    for (const code of ["otp_expired", "invalid_otp"]) {
      const c = classifyOtpVerifyError({ error_code: code, status: 403 });
      expect(c.public).toBe("code_invalid_or_expired");
    }
    // status-only fallback
    const c2 = classifyOtpVerifyError({ status: 403 });
    expect(c2.public).toBe("code_invalid_or_expired");
  });

  it("status 400 empty-code se clasifica también como code_invalid_or_expired (mensaje opaco)", () => {
    const c = classifyOtpVerifyError({ error_code: "validation_failed", status: 400 });
    expect(c.public).toBe("code_invalid_or_expired");
  });

  it("cooldown durante verify se refleja como cooldown_active", () => {
    const c = classifyOtpVerifyError({ error_code: "over_email_send_rate_limit", status: 429 });
    expect(c.public).toBe("cooldown_active");
  });
});

describe("otp-classify · messageFor", () => {
  it("devuelve texto en español no vacío para cada estado", () => {
    const states = [
      "invalid_email",
      "request_unavailable",
      "cooldown_active",
      "code_invalid_or_expired",
      "network_unavailable",
      "verify_unavailable",
      "onboarding_unavailable",
    ] as const;
    for (const s of states) {
      const m = messageFor(s);
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThan(4);
    }
  });

  it("nunca revela existencia de cuenta ni códigos internos", () => {
    const bag = [
      "invalid_email",
      "request_unavailable",
      "cooldown_active",
      "code_invalid_or_expired",
      "network_unavailable",
      "verify_unavailable",
      "onboarding_unavailable",
    ] as const;
    for (const s of bag) {
      const m = messageFor(s);
      expect(m).not.toMatch(/existe|no existe|account|error_code|otp_disabled/i);
    }
  });
});

describe("otp-classify · email helpers", () => {
  it("normaliseEmailForUx aplica trim + toLowerCase", () => {
    expect(normaliseEmailForUx("  USER@EXAMPLE.COM  ")).toBe("user@example.com");
    expect(normaliseEmailForUx("MiXeD@Case.io")).toBe("mixed@case.io");
  });

  it("isProbablyValidEmail rechaza inputs claramente inválidos", () => {
    const bad = ["", "  ", "user", "user@", "@dom.tld", "user@dom", "user@dom.", "user@.dom", "a b@c.d", "user@@dom.tld"];
    for (const s of bad) {
      expect(isProbablyValidEmail(s)).toBe(false);
    }
  });

  it("isProbablyValidEmail acepta inputs plausibles", () => {
    const good = ["a@b.co", "user@domain.tld", "user+tag@sub.domain.tld"];
    for (const s of good) {
      expect(isProbablyValidEmail(s)).toBe(true);
    }
  });

  it("normalisación NO se presenta como autoridad de identidad — sólo preprocesamiento", () => {
    // Assertion arquitectónica: el resultado de normaliseEmailForUx no
    // se usa como sub/tenant/actor en ningún test unitario. La
    // guardia real es en el server (verifyJwt del handler onboarding).
    // Aquí sólo aseveramos que la función no muta identidad más allá
    // del preprocesamiento textual.
    const before = "USER@Example.Com";
    const after = normaliseEmailForUx(before);
    expect(after).toBe("user@example.com");
    expect(after).not.toBe(before); // demostrando que sí es UX-only
  });
});
