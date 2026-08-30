import type { CSSProperties } from "react";
import { color, font, space } from "../styles/tokens";
import { IconChat, IconContacts, IconProfile } from "./Icons";

type Props = { readonly active?: "chats" | "contacts" | "profile" };

export function BottomTabBar({ active = "chats" }: Props): React.JSX.Element {
  const style: CSSProperties = {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    padding: `${space.xs}px ${space.md}px 6px`,
    borderTop: `1px solid ${color.border}`,
    background: color.surface,
    minHeight: 48,
    flexShrink: 0,
  };
  const item = (isActive: boolean, label: string, icon: React.ReactNode): React.JSX.Element => (
    <button
      type="button"
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: `4px ${space.md}px`,
        border: "none",
        background: "transparent",
        color: isActive ? color.spablaNavy : color.textSecondary,
        fontFamily: font.family,
        fontSize: 11,
        fontWeight: isActive ? font.weight.semibold : font.weight.medium,
        cursor: "pointer",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <nav style={style} aria-label="Navegación inferior">
      {item(active === "chats", "Chats", <IconChat size={20} color={active === "chats" ? color.spablaNavy : color.textSecondary} />)}
      {item(active === "contacts", "Contactos", <IconContacts size={20} color={active === "contacts" ? color.spablaNavy : color.textSecondary} />)}
      {item(active === "profile", "Perfil", <IconProfile size={20} color={active === "profile" ? color.spablaNavy : color.textSecondary} />)}
    </nav>
  );
}
