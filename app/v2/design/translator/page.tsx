import { parsePrototypeState } from "../chat/state";
import { TranslatorShell } from "./components/TranslatorShell";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export default async function UxTranslatorPage(props: { searchParams: Promise<SearchParams> }): Promise<React.JSX.Element> {
  const raw = await props.searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) flat[k] = Array.isArray(v) ? v[0] : v;
  const state = parsePrototypeState({ ...flat, view: "translator" });
  return <TranslatorShell state={state} />;
}
