import type { CSSProperties } from "react";
import { color, space } from "../styles/tokens";
import type { PrototypeState } from "../state";
import { BrandHeader } from "./BrandHeader";
import { Sidebar } from "./Sidebar";
import { BottomTabBar } from "./BottomTabBar";
import { ConversationList } from "./ConversationList";
import { ConversationHeader } from "./ConversationHeader";
import { LangSwitcher } from "./LangSwitcher";
import { Timeline } from "./Timeline";
import { Composer } from "./Composer";
import { VoiceCallCard } from "./VoiceCallCard";
import { VideoCallCard } from "./VideoCallCard";
import { BASE_TIMELINE, VIDEO_ENDED_EVENT, VOICE_JUST_ENDED_EVENT, type TimelineEvent } from "../fixtures/timeline";

type Props = { readonly state: PrototypeState };

function eventsForState(state: PrototypeState): readonly TimelineEvent[] {
  const events: TimelineEvent[] = [...BASE_TIMELINE];
  if (state.call === "voice-ended") events.push(VOICE_JUST_ENDED_EVENT);
  if (state.call === "video-ended") events.push(VIDEO_ENDED_EVENT);
  return events;
}

export function DesignShell({ state }: Props): React.JSX.Element {
  const isMobile = state.device === "mobile";
  const isTablet = state.device === "tablet";

  const events = eventsForState(state);
  const showVoice = state.call === "voice";
  const showVideo = state.call === "video" || state.call === "video-min";

  const chatColumn: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    background: color.surface,
    position: "relative",
    minHeight: 0,
  };

  const langBar = (compact = false): CSSProperties => ({
    padding: compact ? `6px ${space.md}px` : `8px ${space.xl}px`,
    background: color.surface,
    borderBottom: `1px solid ${color.border}`,
    display: "flex",
    justifyContent: "center",
    flexShrink: 0,
  });

  if (isMobile) {
    return (
      <div
        data-role="shell"
        data-device="mobile"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          background: color.surfaceAlt,
          overflow: "hidden",
        }}
      >
        <ConversationHeader call={state.call} compact />
        <div style={langBar(true)}>
          <LangSwitcher self="Español" other="Japonés" selfCode="es" otherCode="ja" compact />
        </div>
        {showVoice ? <VoiceCallCard compact /> : null}
        {showVideo ? <VideoCallCard subs={state.subs} minimized={state.call === "video-min"} compact /> : null}
        <Timeline events={events} showOriginal={state.original} compact />
        <Composer compact />
        <BottomTabBar active="chats" />
      </div>
    );
  }

  return (
    <div
      data-role="shell"
      data-device={isTablet ? "tablet" : "desktop"}
      style={{
        display: "grid",
        gridTemplateColumns: isTablet ? "260px 1fr" : "60px 300px 1fr",
        height: "100dvh",
        background: color.surfaceAlt,
        overflow: "hidden",
      }}
    >
      {!isTablet ? (
        // Icon-only rail — the logo lives ONCE at the top of the
        // conversation list panel to the right; the rail carries
        // navigation icons only so the header is not visually
        // duplicated.
        <div style={{ display: "flex", flexDirection: "column", background: color.surface, borderRight: `1px solid ${color.border}` }}>
          <div style={{ height: 60, borderBottom: `1px solid ${color.border}` }} />
          <Sidebar active="chat" />
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: color.surface }}>
        <BrandHeader />
        <ConversationList activeId="takashi" />
      </div>
      <div style={chatColumn}>
        <ConversationHeader call={state.call} />
        <div style={langBar(false)}>
          <LangSwitcher self="Español" other="Japonés" selfCode="es" otherCode="ja" />
        </div>
        {showVoice ? <VoiceCallCard /> : null}
        {showVideo ? <VideoCallCard subs={state.subs} minimized={state.call === "video-min"} /> : null}
        <Timeline events={events} showOriginal={state.original} />
        <Composer />
      </div>
    </div>
  );
}
