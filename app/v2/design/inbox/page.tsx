import { InboxMobileShell } from "./components/InboxMobileShell";

export const dynamic = "force-dynamic";

/**
 * Mobile inbox landing view for the UX-01-R2 prototype. Shown at
 * `/v2/design/inbox`. Not intended for desktop — the desktop
 * prototype already exposes the conversation list inside the
 * three-column shell.
 */
export default function UxDesignInbox(): React.JSX.Element {
  return <InboxMobileShell />;
}
