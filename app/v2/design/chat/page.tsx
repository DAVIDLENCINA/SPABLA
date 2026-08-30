import { DesignShell } from "./components/DesignShell";
import { parsePrototypeState } from "./state";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

/**
 * UX-01 prototype entry — the single chat surface renders every
 * combination of `?call=`, `?subs=`, `?original=`, `?device=` via
 * the state parser. No fetch, no auth, no persistence.
 */
export default async function UxDesignChat(props: { searchParams: Promise<SearchParams> }): Promise<React.JSX.Element> {
  const raw = await props.searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }
  const state = parsePrototypeState(flat);
  return <DesignShell state={state} />;
}
