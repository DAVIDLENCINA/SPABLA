import { NextResponse } from "next/server";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

// Returns ICE server configuration to the client.
// TURN credentials stay server-side — never exposed in the client bundle.
export async function GET() {
  const servers: IceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const turnUrl  = process.env.TURN_URL;
  const turnTls  = process.env.TURN_URL_TLS;
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;

  if (turnUrl && username && credential) {
    servers.push({ urls: turnUrl, username, credential });
    // TCP fallback on the same port (helps through firewalls blocking UDP)
    servers.push({ urls: `${turnUrl}?transport=tcp`, username, credential });
    if (turnTls) {
      servers.push({ urls: turnTls, username, credential });
    }
  }

  return NextResponse.json(
    { iceServers: servers },
    {
      headers: {
        // Short cache — credentials may rotate
        "Cache-Control": "no-store",
      },
    }
  );
}
