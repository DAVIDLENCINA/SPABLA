import type { CSSProperties } from "react";
import { color, font, space } from "../styles/tokens";
import type { OriginalMode } from "../state";
import type { TimelineEvent } from "../fixtures/timeline";
import { Bubble } from "./Bubble";
import { CallEventCard } from "./CallEvent";

type Props = {
  readonly events: readonly TimelineEvent[];
  readonly showOriginal: OriginalMode;
  readonly compact?: boolean;
};

export function Timeline({ events, showOriginal, compact }: Props): React.JSX.Element {
  const wrap: CSSProperties = {
    padding: compact ? `8px ${space.md}px 4px` : `${space.md}px ${space.xl}px`,
    background: color.surfaceAlt,
    flex: "1 1 0%",
    minHeight: 0,
    overflowY: "auto",
  };
  const divider = (label: string): React.JSX.Element => (
    <div style={{
      textAlign: "center",
      margin: `${compact ? space.xs : space.md}px 0`,
      color: color.textMuted,
      fontFamily: font.family,
      fontSize: font.size.xs,
    }}>
      <span style={{
        display: "inline-block",
        padding: "2px 10px",
        background: color.surface,
        borderRadius: 999,
        border: `1px solid ${color.border}`,
      }}>{label}</span>
    </div>
  );
  return (
    <section
      style={wrap}
      role="log"
      aria-live="polite"
      aria-label="Historial de la conversación con Takashi Mori"
      data-role="timeline"
    >
      {events.map((ev) => {
        if (ev.kind === "day") return <div key={ev.id}>{divider(ev.label)}</div>;
        if (ev.kind === "message") return <Bubble key={ev.id} message={ev} showOriginal={showOriginal} />;
        return <CallEventCard key={ev.id} event={ev} compact={compact} />;
      })}
    </section>
  );
}
