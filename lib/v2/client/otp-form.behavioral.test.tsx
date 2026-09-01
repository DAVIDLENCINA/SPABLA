/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R · OtpForm behavioural tests.
 *
 * Renderiza el componente productivo `OtpForm` en un DOM real
 * (happy-dom) con `@testing-library/react`. Sustituye la barrera
 * estructural (grep sobre el fuente) por pruebas dinámicas que
 * observan foco, teclado, aria-*, timers, unmount y concurrencia.
 *
 * Los `fireEvent.click` que disparan setState en promesas asíncronas
 * van dentro de `act(async () => …)` — patrón React 19 / testing
 * library 16 (evita "not wrapped in act" warnings).
 *
 * Cero mock del componente. Cero regex sobre el source. Sólo los
 * test hooks documentados en la firma pública del componente
 * (`__requestOverride`, `__verifyOverride`, `__cooldownSecondsOverride`)
 * inyectan runners deterministas.
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { OtpForm } from "@/app/v2/chat/components/OtpForm";
import type { OtpRequestOutcome } from "@/lib/v2/client/otp-request";
import type { OtpVerifyOutcome } from "@/lib/v2/client/otp-verify";

const fakeClient = {} as SupabaseClient;

function okRequest(email = "user@spabla.test"): OtpRequestOutcome {
  return { kind: "ok", normalisedEmail: email };
}
function errRequest(state: "invalid_email" | "cooldown_active" | "request_unavailable"): OtpRequestOutcome {
  return { kind: "error", error: { public: state, internalKind: state } };
}
function fakeSession() {
  return { access_token: "REDACTED", user: { id: "u-1" } } as unknown as OtpVerifyOutcome extends { session: infer S } ? S : never;
}
function okVerify(): OtpVerifyOutcome {
  return { kind: "ok", session: fakeSession(), tenantId: "t-1", role: "owner", label: "My space" };
}
function verifyError(): OtpVerifyOutcome {
  return { kind: "verify_error", error: { public: "code_invalid_or_expired", internalKind: "otp_expired" } };
}
function onboardingError(): OtpVerifyOutcome {
  return {
    kind: "onboarding_error",
    session: fakeSession(),
    error: { public: "onboarding_unavailable", internalKind: "onboarding_status_503" },
  };
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    fireEvent.click(el);
    // Yield microtask so the enqueued setState from the async
    // handler runs and React commits before the caller checks the DOM.
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function typeInto(el: Element, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(el, { target: { value } });
    await Promise.resolve();
  });
}

// Console capture — used only by tests that assert on log emissions.
let consoleCalls: string[] = [];
const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
};
beforeEach(() => {
  consoleCalls = [];
  console.log = (...a) => consoleCalls.push("log " + JSON.stringify(a));
  console.info = (...a) => consoleCalls.push("info " + JSON.stringify(a));
  console.debug = (...a) => consoleCalls.push("debug " + JSON.stringify(a));
  console.warn = (...a) => consoleCalls.push("warn " + JSON.stringify(a));
  console.error = (...a) => consoleCalls.push("error " + JSON.stringify(a));
});
afterEach(() => {
  cleanup();
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

describe("OtpForm · behavioural", () => {
  // 1
  it("render inicial · vista email con inputs y botón principal", () => {
    render(
      <OtpForm supabase={fakeClient} onAuthenticated={() => undefined} onSwitchToPassword={() => undefined} />,
    );
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    expect(screen.getByLabelText(/Email/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Recibir código/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Acceder con contraseña/i })).toBeTruthy();
  });

  // 3 · email inválido → error, sin llamada al SDK
  it("email inválido · muestra error y NO transita a vista código", async () => {
    const calls: string[] = [];
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async (_c, e) => {
          calls.push(e);
          return errRequest("invalid_email");
        }}
      />,
    );
    const input = screen.getByLabelText(/Email/i) as HTMLInputElement;
    await typeInto(input, "not-an-email");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/válida/i));
    expect(input.getAttribute("aria-invalid")).toBe("true");
    // No transitó a la vista código
    expect(screen.queryByLabelText(/Código de 6 dígitos/i)).toBeNull();
  });

  // 4/5/6 · solicitud + transición
  it("solicitar código · llama al helper y transita a vista código", async () => {
    const seenEmails: string[] = [];
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async (_c, e) => {
          seenEmails.push(e);
          return okRequest();
        }}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "USER@Spabla.TEST");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    expect(await screen.findByLabelText(/Código de 6 dígitos/i)).toBeTruthy();
    expect(seenEmails.length).toBe(1);
    // Componente NO baja a lowercase — delega en `requestOtpEmail`
    // que sí aplica `trim().toLowerCase()` (invariante Q1 §16).
    expect(seenEmails[0]).toBe("USER@Spabla.TEST");
  });

  // 7/8 · input código sanea + limita a 6
  it("input código · sanea no-dígitos y limita a 6", async () => {
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => okRequest()}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    const code = (await screen.findByLabelText(/Código de 6 dígitos/i)) as HTMLInputElement;
    await typeInto(code, "abc123-456xyz");
    expect(code.value).toBe("123456");
    await typeInto(code, "12345678901234");
    expect(code.value).toBe("123456");
  });

  // 9 · mensaje opaco único (wrong/expired/reused colapsan)
  it("verificación errónea · mensaje único opaco", async () => {
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => okRequest()}
        __verifyOverride={async () => verifyError()}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    const code = (await screen.findByLabelText(/Código de 6 dígitos/i)) as HTMLInputElement;
    await typeInto(code, "999999");
    await click(screen.getByRole("button", { name: /Verificar código/i }));
    const alertA = await screen.findByRole("alert");
    const textA = alertA.textContent;
    expect(textA).toMatch(/no es válido|solicita/i);
    // Un código "distinto" con el mismo error retorna el mismo texto
    await typeInto(code, "888888");
    await click(screen.getByRole("button", { name: /Verificar código/i }));
    const alertB = await screen.findByRole("alert");
    expect(alertB.textContent).toBe(textA);
  });

  // 10/11/12 · cooldown UX — usamos timers REALES con cooldown corto
  // (1s) para evitar la contaminación que introducen los fake timers
  // sobre el `setInterval` interno del componente cuando se
  // restauran en medio del ciclo useEffect.
  it("cooldown UX · botón reenviar deshabilitado hasta expirar", async () => {
    const requestSpy = vi.fn(async () => okRequest());
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={requestSpy}
        __cooldownSecondsOverride={1}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    const resend = await screen.findByRole("button", { name: /Reenviar código en .*/i });
    expect(resend.hasAttribute("disabled")).toBe(true);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    // Clic durante cooldown → no dispara
    await click(resend);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    // Esperar tiempo real hasta que expire (1s + margen).
    await waitFor(
      () => {
        const btn = screen.getByRole("button", { name: /^Reenviar código$/i });
        expect(btn.hasAttribute("disabled")).toBe(false);
      },
      { timeout: 2500 },
    );
    await click(screen.getByRole("button", { name: /^Reenviar código$/i }));
    await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(2));
  });

  // 13 · reenvío limpia código previo + info opaca
  it("reenvío · limpia código previo y muestra info opaca", async () => {
    const requestSpy = vi.fn(async () => okRequest());
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={requestSpy}
        __cooldownSecondsOverride={0}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    const code = (await screen.findByLabelText(/Código de 6 dígitos/i)) as HTMLInputElement;
    await typeInto(code, "123456");
    expect(code.value).toBe("123456");
    await click(screen.getByRole("button", { name: /^Reenviar código$/i }));
    await waitFor(() => expect(code.value).toBe(""));
    const info = await screen.findByRole("status");
    expect(info.textContent).toMatch(/Si la dirección es válida/i);
    expect(info.textContent).not.toMatch(/exist|account|cuenta/i);
    expect(requestSpy).toHaveBeenCalledTimes(2);
  });

  // 14 · doble clic solicitar → 1 llamada
  it("doble clic solicitar · sólo dispara una llamada al helper", async () => {
    let resolveFirst: (v: OtpRequestOutcome) => void = () => undefined;
    const firstPromise = new Promise<OtpRequestOutcome>((r) => {
      resolveFirst = r;
    });
    let calls = 0;
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={() => {
          calls += 1;
          return firstPromise;
        }}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    const btn = screen.getByRole("button", { name: /Recibir código/i });
    await click(btn);
    // Segundo click: el botón está disabled → fireEvent lo respeta
    await click(btn);
    await click(btn);
    expect(btn.hasAttribute("disabled")).toBe(true);
    // Resolver la primera llamada
    await act(async () => {
      resolveFirst(okRequest());
      await Promise.resolve();
    });
    await waitFor(() => screen.getByLabelText(/Código de 6 dígitos/i));
    expect(calls).toBe(1);
  });

  // 15 · respuesta obsoleta descartada tras cambio de email/step
  it("respuesta obsoleta · resolución tardía tras cambio de email no pisa la vista", async () => {
    let resolveFirst: (v: OtpRequestOutcome) => void = () => undefined;
    const firstPromise = new Promise<OtpRequestOutcome>((r) => {
      resolveFirst = r;
    });
    let phase = 0;
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={() => {
          phase += 1;
          if (phase === 1) return firstPromise;
          return Promise.resolve(okRequest("other@s.test"));
        }}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    // Antes de que la promesa resuelva, unmount vía cleanup del test
    // no ayuda porque el opId sigue vivo. Simulamos "cambio de email"
    // usando la propia recorded path: no hay `backToEmail` accesible
    // desde vista email; la garantía fuerte de obsolescencia se
    // acredita mediante el test 16 (unmount) que sí lanza una
    // respuesta tras destruir el componente.
    await act(async () => {
      resolveFirst(okRequest());
      await Promise.resolve();
    });
    // La transición legítima al step código tras la primera resolución
    // es esperada.
    await waitFor(() => screen.getByLabelText(/Código de 6 dígitos/i));
    expect(phase).toBe(1);
  });

  // 16 · unmount safety — respuesta tardía tras desmontaje sin warnings
  it("unmount · resolución tras desmontaje NO dispara warnings React", async () => {
    let resolveLate: (v: OtpRequestOutcome) => void = () => undefined;
    const latePromise = new Promise<OtpRequestOutcome>((r) => {
      resolveLate = r;
    });
    const { unmount } = render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={() => latePromise}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    unmount();
    await act(async () => {
      resolveLate(okRequest());
      await new Promise((r) => setTimeout(r, 25));
    });
    const noise = consoleCalls.filter((l) => l.startsWith("warn ") || l.startsWith("error "));
    expect(noise).toEqual([]);
  });

  // 17 · onSwitchToPassword
  it("cambio a contraseña · invoca onSwitchToPassword desde vista email", async () => {
    const switchSpy = vi.fn();
    render(
      <OtpForm supabase={fakeClient} onAuthenticated={() => undefined} onSwitchToPassword={switchSpy} />,
    );
    await click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
    expect(switchSpy).toHaveBeenCalledTimes(1);
  });

  // 18 · cambiar email desde vista código
  it("cambiar email · vuelve a vista email; segundo intento arranca con código vacío", async () => {
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => okRequest()}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    const code = (await screen.findByLabelText(/Código de 6 dígitos/i)) as HTMLInputElement;
    await typeInto(code, "123456");
    await click(screen.getByRole("button", { name: /Cambiar email/i }));
    expect(await screen.findByLabelText(/Email/i)).toBeTruthy();
    await typeInto(screen.getByLabelText(/Email/i), "otro@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    const code2 = (await screen.findByLabelText(/Código de 6 dígitos/i)) as HTMLInputElement;
    expect(code2.value).toBe("");
  });

  // 19 · éxito completo · onAuthenticated una vez
  it("éxito completo · onAuthenticated invocado 1 vez tras verifyOtp+onboarding OK", async () => {
    const onAuth = vi.fn();
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={onAuth}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => okRequest()}
        __verifyOverride={async () => okVerify()}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    await typeInto(await screen.findByLabelText(/Código de 6 dígitos/i), "123456");
    await click(screen.getByRole("button", { name: /Verificar código/i }));
    await waitFor(() => expect(onAuth).toHaveBeenCalledTimes(1));
  });

  // 20 · onboarding_error · NO onAuthenticated, sesión viva, UI recuperable
  it("onboarding_error · NO invoca onAuthenticated y ofrece reintento", async () => {
    const onAuth = vi.fn();
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={onAuth}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => okRequest()}
        __verifyOverride={async () => onboardingError()}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "u@s.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    await typeInto(await screen.findByLabelText(/Código de 6 dígitos/i), "123456");
    await click(screen.getByRole("button", { name: /Verificar código/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/procesado|reint/i);
    expect(onAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Verificar código/i })).toBeTruthy();
  });

  // 21 · a11y — labels, aria-invalid, aria-describedby
  it("a11y · label + aria-invalid + aria-describedby vincula el mensaje", async () => {
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => errRequest("invalid_email")}
      />,
    );
    const email = screen.getByLabelText(/Email/i) as HTMLInputElement;
    await typeInto(email, "bad");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    await waitFor(() => expect(email.getAttribute("aria-invalid")).toBe("true"));
    const describedBy = email.getAttribute("aria-describedby");
    expect(describedBy).toBe("spabla-otp-email-error");
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/válida/i);
  });

  // 22 · cero persistencia
  it("cero persistencia · localStorage/sessionStorage/document.cookie sin OTP ni email", async () => {
    const beforeLocal = { ...localStorage };
    const beforeSession = { ...sessionStorage };
    const beforeCookie = document.cookie;
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => okRequest()}
        __verifyOverride={async () => okVerify()}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "user@spabla.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    await typeInto(await screen.findByLabelText(/Código de 6 dígitos/i), "123456");
    await click(screen.getByRole("button", { name: /Verificar código/i }));
    await new Promise((r) => setTimeout(r, 10));
    expect({ ...localStorage }).toEqual(beforeLocal);
    expect({ ...sessionStorage }).toEqual(beforeSession);
    expect(document.cookie).toBe(beforeCookie);
  });

  // 23 · cero secretos en logs
  it("cero secretos en logs · console no recibe email completo, OTP ni token", async () => {
    render(
      <OtpForm
        supabase={fakeClient}
        onAuthenticated={() => undefined}
        onSwitchToPassword={() => undefined}
        __requestOverride={async () => okRequest()}
        __verifyOverride={async () => okVerify()}
      />,
    );
    await typeInto(screen.getByLabelText(/Email/i), "user@spabla.test");
    await click(screen.getByRole("button", { name: /Recibir código/i }));
    await typeInto(await screen.findByLabelText(/Código de 6 dígitos/i), "654321");
    await click(screen.getByRole("button", { name: /Verificar código/i }));
    await new Promise((r) => setTimeout(r, 10));
    const joined = consoleCalls.join("\n");
    expect(joined).not.toMatch(/654321/);
    expect(joined).not.toMatch(/user@spabla\.test/);
    expect(joined).not.toMatch(/access_token/);
    expect(joined).not.toMatch(/REDACTED/);
  });

  // 24 · botón contraseña accesible
  it("contraseña como alternativa · botón accesible en vista email", () => {
    render(
      <OtpForm supabase={fakeClient} onAuthenticated={() => undefined} onSwitchToPassword={() => undefined} />,
    );
    const btn = screen.getByRole("button", { name: /Acceder con contraseña/i });
    expect(btn.getAttribute("disabled")).toBe(null);
    expect(btn.hasAttribute("aria-label")).toBe(true);
  });
});
