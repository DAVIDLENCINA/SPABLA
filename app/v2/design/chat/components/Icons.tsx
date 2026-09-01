/**
 * SPABLA · UX-01 · Inline SVG icon set.
 *
 * A small, consistent icon vocabulary. Each icon is a stateless
 * component that accepts colour and size. No external icon library
 * so the prototype stays offline and identity-owned.
 */

import type { CSSProperties } from "react";

type IconProps = {
  readonly size?: number;
  readonly color?: string;
  readonly title?: string;
  readonly strokeWidth?: number;
  readonly style?: CSSProperties;
};

function base(props: IconProps): { size: number; color: string; sw: number; style: CSSProperties } {
  return {
    size: props.size ?? 20,
    color: props.color ?? "currentColor",
    sw: props.strokeWidth ?? 1.75,
    style: props.style ?? {},
  };
}

const svgBase = (title: string | undefined, size: number, style: CSSProperties): CSSProperties => ({
  display: "inline-block",
  verticalAlign: "middle",
  ...style,
});

export function IconPhone(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.34 1.78.66 2.62a2 2 0 0 1-.45 2.11L8 9.79a16 16 0 0 0 6 6l1.34-1.34a2 2 0 0 1 2.11-.45c.84.32 1.72.54 2.62.66A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

export function IconVideo(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M23 7l-7 5 7 5V7z"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}

export function IconMic(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M19 10a7 7 0 0 1-14 0"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

export function IconMicOff(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <line x1="4" y1="4" x2="20" y2="20"/>
      <path d="M12 2a3 3 0 0 0-3 3v6"/>
      <path d="M15 9V5a3 3 0 0 0-3-3"/>
      <path d="M19 10a7 7 0 0 1-11.6 5.3"/>
      <path d="M5 10a7 7 0 0 0 .4 2.4"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  );
}

export function IconSpeaker(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
      <path d="M18.5 5.5a9 9 0 0 1 0 13"/>
    </svg>
  );
}

export function IconCaptions(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <rect x="2" y="5" width="20" height="14" rx="3"/>
      <path d="M7 12h3"/>
      <path d="M14 12h3"/>
      <path d="M7 15h4"/>
      <path d="M13 15h4"/>
    </svg>
  );
}

export function IconExpand(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );
}

export function IconMinimize(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polyline points="4 14 10 14 10 20"/>
      <polyline points="20 10 14 10 14 4"/>
      <line x1="14" y1="10" x2="21" y2="3"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );
}

export function IconEndCall(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M2 12c5-4 15-4 20 0l-3 3c-.7.7-1.8.9-2.7.4l-1.8-.9a2 2 0 0 1-1.1-1.8V11c-2-.5-4-.5-6 0v1.6a2 2 0 0 1-1.1 1.8l-1.8.9c-.9.5-2 .3-2.7-.4L2 12z"/>
      <line x1="4" y1="20" x2="20" y2="4"/>
    </svg>
  );
}

export function IconPlay(p: IconProps): React.JSX.Element {
  const { size, color, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M8 5v14l11-7z"/>
    </svg>
  );
}

export function IconArrowLeft(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

export function IconMore(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <circle cx="12" cy="12" r="1"/>
      <circle cx="12" cy="5" r="1"/>
      <circle cx="12" cy="19" r="1"/>
    </svg>
  );
}

export function IconSearch(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <circle cx="11" cy="11" r="7"/>
      <line x1="21" y1="21" x2="16.5" y2="16.5"/>
    </svg>
  );
}

export function IconEdit(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

export function IconChat(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

export function IconContacts(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

export function IconProfile(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

export function IconSettings(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .66.39 1.25 1 1.51.4.17.85.15 1.24-.07a1.65 1.65 0 0 0 .58-.26l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01c.26.61.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

export function IconEmoji(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
      <line x1="9" y1="9" x2="9.01" y2="9"/>
      <line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
  );
}

export function IconPaperclip(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
    </svg>
  );
}

export function IconSwap(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

export function IconChevronDown(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

export function IconChevronUp(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  );
}

export function IconRepeat(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

export function IconText(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <polyline points="4 7 4 4 20 4 20 7"/>
      <line x1="9" y1="20" x2="15" y2="20"/>
      <line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
  );
}

export function IconBookmark(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

export function IconStop(p: IconProps): React.JSX.Element {
  const { size, color, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <rect x="6" y="6" width="12" height="12" rx="1"/>
    </svg>
  );
}

export function IconArrowUp(p: IconProps): React.JSX.Element {
  const { size, color, sw, style } = base(p);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={svgBase(p.title, size, style)} role="img" aria-hidden={p.title ? undefined : true}>
      {p.title ? <title>{p.title}</title> : null}
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </svg>
  );
}
