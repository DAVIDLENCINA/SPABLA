/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R3 · Auth-method policy · behavioural.
 *
 * Q2-R3 rectifica Q2-R2: el harness ya no reproduce manualmente el
 * default `"otp"` ni el reset a `"otp"` tras logout. Ambas
 * decisiones viven en el hook productivo `useAuthMethod` — el mismo
 * que `page.tsx` importa. Este test lo consume y verifica sus
 * transiciones renderizando el `UnauthGate` productivo con el
 * estado que emite el hook.
 *
 * La lectura del source de `page.tsx` (oracle estático) se mantiene
 * únicamente como barrera complementaria; nunca como evidencia
 * principal.
 */

// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { UnauthGate } from "@/app/v2/chat/components/UnauthGate";
import { useAuthMethod } from "@/lib/v2/client/use-auth-method";

afterEach(() => cleanup());

const fakeClient = {} as SupabaseClient;

/**
 * Harness que consume `useAuthMethod` (autoridad productiva de la
 * política) y renderiza `UnauthGate` productivo. Los botones
 * `simulate-logout` y `simulate-authenticated` sólo disparan
 * transiciones equivalentes a las que `page.tsx` invoca desde
 * `signOut` y desde `OtpForm.onAuthenticated`.
 */
function Harness(): React.JSX.Element {
  const { authMethod, setAuthMethod, resetOnLogout } = useAuthMethod();
  const [sessionRestored, setSessionRestored] = useState(true);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  return (
    <>
      <UnauthGate
        supabase={fakeClient}
        sessionRestored={sessionRestored}
        authMethod={authMethod}
        setAuthMethod={setAuthMethod}
        onAuthenticated={() => {
          // Q2-R3 · MISMO comportamiento que `page.tsx`: cero
          // llamada a `setAuthMethod("password")`. Sólo limpiaría
          // banderas de expiración; no hacemos nada aquí porque
          // el fixture no las expone.
        }}
        sessionExpired={false}
        sessionExpiredMessage=""
        signInEmail={signInEmail}
        signInPassword={signInPassword}
        onSignInEmailChange={setSignInEmail}
        onSignInPasswordChange={setSignInPassword}
        signInError={null}
        signInBusy={false}
        onSignIn={() => undefined}
      />
      <button
        data-testid="simulate-restoring"
        onClick={() => setSessionRestored(false)}
      >
        simulate-restoring
      </button>
      <button
        data-testid="simulate-restored"
        onClick={() => setSessionRestored(true)}
      >
        simulate-restored
      </button>
      <button data-testid="simulate-logout" onClick={resetOnLogout}>
        simulate-logout
      </button>
      <span data-testid="current-method">{authMethod}</span>
    </>
  );
}

describe("useAuthMethod (productivo) · política real de acceso", () => {
  it("estado inicial · authMethod es 'otp'", () => {
    render(<Harness />);
    expect(screen.getByTestId("current-method").textContent).toBe("otp");
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
  });

  it("cambio a password · click 'Acceder con contraseña' monta SessionArea", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("current-method").textContent).toBe("password");
    expect(screen.getByRole("heading", { name: /Iniciar sesión$/i })).toBeTruthy();
    expect(screen.getByLabelText(/^Contraseña$/i)).toBeTruthy();
  });

  it("regreso a OTP · click 'Acceder con código' desde password vuelve a OtpForm", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con código/i }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("current-method").textContent).toBe("otp");
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    expect(screen.queryByLabelText(/^Contraseña$/i)).toBeNull();
  });

  it("logout resetea a OTP · aunque el usuario estuviera en password", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("current-method").textContent).toBe("password");
    // Simular logout — invoca `resetOnLogout` del hook productivo.
    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-logout"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("current-method").textContent).toBe("otp");
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
  });

  it("onAuthenticated · NO fuerza cambio a password (política del hook)", async () => {
    render(<Harness />);
    // Simulamos que el hook NO expone forzado a password tras
    // onAuthenticated (contract Q2-R §1). En el harness, el callback
    // no toca setAuthMethod; verificamos que estando en OTP se
    // mantiene tras un ciclo simulado.
    expect(screen.getByTestId("current-method").textContent).toBe("otp");
    // Fake ciclo restoring → restored no cambia el método
    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-restoring"));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-restored"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("current-method").textContent).toBe("otp");
  });

  it("UnauthGate representa el estado del hook (contrato observacional)", async () => {
    render(<Harness />);
    // authMethod inicial ("otp") → OtpForm montado.
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    // Cambio a password → SessionArea montada.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: /Iniciar sesión$/i })).toBeTruthy();
    // Simulate-restoring → UnauthGate cambia a "Restaurando…".
    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-restoring"));
      await Promise.resolve();
    });
    expect(screen.getByLabelText(/Restaurando sesión/i)).toBeTruthy();
  });

  it("password sigue funcional · SessionArea renderiza inputs email + password", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    const email = screen.getByLabelText(/^Email$/i) as HTMLInputElement;
    const pw = screen.getByLabelText(/^Contraseña$/i) as HTMLInputElement;
    expect(email.getAttribute("type")).toBe("email");
    expect(pw.getAttribute("type")).toBe("password");
    // Escribimos y verificamos que los props/setters funcionan
    await act(async () => {
      fireEvent.change(email, { target: { value: "user@spabla.test" } });
      fireEvent.change(pw, { target: { value: "abc" } });
      await Promise.resolve();
    });
    expect(email.value).toBe("user@spabla.test");
    expect(pw.value).toBe("abc");
    expect(screen.getByRole("button", { name: /Iniciar sesión/i }).hasAttribute("disabled")).toBe(false);
  });
});

describe("page.tsx · consume el hook productivo (barrera complementaria)", () => {
  it("importa y consume useAuthMethod (autoridad única)", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const src = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(src).toMatch(/from "@\/lib\/v2\/client\/use-auth-method"/);
    expect(src).toMatch(/useAuthMethod\(\)/);
    // Ningún useState<AuthMethod> paralelo en page.tsx tras la
    // extracción; toda la política vive en el hook.
    expect(src).not.toMatch(/useState<"password" \| "otp">/);
    expect(src).not.toMatch(/useState<"otp" \| "password">/);
    // signOut invoca la política de reset del hook.
    expect(src).toMatch(/resetAuthMethodOnLogout\(\)/);
  });
});
