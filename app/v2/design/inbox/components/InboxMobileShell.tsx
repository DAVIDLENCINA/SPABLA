import Image from "next/image";
import type { CSSProperties } from "react";
import { color, font, space } from "../../chat/styles/tokens";
import { BottomTabBar } from "../../chat/components/BottomTabBar";
import { ConversationList } from "../../chat/components/ConversationList";

/**
 * Mobile inbox — the SPABLA-branded landing view for Chats.
 *
 * Purpose: give the mobile app a strong identity moment WITHOUT
 * repeating the logo inside every open conversation, voice call,
 * video call or Modo Traductor. The logo lives here (and here
 * only) on mobile, exactly like WhatsApp/Telegram/iMessage handle
 * their brand mark on the inbox screen.
 */
export function InboxMobileShell(): React.JSX.Element {
  const wrap: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    background: color.surfaceAlt,
    overflow: "hidden",
  };
  const header: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${space.md}px ${space.md}px ${space.sm}px`,
    background: color.surface,
    borderBottom: `1px solid ${color.border}`,
    flexShrink: 0,
  };
  return (
    <div data-role="shell" data-device="mobile" data-view="inbox" style={wrap}>
      <header style={header} role="banner">
        <Image
          src="/design/spabla-logo-horizontal-provisional.png"
          alt="SPABLA"
          width={148}
          height={49}
          priority
          style={{ height: 30, width: "auto" }}
        />
        <span style={{
          fontFamily: font.family,
          fontSize: 11,
          fontWeight: font.weight.semibold,
          color: color.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>Chats</span>
      </header>
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", background: color.surface }}>
        <ConversationList activeId="" variant="mobile" />
      </div>
      <BottomTabBar active="chats" />
    </div>
  );
}
