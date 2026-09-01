/**
 * SPABLA V2 · Hito 9.2.6 · V1-ERADICATION.
 *
 * Root route: forward the origin to the V2 conversation entry point.
 * The V2 page (`/v2/chat`) already renders its own sign-in form when
 * no Supabase session is present, so no dedicated onboarding surface
 * needs to live under `/`. This preserves the public `/` URL without
 * transporting any V1 code, hook or endpoint.
 */

import { redirect } from "next/navigation";

export default function Root(): never {
  redirect("/v2/chat");
}
