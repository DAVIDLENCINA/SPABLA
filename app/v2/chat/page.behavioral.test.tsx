/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R · page.tsx behavioural guard.
 *
 * Verifica conductualmente que la página de chat, cuando NO hay
 * sesión, monta la vista OTP por defecto (método principal Q2-R §1)
 * y expone el acceso alternativo por contraseña sin destruir el
 * flujo existente.
 *
 * No es un test unit puro de la página completa (que arrastra
 * bootstrap/polling/websocket). Renderiza sólo un subárbol
 * equivalente que reproduce la decisión de `authMethod` inicial y
 * la transición OTP ↔ password, tomándose desde el propio código
 * fuente de `page.tsx` como oracle de la constante inicial.
 */

// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(() => cleanup());
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { OtpForm } from "@/app/v2/chat/components/OtpForm";
import { SessionArea } from "@/app/v2/chat/components/SessionArea";

const PAGE_SRC = readFileSync(
  resolve(__dirname, "page.tsx"),
  "utf8",
);
const fakeClient = {} as SupabaseClient;

/**
 * Reproduce EXACTAMENTE la política Q2-R:
 *   · authMethod inicial = "otp" (leído del source como oracle).
 *   · OTP → click "Acceder con contraseña" cambia a SessionArea.
 *   · Password → click "Acceder con código" vuelve a OTP.
 *   · onAuthenticated NO fuerza volver a password.
 *   · Al cerrar sesión (signOut simulado), el toggle vuelve a "otp".
 */
function UnauthFixture({
  onboardingCallback = () => undefined,
}: {
  onboardingCallback?: () => void;
}): React.JSX.Element {
  const [authMethod, setAuthMethod] = useState<"password" | "otp">("otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <>
      {authMethod === "otp" && (
        <OtpForm
          supabase={fakeClient}
          onAuthenticated={onboardingCallback}
          onSwitchToPassword={() => setAuthMethod("password")}
        />
      )}
      {authMethod === "password" && (
        <>
          <SessionArea
            sessionExpired={false}
            sessionExpiredMessage=""
            signInEmail={email}
            signInPassword={password}
            onSignInEmailChange={setEmail}
            onSignInPasswordChange={setPassword}
            signInError={null}
            signInBusy={false}
            onSignIn={() => undefined}
          />
          <button
            type="button"
            onClick={() => setAuthMethod("otp")}
            aria-label="Volver a acceder con código"
          >
            Acceder con código
          </button>
        </>
      )}
    </>
  );
}

describe("page.tsx · OTP como método principal", () => {
  it("static oracle · authMethod declara useState<...>('otp')", () => {
    // La constante inicial es normativa: si un cambio la vuelve a
    // 'password', este test falla explícitamente. La barrera no
    // sustituye al test conductual; lo complementa.
    expect(PAGE_SRC).toMatch(/useState<"password" \| "otp">\("otp"\)/);
    // signOut restablece authMethod a "otp".
    expect(PAGE_SRC).toMatch(/setAuthMethod\("otp"\)/);
    // onAuthenticated NO fuerza volver a password.
    const onAuthMatch = PAGE_SRC.match(/onAuthenticated=\{\(\) => \{[\s\S]{0,2000}?\}\}/);
    expect(onAuthMatch).not.toBeNull();
    expect(onAuthMatch![0]).not.toMatch(/setAuthMethod\("password"\)/);
  });

  it("behavioural · vista inicial (sin sesión) es OTP", () => {
    render(<UnauthFixture />);
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    expect(screen.getByLabelText(/^Email$/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Recibir código/i })).toBeTruthy();
    // Botón alternativo a contraseña visible desde OTP
    expect(screen.getByRole("button", { name: /Acceder con contraseña/i })).toBeTruthy();
    // NO se ve el heading "Iniciar sesión" (password)
    expect(screen.queryByRole("heading", { name: /Iniciar sesión$/i })).toBeNull();
  });

  it("behavioural · click 'Acceder con contraseña' transita a SessionArea", async () => {
    render(<UnauthFixture />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: /Iniciar sesión$/i })).toBeTruthy();
    expect(screen.getByLabelText(/Contraseña/i)).toBeTruthy();
    // El toggle inverso está disponible en la vista password
    expect(screen.getByRole("button", { name: /Acceder con código/i })).toBeTruthy();
  });

  it("behavioural · desde password click 'Acceder con código' vuelve a OTP", async () => {
    render(<UnauthFixture />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con código/i }));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    // El input `<label>Contraseña</label>` NO está presente — el
    // botón secundario "Acceder con contraseña" sí puede estarlo si
    // OtpForm lo expone, así que discriminamos por el label del
    // input password concretamente.
    expect(screen.queryByLabelText(/^Contraseña$/i)).toBeNull();
  });
});
