/**
 * SPABLA · UX-01 · Deterministic fixtures for the visual prototype.
 *
 * Zero real people, zero real emails, zero real avatars. Both
 * portraits are generated inline as SVG data-URIs with a colour
 * background + initials — the reference images use photorealistic
 * avatars but the prototype must not ship fake photographs of real
 * individuals. This is documented in the UX-01 rationale.
 *
 * The identity mapping is FIXED (order §FASE 5):
 *   · Current user: Laura Martín · Spanish
 *   · Interlocutor: Takashi Mori · Japanese
 */

export type LangCode = "es" | "ja";

export type Identity = {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
  readonly language: LangCode;
  readonly avatarDataUri: string;
  readonly avatarBg: string;
  readonly avatarInk: string;
};

function buildAvatarSvg(initials: string, bg: string, ink: string): string {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <circle cx="48" cy="48" r="48" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, system-ui, sans-serif" font-size="34"
        font-weight="600" fill="${ink}" letter-spacing="1">${initials}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const LAURA: Identity = {
  id: "self",
  displayName: "Laura Martín",
  initials: "LM",
  language: "es",
  avatarBg: "#2563EB",
  avatarInk: "#FFFFFF",
  avatarDataUri: buildAvatarSvg("LM", "#2563EB", "#FFFFFF"),
};

export const TAKASHI: Identity = {
  id: "peer",
  displayName: "Takashi Mori",
  initials: "TM",
  language: "ja",
  avatarBg: "#0B0F19",
  avatarInk: "#F8FAFC",
  avatarDataUri: buildAvatarSvg("TM", "#0B0F19", "#F8FAFC"),
};

/** Secondary conversation list — pure decoration for shell realism. */
export type ListedContact = {
  readonly id: string;
  readonly identity: Pick<Identity, "displayName" | "initials" | "avatarDataUri" | "avatarBg" | "avatarInk">;
  readonly preview: string;
  readonly timeLabel: string;
  readonly unread?: number;
  readonly online?: boolean;
};

function contactAvatar(initials: string, bg: string, ink = "#FFFFFF"): Pick<Identity, "displayName" | "initials" | "avatarDataUri" | "avatarBg" | "avatarInk"> {
  return {
    displayName: initials,
    initials,
    avatarBg: bg,
    avatarInk: ink,
    avatarDataUri: buildAvatarSvg(initials, bg, ink),
  };
}

export const SIDEBAR_CONTACTS: readonly ListedContact[] = [
  {
    id: "takashi",
    identity: {
      displayName: TAKASHI.displayName,
      initials: TAKASHI.initials,
      avatarBg: TAKASHI.avatarBg,
      avatarInk: TAKASHI.avatarInk,
      avatarDataUri: TAKASHI.avatarDataUri,
    },
    preview: "今夜、カフェで会えますか？",
    timeLabel: "09:45",
    unread: 1,
    online: true,
  },
  {
    id: "aiko",
    identity: contactAvatar("AT", "#F97316"),
    preview: "¡Perfecto! Hablamos pronto",
    timeLabel: "Ayer",
    online: true,
  },
  {
    id: "kwame",
    identity: contactAvatar("KM", "#14B8A6"),
    preview: "Nos vemos más tarde",
    timeLabel: "Ayer",
  },
  {
    id: "rafael",
    identity: contactAvatar("RS", "#8B5CF6"),
    preview: "Gracias por tu ayuda",
    timeLabel: "Lun",
    unread: 1,
  },
];
