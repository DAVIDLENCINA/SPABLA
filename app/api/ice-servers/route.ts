import { NextResponse } from "next/server";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

// Returns ICE server configuration to the client.
// TURN credentials live exclusively in server-side env vars — never in the client bundle.
//
// Required env vars for TURN:
//   TURN_URLS       comma-separated list of TURN/TURNS URLs
//   TURN_USERNAME   TURN username
//   TURN_CREDENTIAL TURN credential/password
//
// Example (Metered.ca):
//   TURN_URLS=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp
export async function GET() {
  const servers: IceServer[] = [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const rawUrls    = process.env.TURN_URLS;
  const username   = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;

  if (rawUrls && username && credential) {
    const turnUrls = rawUrls.split(",").map((u) => u.trim()).filter(Boolean);
    for (const urls of turnUrls) {
      servers.push({ urls, username, credential });
    }
  }

  return NextResponse.json(
    { iceServers: servers },
    { headers: { "Cache-Control": "no-store" } }
  );
}
