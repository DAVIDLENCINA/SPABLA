/**
 * SPABLA V2 · Root route.
 *
 * Forwards the origin to the V2 conversation entry point. The V2 page
 * (`/v2/chat`) already renders its own sign-in form when no Supabase
 * session is present, so no dedicated onboarding surface needs to live
 * under `/`.
 */

import { redirect } from "next/navigation";

export default function Root(): never {
  redirect("/v2/chat");
}
