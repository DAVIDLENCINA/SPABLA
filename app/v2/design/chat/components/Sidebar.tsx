import type { CSSProperties } from "react";
import { color, font, radius, space } from "../styles/tokens";
import { IconChat, IconContacts, IconProfile, IconSettings } from "./Icons";

type Props = {
  readonly active?: "chat" | "contacts" | "profile" | "settings";
};

/**
 * Compact left rail (desktop only). No text labels — the rail is
 * icon-only and the panel to its right carries the "Chats" heading.
 * Removing the duplicated "Chats" label avoids the visual repetition
 * flagged in UX-01 review. Every icon has an accessible name via
 * `aria-label`.
 */
export function Sidebar({ active = "chat" }: Props): React.JSX.Element {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: space.sm,
    padding: `${space.md}px ${space.xs}px`,
    background: color.surface,
    borderRight: `1px solid ${color.border}`,
    width: 60,
    boxSizing: "border-box",
  };
  const item = (isActive: boolean, label: string, icon: React.ReactNode): React.JSX.Element => (
    <button
      type="button"
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 42,
        height: 42,
        borderRadius: radius.md,
        border: "none",
        cursor: "pointer",
        color: isActive ? color.spablaNavy : color.textSecondary,
        background: isActive ? color.spablaCyanSoft : "transparent",
        fontFamily: font.family,
      }}
    >
      {icon}
    </button>
  );
  return (
    <nav style={style} aria-label="Navegación principal" data-role="sidebar-rail">
      {item(active === "chat", "Chats", <IconChat size={20} color={active === "chat" ? color.spablaNavy : color.textSecondary} />)}
      {item(active === "contacts", "Contactos", <IconContacts size={20} color={active === "contacts" ? color.spablaNavy : color.textSecondary} />)}
      {item(active === "profile", "Perfil", <IconProfile size={20} color={active === "profile" ? color.spablaNavy : color.textSecondary} />)}
      {item(active === "settings", "Ajustes", <IconSettings size={20} color={active === "settings" ? color.spablaNavy : color.textSecondary} />)}
    </nav>
  );
}
