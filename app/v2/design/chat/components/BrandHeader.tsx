import Image from "next/image";
import type { CSSProperties } from "react";
import { color, space } from "../styles/tokens";

/**
 * Desktop brand block. Uses the UX-01-R official horizontal logo
 * from `public/design/spabla-logo-horizontal-provisional.png`. Zero deep-navy
 * chip — the official PNG has transparency and reads on white
 * without a frame. Aspect ratio 2172:724 preserved.
 */
export function BrandHeader(): React.JSX.Element {
  const wrap: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: `${space.md}px ${space.lg}px`,
    background: color.surface,
    borderBottom: `1px solid ${color.border}`,
    minHeight: 60,
    boxSizing: "border-box",
  };
  return (
    <div style={wrap} data-role="brand-header">
      <Image
        src="/design/spabla-logo-horizontal-provisional.png"
        alt="SPABLA"
        width={158}
        height={53}
        priority
        style={{ height: 34, width: "auto" }}
      />
    </div>
  );
}
