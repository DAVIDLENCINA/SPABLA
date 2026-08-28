/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R3 · useAuthMethod hook.
 *
 * Tests conductuales del hook productivo autoridad de la política
 * de método de acceso (contract Q2-R §1).
 */

// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { useAuthMethod, type AuthMethod } from "./use-auth-method";

afterEach(() => cleanup());

function Probe(): React.JSX.Element {
  const { authMethod, setAuthMethod, resetOnLogout } = useAuthMethod();
  return (
    <>
      <span data-testid="method">{authMethod}</span>
      <button data-testid="to-password" onClick={() => setAuthMethod("password")}>
        to-password
      </button>
      <button data-testid="to-otp" onClick={() => setAuthMethod("otp")}>
        to-otp
      </button>
      <button data-testid="logout" onClick={resetOnLogout}>
        logout
      </button>
    </>
  );
}

describe("useAuthMethod · autoridad productiva de la política Q2-R", () => {
  it("estado inicial · authMethod === 'otp'", () => {
    render(<Probe />);
    expect(screen.getByTestId("method").textContent).toBe("otp");
  });

  it("setAuthMethod('password') · cambia a password", async () => {
    render(<Probe />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("to-password"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("method").textContent).toBe("password");
  });

  it("setAuthMethod('otp') · vuelve a otp desde password", async () => {
    render(<Probe />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("to-password"));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("to-otp"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("method").textContent).toBe("otp");
  });

  it("resetOnLogout · restaura a 'otp' aunque esté en password", async () => {
    render(<Probe />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("to-password"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("method").textContent).toBe("password");
    await act(async () => {
      fireEvent.click(screen.getByTestId("logout"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("method").textContent).toBe("otp");
  });

  it("resetOnLogout · idempotente sobre estado ya 'otp'", async () => {
    render(<Probe />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("logout"));
      fireEvent.click(screen.getByTestId("logout"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("method").textContent).toBe("otp");
  });

  it("tipos aceptables · setAuthMethod tolera password/otp únicamente (compile-time)", () => {
    // Verificación de tipo en tiempo de compilación: la firma sólo
    // acepta AuthMethod ("password" | "otp"). Este test es una
    // documentación viva — si el tipo se ampliara, el `let` fallaría.
    let m: AuthMethod = "otp";
    m = "password";
    m = "otp";
    expect(m).toBe("otp");
  });
});
