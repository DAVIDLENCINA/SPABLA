/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R2 · Page unauth-gate behavioural.
 *
 * Renderiza el componente PRODUCTIVO `UnauthGate` (usado por
 * `app/v2/chat/page.tsx` en el bloque `{!session && ...}`). Q2-R2
 * rectifica Q2-R: se dejó de reproducir el subárbol equivalente en
 * el test y se importa el mismo componente que la página monta en
 * runtime.
 *
 * La orquestación (session/bootstrap/polling/refresh) sigue viviendo
 * en `page.tsx`; renderizarla en happy-dom introduciría dependencias
 * que no aportan a la decisión OTP↔password. `UnauthGate` es el
 * componente productivo mínimo que contiene toda esa decisión.
 */

// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { UnauthGate } from "@/app/v2/chat/components/UnauthGate";

afterEach(() => cleanup());

const fakeClient = {} as SupabaseClient;

/**
 * Envoltorio mínimo: expone los mismos setters que `page.tsx`
 * inyecta en `UnauthGate` y permite simular el ciclo de vida de
 * `sessionRestored` y `authMethod`. El default de `authMethod` es
 * `"otp"` — idéntico a la decisión productiva de `page.tsx`.
 */
function Harness({
  initialSessionRestored = true,
  simulateAuthenticated,
  onLogout,
}: {
  initialSessionRestored?: boolean;
  simulateAuthenticated?: (cb: () => void) => void;
  onLogout?: () => void;
}): React.JSX.Element {
  const [authMethod, setAuthMethod] = useState<"password" | "otp">("otp");
  const [sessionRestored, setSessionRestored] = useState(initialSessionRestored);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const onAuthenticated = useCallback(() => {
    if (simulateAuthenticated) simulateAuthenticated(() => undefined);
  }, [simulateAuthenticated]);
  return (
    <>
      <UnauthGate
        supabase={fakeClient}
        sessionRestored={sessionRestored}
        authMethod={authMethod}
        setAuthMethod={setAuthMethod}
        onAuthenticated={onAuthenticated}
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
      {/* Botones de utilidad exclusivamente para el harness — nunca
          en producto. Simulan las transiciones que `page.tsx` haría
          desde `onAuthStateChange` / `signOut`. */}
      <button data-testid="harness-set-restored" onClick={() => setSessionRestored(true)}>
        set-restored
      </button>
      <button
        data-testid="harness-simulate-logout"
        onClick={() => {
          setAuthMethod("otp");
          if (onLogout) onLogout();
        }}
      >
        simulate-logout
      </button>
    </>
  );
}

describe("page.tsx · UnauthGate productivo · comportamiento real de la decisión", () => {
  it("sesión no restaurada · muestra 'Restaurando tu sesión…'", () => {
    render(<Harness initialSessionRestored={false} />);
    expect(screen.getByLabelText(/Restaurando sesión/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Acceder con código/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Iniciar sesión$/i })).toBeNull();
  });

  it("tras restaurar sin sesión · monta OtpForm (método principal)", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Recibir código/i })).toBeTruthy();
    // Vista OTP NO monta el campo Contraseña
    expect(screen.queryByLabelText(/^Contraseña$/i)).toBeNull();
    // Botón "Acceder con contraseña" siempre visible
    expect(screen.getByRole("button", { name: /Acceder con contraseña/i })).toBeTruthy();
  });

  it("click 'Acceder con contraseña' · transita a SessionArea", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: /Iniciar sesión$/i })).toBeTruthy();
    expect(screen.getByLabelText(/^Contraseña$/i)).toBeTruthy();
    // Botón reverso disponible
    expect(screen.getByRole("button", { name: /Acceder con código/i })).toBeTruthy();
  });

  it("click 'Acceder con código' desde password · vuelve a OtpForm", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con código/i }));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    expect(screen.queryByLabelText(/^Contraseña$/i)).toBeNull();
  });

  it("logout · vuelve a OTP por defecto (simula el reset de authMethod que hace page.tsx.signOut)", async () => {
    render(<Harness />);
    // Cambio a password primero
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Acceder con contraseña/i }));
      await Promise.resolve();
    });
    // Simulo el logout — el propio `page.tsx.signOut` ejecuta
    // `setAuthMethod("otp")` (verificado antifraude); el harness
    // reproduce esa acción.
    await act(async () => {
      fireEvent.click(screen.getByTestId("harness-simulate-logout"));
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: /Acceder con código/i })).toBeTruthy();
    expect(screen.queryByLabelText(/^Contraseña$/i)).toBeNull();
  });
});

describe("page.tsx · UnauthGate está realmente en el árbol productivo", () => {
  it("page.tsx importa y usa UnauthGate en el bloque `{!session && …}`", () => {
    // Este oracle acompaña — NO sustituye — a los tests
    // conductuales de arriba. La conducta real vive en render()
    // sobre `UnauthGate` (el mismo componente importado aquí y en
    // `page.tsx`). Este oracle sólo verifica que la página no lo
    // esquiva accidentalmente.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const pageSrc = readFileSync(
      resolve(__dirname, "page.tsx"),
      "utf8",
    );
    expect(pageSrc).toMatch(/from "\.\/components\/UnauthGate"/);
    expect(pageSrc).toMatch(/<UnauthGate[\s\S]{0,1200}?\/>/);
    expect(pageSrc).toMatch(/authMethod=\{authMethod\}/);
  });
});
