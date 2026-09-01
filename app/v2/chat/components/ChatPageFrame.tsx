import type { ReactNode } from "react";

import { chatColor, chatFont } from "../styles";

type Props = {
  readonly header: ReactNode;
  readonly children: ReactNode;
};

/**
 * Productive SPABLA Chat shell.
 *
 * UX-02 promotes the approved UX-01-R2 visual language without
 * changing any authentication, bootstrap, polling, translation
 * or messaging behaviour owned by page.tsx.
 */
export function ChatPageFrame({ header, children }: Props): React.JSX.Element {
  return (
    <div
      data-role="productive-chat-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100dvh",
        minHeight: "100vh",
        overflow: "hidden",
        background: chatColor.surfaceAlt,
        color: chatColor.textPrimary,
        fontFamily: chatFont.family,
      }}
    >
      {header}

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          width: "100%",
          maxWidth: 1080,
          margin: "0 auto",
          background: chatColor.surface,
          overflow: "hidden",
        }}
      >
        {children}
      </main>
    </div>
  );
}
