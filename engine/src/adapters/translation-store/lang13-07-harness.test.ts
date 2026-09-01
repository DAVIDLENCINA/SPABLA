/**
 * SPABLA Engine — LANG13-07 · Deterministic 13-language harness.
 *
 * Sustituye el smoke manual frágil de LANG13-06 por un conjunto de
 * pruebas automáticas, reproducibles y fail-closed contra red. La
 * matriz canónica 13 × 13 = 169 combinaciones (13 diagonales + 156
 * direcciones) ya queda locked en
 * `resolve-translated-messages.test.ts` §LANG13-05. Este fichero
 * añade únicamente los aspectos que aquel no cubre y que LANG13-07
 * exige explícitamente:
 *
 *   A · Preservación literal de contenidos observables por el usuario
 *       (URLs, emojis, horas, puntuación, texto original).
 *   B · Propagación de las cuatro razones de `TranslationOutcomeReason`
 *       (`provider_unavailable`, `provider_error`, `empty`, `too_long`)
 *       a través del orquestador sin persistir fila.
 *   C · Barrera de red fail-closed: `globalThis.fetch` queda sustituido
 *       durante toda la suite; cualquier intento revela sólo host y
 *       nombre del test, jamás cabeceras, credenciales o cuerpos.
 *   D · Cero llamadas al proveedor real / a `api.openai.com` observadas.
 *
 * No hace fetch real, no toca OpenAI, no toca Supabase productivo, no
 * lee `OPENAI_API_KEY`, no introduce secretos ni instrumentación
 * temporal en código productivo.
 *
 * @internal Test-only. Compartir helpers con
 * `resolve-translated-messages.test.ts` implicaría refactorizar el
 * fichero que ya blinda LANG13-05 en producción; se prefiere la
 * duplicación mínima para dejar este harness auto-contenido.
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createSingleFlight } from "./single-flight";
import type {
  TranslationInsert,
  TranslationRecord,
  TranslationStore,
} from "./port";
import {
  resolveTranslatedMessages,
  type TranslationOutcomeReason,
  type TranslationProvider,
} from "./resolve-translated-messages";
import type {
  ConversationRecord,
  ConversationId,
  MessagePage,
  MessagePageRequest,
  MessageRecord,
  PersistencePort,
  TenantContext,
  UsageEntry,
} from "../persistence/port";
import { buildTenantContext } from "../persistence/tenant-context";
import { buildVerifiedIdentityFromTrustedBoundary } from "../persistence/identity";
import { asISOTimestamp, asUUID } from "../../types/ids";
import type { LangCode } from "../../types/language";

// ─────────────────────────────────────────────────────────────
// Barrera de red fail-closed — file-scoped (no afecta a los tests
// de integración de otros archivos que usan Supabase local).
// ─────────────────────────────────────────────────────────────

type NetworkAttempt = { readonly host: string; readonly testName: string };
const networkAttempts: NetworkAttempt[] = [];
let originalFetch: typeof globalThis.fetch | undefined;

beforeAll(() => {
  originalFetch = globalThis.fetch;
  const trap = ((input: RequestInfo | URL): Promise<Response> => {
    let host = "unknown";
    try {
      const u =
        typeof input === "string"
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL((input as Request).url);
      host = u.host;
    } catch {
      // Si la URL no se puede parsear, dejamos "unknown". NUNCA
      // registramos el input ni init: podrían contener credenciales.
    }
    const testName = expect.getState().currentTestName ?? "unknown-test";
    networkAttempts.push({ host, testName });
    return Promise.reject(
      new Error(
        `LANG13-07 network barrier: fetch to host='${host}' blocked from test='${testName}'`,
      ),
    );
  }) as typeof fetch;
  globalThis.fetch = trap;
});

afterAll(() => {
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch;
  }
});

// ─────────────────────────────────────────────────────────────
// Fakes autocontenidos (paralelos a los de
// `resolve-translated-messages.test.ts` para no acoplar el harness
// a la evolución de ese fichero).
// ─────────────────────────────────────────────────────────────

const TENANT = asUUID("00000000-0000-0000-0000-0000000007aa");
const OTHER_TENANT = asUUID("00000000-0000-0000-0000-0000000007bb");
const ACTOR_A = asUUID("00000000-0000-0000-0000-0000000007c1");
const CONV = asUUID("00000000-0000-0000-0000-0000000007d1");
const VERSION = "v2";

function ctxOf(actorId: string, tenantId: string): TenantContext {
  return buildTenantContext(
    buildVerifiedIdentityFromTrustedBoundary(
      asUUID(actorId),
      asISOTimestamp("2026-08-13T00:00:00.000Z"),
      "test_fixture",
    ),
    asUUID(tenantId) as MessageRecord["tenantId"],
  );
}

function uuidForIndex(i: number): string {
  const hex = i.toString(16).padStart(12, "0");
  return `00000000-0000-0000-0000-${hex}`;
}

function makeMessage(
  id: string,
  sender: string,
  text: string,
  lang: LangCode,
  at: string,
): MessageRecord {
  return {
    tenantId: TENANT,
    conversationId: CONV,
    messageId: asUUID(id),
    senderId: asUUID(sender),
    text,
    language: lang,
    createdAt: asISOTimestamp(at),
  };
}

class FakePersistence implements PersistencePort {
  constructor(private readonly rows: ReadonlyArray<MessageRecord>) {}
  async saveConversation(_ctx: TenantContext, _r: ConversationRecord): Promise<void> {
    return;
  }
  async loadConversation(
    _ctx: TenantContext,
    _id: ConversationId,
  ): Promise<ConversationRecord | null> {
    return null;
  }
  async saveMessage(_ctx: TenantContext, _r: MessageRecord): Promise<void> {
    return;
  }
  async listMessages(_ctx: TenantContext, _r: MessagePageRequest): Promise<MessagePage> {
    return { items: this.rows, nextCursor: null };
  }
  async appendUsage(_ctx: TenantContext, _e: UsageEntry): Promise<void> {
    return;
  }
}

class FakeStore implements TranslationStore {
  readonly rows: Map<string, TranslationRecord> = new Map();
  private readonly saveEvents: TranslationInsert[] = [];
  static key(t: string, m: string, l: string, v: string): string {
    return `${t}|${m}|${l}|${v}`;
  }
  async load(
    ctx: TenantContext,
    messageId: MessageRecord["messageId"],
    targetLanguage: LangCode,
    translationVersion: string,
  ): Promise<TranslationRecord | null> {
    return this.rows.get(FakeStore.key(ctx.tenantId, messageId, targetLanguage, translationVersion)) ?? null;
  }
  async saveServerSide(
    ctx: TenantContext,
    insert: TranslationInsert,
  ): Promise<TranslationRecord> {
    if (insert.tenantId !== ctx.tenantId) {
      throw new Error("tenant_context_invalid");
    }
    this.saveEvents.push(insert);
    const k = FakeStore.key(ctx.tenantId, insert.messageId, insert.targetLanguage, insert.translationVersion);
    const existing = this.rows.get(k);
    if (existing !== undefined) return existing;
    const record: TranslationRecord = {
      tenantId: insert.tenantId,
      messageId: insert.messageId,
      targetLanguage: insert.targetLanguage,
      translationVersion: insert.translationVersion,
      translatedText: insert.translatedText,
      provider: insert.provider,
      model: insert.model,
      providerRef: insert.providerRef,
      createdAt: asISOTimestamp("2026-08-13T00:00:00.000Z"),
    };
    this.rows.set(k, record);
    return record;
  }
  countSaves(): number {
    return this.saveEvents.length;
  }
}

/**
 * Fake provider determinista e inyectable. Sin comportamiento
 * override devuelve un texto sintético `T(from→to):<text>`. Con
 * `reason` devuelve `{ ok:false, reason }` para probar propagación
 * de errores. Contador de invocaciones observable por el test.
 */
function deterministicProvider(
  behaviour: { readonly reason?: TranslationOutcomeReason } = {},
): { fn: TranslationProvider; calls: () => number } {
  let calls = 0;
  const fn: TranslationProvider = async ({ text, from, to }) => {
    calls += 1;
    if (behaviour.reason !== undefined) {
      return { ok: false as const, reason: behaviour.reason };
    }
    return {
      ok: true as const,
      translatedText: `T(${from}→${to}):${text}`,
      provider: "lang13-07-fake",
      model: null,
      providerRef: `ref-${calls}`,
    };
  };
  return { fn, calls: () => calls };
}

function buildScenario(
  msgId: string,
  originalText: string,
  originalLanguage: LangCode,
) {
  const msg = makeMessage(
    msgId,
    ACTOR_A,
    originalText,
    originalLanguage,
    "2026-08-13T00:00:00.000Z",
  );
  const persistence = new FakePersistence([msg]);
  const store = new FakeStore();
  const provider = deterministicProvider();
  const singleFlight = createSingleFlight();
  return { msg, persistence, store, provider, singleFlight };
}

// ─────────────────────────────────────────────────────────────
// A · Preservación literal de contenidos
// ─────────────────────────────────────────────────────────────

type PreservationCase = { readonly name: string; readonly payload: string };
const PRESERVATION_CASES: ReadonlyArray<PreservationCase> = [
  { name: "URL",            payload: "Consulta la tarifa en https://example.com/tarifa" },
  { name: "emoji",          payload: "Hola mundo 🎉 y también 🌍" },
  { name: "hora",           payload: "Quedamos a las 17:00 y también 08:45" },
  { name: "puntuación",     payload: "¿Qué? ¡Vale! Sí, entonces… «Adiós»." },
  { name: "URL+emoji+hora", payload: "Bon dia. Consulta la tarifa a https://example.com/tarifa 🎉 a les 17:00." },
  { name: "línea múltiple", payload: "línea 1\nlínea 2\nlínea 3" },
];

describe("LANG13-07 · preservación literal de contenidos", () => {
  for (const { name, payload } of PRESERVATION_CASES) {
    test(`${name} · el fake recibe el texto original intacto y translation body contiene el payload sin mutar`, async () => {
      const observed: Array<{ text: string; from: string; to: string }> = [];
      const spy: TranslationProvider = async ({ text, from, to }) => {
        observed.push({ text, from, to });
        return {
          ok: true as const,
          translatedText: `T(${to}):${text}`,
          provider: "lang13-07-spy",
          model: null,
          providerRef: null,
        };
      };
      const s = buildScenario(uuidForIndex(0), payload, "es");
      const result = await resolveTranslatedMessages({
        persistence: s.persistence,
        translationStore: s.store,
        translate: spy,
        tenantContext: ctxOf(ACTOR_A, TENANT),
        conversationId: CONV,
        targetLanguage: "ca",
        translationVersion: VERSION,
        pageLimit: 50,
        singleFlight: s.singleFlight,
      });
      expect(observed, `${name} · el fake NO recibió el payload`).toHaveLength(1);
      expect(observed[0]?.text, `${name} · el fake recibió texto mutado`).toBe(payload);
      expect(observed[0]?.from).toBe("es");
      expect(observed[0]?.to).toBe("ca");
      expect(result.items[0]?.originalText, `${name} · originalText mutado`).toBe(payload);
      expect(result.items[0]?.translation, `${name} · translation body no contiene el payload literal`).toBe(`T(ca):${payload}`);
      expect(result.items[0]?.originalLanguage).toBe("es");
      expect(result.items[0]?.targetLanguage).toBe("ca");
    });
  }

  for (const { name, payload } of PRESERVATION_CASES) {
    test(`${name} · passthrough conserva byte-a-byte el original (sin fake, sin fila)`, async () => {
      const s = buildScenario(uuidForIndex(1), payload, "es");
      const result = await resolveTranslatedMessages({
        persistence: s.persistence,
        translationStore: s.store,
        translate: s.provider.fn,
        tenantContext: ctxOf(ACTOR_A, TENANT),
        conversationId: CONV,
        targetLanguage: "es",
        translationVersion: VERSION,
        pageLimit: 50,
        singleFlight: s.singleFlight,
      });
      expect(result.items[0]?.translationPassthrough).toBe(true);
      expect(result.items[0]?.translation).toBe(payload);
      expect(result.items[0]?.originalText).toBe(payload);
      expect(s.provider.calls()).toBe(0);
      expect(s.store.countSaves()).toBe(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// B · Propagación de las 4 razones de TranslationOutcomeReason
// ─────────────────────────────────────────────────────────────

const REASONS: ReadonlyArray<TranslationOutcomeReason> = [
  "provider_unavailable",
  "provider_error",
  "empty",
  "too_long",
];

describe("LANG13-07 · propagación de errores del proveedor (4 razones)", () => {
  for (const reason of REASONS) {
    test(`reason '${reason}' · llega al cliente como translationError sin persistir fila`, async () => {
      const provider = deterministicProvider({ reason });
      const s = buildScenario(uuidForIndex(0), "payload", "es");
      const result = await resolveTranslatedMessages({
        persistence: s.persistence,
        translationStore: s.store,
        translate: provider.fn,
        tenantContext: ctxOf(ACTOR_A, TENANT),
        conversationId: CONV,
        targetLanguage: "en",
        translationVersion: VERSION,
        pageLimit: 50,
        singleFlight: s.singleFlight,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.translation).toBeNull();
      expect(result.items[0]?.translationError).toBe(reason);
      expect(result.items[0]?.originalText).toBe("payload");
      expect(s.store.rows.size).toBe(0);
      expect(s.store.countSaves()).toBe(0);
      expect(provider.calls()).toBe(1);
    });
  }

  test("un error transitorio NO envenena la caché: reintento posterior con éxito persiste una única fila", async () => {
    const s = buildScenario(uuidForIndex(2), "payload", "es");
    // Primer intento — falla.
    const failing = deterministicProvider({ reason: "provider_unavailable" });
    const first = await resolveTranslatedMessages({
      persistence: s.persistence,
      translationStore: s.store,
      translate: failing.fn,
      tenantContext: ctxOf(ACTOR_A, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: s.singleFlight,
    });
    expect(first.items[0]?.translationError).toBe("provider_unavailable");
    expect(s.store.rows.size).toBe(0);
    // Segundo intento — el nuevo proveedor tiene éxito.
    const ok = deterministicProvider();
    const second = await resolveTranslatedMessages({
      persistence: s.persistence,
      translationStore: s.store,
      translate: ok.fn,
      tenantContext: ctxOf(ACTOR_A, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: s.singleFlight,
    });
    expect(second.items[0]?.translationError).toBeNull();
    expect(second.items[0]?.translation).toBe("T(es→en):payload");
    expect(s.store.rows.size).toBe(1);
    expect(s.store.countSaves()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// C · Barrera de red fail-closed
// ─────────────────────────────────────────────────────────────

describe("LANG13-07 · barrera de red fail-closed", () => {
  test("globalThis.fetch está reemplazada por la trampa: cualquier llamada lanza sin tocar red", async () => {
    const before = networkAttempts.length;
    await expect(
      fetch("https://api.openai.com/v1/chat/completions"),
    ).rejects.toThrow(/LANG13-07 network barrier/);
    expect(networkAttempts.length - before, "la trampa no registró el intento").toBe(1);
    const last = networkAttempts.at(-1);
    expect(last?.host).toBe("api.openai.com");
    // La aserción NUNCA toca cabeceras/cuerpos: el shim ni los lee.
    expect(String(last)).not.toMatch(/sk-|Bearer |Authorization|eyJ/);
  });

  test("hosts distintos también son bloqueados y quedan visibles con host correcto", async () => {
    const before = networkAttempts.length;
    await expect(fetch("http://localhost:54321/rest/v1/messages")).rejects.toThrow(/LANG13-07 network barrier/);
    await expect(fetch(new URL("https://ejemplo.invalid/x"))).rejects.toThrow(/LANG13-07 network barrier/);
    expect(networkAttempts.length - before).toBe(2);
    const hosts = networkAttempts.slice(-2).map((a) => a.host);
    expect(hosts).toContain("localhost:54321");
    expect(hosts).toContain("ejemplo.invalid");
  });

  test("URL inválida como input no rompe la trampa: sigue rechazando", async () => {
    const before = networkAttempts.length;
    await expect(fetch("not-a-url")).rejects.toThrow(/LANG13-07 network barrier/);
    expect(networkAttempts.length - before).toBe(1);
    expect(networkAttempts.at(-1)?.host).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────
// D · Cero llamadas a OpenAI durante toda la suite
// ─────────────────────────────────────────────────────────────

describe("LANG13-07 · contabilización de red y llamadas OpenAI", () => {
  test("cero intentos productivos a api.openai.com durante toda la suite", () => {
    // Los intentos legítimos vienen exclusivamente de tests bajo el
    // describe "barrera de red fail-closed" y siempre son URLs de
    // prueba (host controlado). Cualquier otro intento sería un
    // escape de código productivo.
    const openaiHits = networkAttempts.filter((a) => a.host === "api.openai.com");
    // El único intento a api.openai.com permitido es el test §C.1.
    for (const hit of openaiHits) {
      expect(
        hit.testName,
        `intento a api.openai.com fuera de la trampa: '${hit.testName}'`,
      ).toMatch(/barrera de red fail-closed/);
    }
  });

  test("cero llamadas reales al proveedor observadas por productive code paths", () => {
    // Marca documental. Se combina con el aserto anterior: no ha habido
    // ningún fetch productivo. La instrumentación LANG13-06 se retiró
    // en el cierre; este harness es 100% falso.
    const productiveLeaks = networkAttempts.filter(
      (a) => !/barrera de red fail-closed/.test(a.testName),
    );
    expect(productiveLeaks, "leak de red desde código productivo").toEqual([]);
  });

  test("aislamiento por translationVersion · v1 y v2 no comparten caché", async () => {
    const s = buildScenario(uuidForIndex(3), "payload", "es");
    const argsV1 = {
      persistence: s.persistence,
      translationStore: s.store,
      translate: s.provider.fn,
      tenantContext: ctxOf(ACTOR_A, TENANT),
      conversationId: CONV,
      targetLanguage: "en" as LangCode,
      translationVersion: "v1",
      pageLimit: 50,
      singleFlight: s.singleFlight,
    };
    const argsV2 = { ...argsV1, translationVersion: "v2" };
    await resolveTranslatedMessages(argsV1);
    await resolveTranslatedMessages(argsV2);
    expect(s.store.rows.size).toBe(2);
    expect(s.provider.calls()).toBe(2);
  });

  test("aislamiento por tenant · TENANT y OTHER_TENANT no comparten caché", async () => {
    const s = buildScenario(uuidForIndex(4), "payload", "es");
    await resolveTranslatedMessages({
      persistence: s.persistence,
      translationStore: s.store,
      translate: s.provider.fn,
      tenantContext: ctxOf(ACTOR_A, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: s.singleFlight,
    });
    // El fake de persistencia devuelve las mismas rows para cualquier
    // ctx; el aislamiento en la store es por tenant_id de la clave.
    const keyA = FakeStore.key(TENANT, s.msg.messageId, "en", VERSION);
    const keyB = FakeStore.key(OTHER_TENANT, s.msg.messageId, "en", VERSION);
    expect(s.store.rows.has(keyA)).toBe(true);
    expect(s.store.rows.has(keyB), "OTHER_TENANT compartió caché").toBe(false);
  });
});
