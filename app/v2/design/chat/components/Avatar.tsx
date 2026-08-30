import type { CSSProperties } from "react";

type Props = {
  readonly src: string;
  readonly name: string;
  readonly size?: number;
  readonly online?: boolean;
  readonly ring?: boolean;
};

export function Avatar({ src, name, size = 40, online, ring }: Props): React.JSX.Element {
  const wrapperStyle: CSSProperties = {
    position: "relative",
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "visible",
    display: "inline-block",
    flexShrink: 0,
  };
  const imgStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    display: "block",
    objectFit: "cover",
    boxShadow: ring ? "0 0 0 2px #FFFFFF, 0 0 0 4px #1EC7FF" : undefined,
  };
  const dotStyle: CSSProperties = {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: Math.max(8, Math.round(size * 0.24)),
    height: Math.max(8, Math.round(size * 0.24)),
    borderRadius: "50%",
    background: "#22C55E",
    border: "2px solid #FFFFFF",
    boxSizing: "border-box",
  };
  return (
    <span style={wrapperStyle} aria-hidden={false}>
      {/* Inline SVG data-URI — no next/image because these are deterministic
          pre-baked bitmaps and next/image would need remote patterns. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name} style={imgStyle} width={size} height={size} />
      {online ? <span style={dotStyle} aria-label="En línea" role="status" /> : null}
    </span>
  );
}
