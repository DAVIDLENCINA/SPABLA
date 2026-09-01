/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R3 · Auth method policy hook.
 *
 * Autoridad productiva de la política Q2-R:
 *
 *   · Método inicial: OTP.
 *   · Transición explícita OTP → password.
 *   · Transición explícita password → OTP.
 *   · Reset a OTP tras logout (`resetOnLogout`).
 *   · onAuthenticated NO fuerza retorno a password.
 *
 * Usado por `page.tsx`. Los tests conductuales de la política
 * (`use-auth-method.behavioral.test.tsx`) importan este mismo hook —
 * no reproducen las reglas.
 */

import { useCallback, useState } from "react";

export type AuthMethod = "password" | "otp";

export type UseAuthMethodResult = {
  readonly authMethod: AuthMethod;
  /** Transición explícita disparada por el usuario. */
  setAuthMethod: (m: AuthMethod) => void;
  /**
   * Restaura la política por defecto tras logout / entrar en estado
   * no autenticado. Devuelve el método al inicial (`"otp"`).
   */
  resetOnLogout: () => void;
};

export function useAuthMethod(): UseAuthMethodResult {
  const [authMethod, setAuthMethod] = useState<AuthMethod>("otp");
  const resetOnLogout = useCallback(() => {
    setAuthMethod("otp");
  }, []);
  return { authMethod, setAuthMethod, resetOnLogout };
}
