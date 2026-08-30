import type { CSSProperties } from "react";
import { color, font, radius, space } from "../styles/tokens";
import { SIDEBAR_CONTACTS } from "../fixtures/identities";
import { Avatar } from "./Avatar";
import { IconEdit, IconSearch } from "./Icons";

type Props = { readonly activeId: string; readonly variant?: "desktop" | "mobile" };

export function ConversationList({ activeId, variant = "desktop" }: Props): React.JSX.Element {
  const isMobile = variant === "mobile";
  const paneStyle: CSSProperties = {
    background: color.surface,
    borderRight: isMobile ? "none" : `1px solid ${color.border}`,
    display: "flex",
    flexDirection: "column",
    minWidth: isMobile ? 0 : 280,
    boxSizing: "border-box",
  };
  const headerStyle: CSSProperties = {
    display: isMobile ? "none" : "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${space.md}px ${space.lg}px ${space.sm}px`,
  };
  return (
    <aside style={paneStyle} aria-label="Lista de conversaciones" data-role="conversation-list">
      <div style={headerStyle}>
        <h2 style={{
          margin: 0,
          fontFamily: font.family,
          fontSize: "1.15rem",
          color: color.textPrimary,
          fontWeight: font.weight.semibold,
          letterSpacing: "-0.01em",
        }}>Chats</h2>
        <button
          type="button"
          aria-label="Nuevo chat"
          style={{
            border: `1px solid ${color.border}`,
            background: color.surface,
            width: 32,
            height: 32,
            borderRadius: radius.sm,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: color.textSecondary,
            cursor: "pointer",
          }}
        >
          <IconEdit size={15} />
        </button>
      </div>
      <div style={{ padding: `0 ${space.md}px ${space.sm}px` }}>
        <label
          htmlFor="ux01-search"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            background: color.surfaceSubtle,
            borderRadius: radius.md,
            color: color.textSecondary,
            fontFamily: font.family,
            fontSize: font.size.sm,
          }}
        >
          <IconSearch size={15} />
          <input
            id="ux01-search"
            type="search"
            placeholder="Buscar conversaciones"
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              width: "100%",
              fontFamily: font.family,
              fontSize: font.size.sm,
              color: color.textPrimary,
            }}
          />
        </label>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, overflowY: "auto" }}>
        {SIDEBAR_CONTACTS.map((c) => {
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                aria-current={active ? "true" : undefined}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: `10px ${space.md}px`,
                  textDecoration: "none",
                  background: active ? color.spablaCyanSoft : "transparent",
                  borderLeft: active ? `3px solid ${color.spablaCyan}` : "3px solid transparent",
                  alignItems: "center",
                }}
              >
                <Avatar src={c.identity.avatarDataUri} name={c.identity.displayName} size={38} online={c.online} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{
                      fontFamily: font.family,
                      fontWeight: font.weight.semibold,
                      color: color.textPrimary,
                      fontSize: font.size.sm,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {c.identity.displayName}
                    </span>
                    <span style={{ fontFamily: font.family, fontSize: font.size.xs, color: color.textMuted }}>{c.timeLabel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{
                      fontFamily: c.preview.match(/[぀-ヿ一-鿿]/) ? "'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', system-ui, sans-serif" : font.family,
                      fontSize: font.size.xs,
                      color: color.textSecondary,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {c.preview}
                    </span>
                    {c.unread ? (
                      <span
                        aria-label={`${c.unread} mensajes no leídos`}
                        style={{
                          background: color.spablaCyan,
                          color: color.spablaNavy,
                          borderRadius: radius.pill,
                          minWidth: 20,
                          height: 20,
                          padding: "0 6px",
                          fontFamily: font.family,
                          fontSize: font.size.xs,
                          fontWeight: font.weight.bold,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {c.unread}
                      </span>
                    ) : null}
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
