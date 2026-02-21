import { cookies } from "next/headers";

const COOKIE_NAME = "cfc_team_session";
const encoder = new TextEncoder();

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.TEAM_SESSION_SECRET || "dev-secret-change-me";
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(sig);
}

async function verify(payload: string, signature: string): Promise<boolean> {
  const key = await getKey();
  const sig = fromHex(signature);
  return crypto.subtle.verify("HMAC", key, sig.buffer as ArrayBuffer, encoder.encode(payload));
}

export interface SessionPayload {
  session_id?: string;
  owner_id: string;
  team_name: string;
  role: string;
  league_id: string;
}

export async function setSessionCookie(payload: SessionPayload) {
  const data = JSON.stringify(payload);
  const sig = await sign(data);
  const value = `${data}.${sig}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;

  const lastDot = cookie.value.lastIndexOf(".");
  if (lastDot === -1) return null;

  const data = cookie.value.substring(0, lastDot);
  const sig = cookie.value.substring(lastDot + 1);

  const valid = await verify(data, sig);
  if (!valid) return null;

  try {
    return JSON.parse(data) as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function requireCommissioner(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "commissioner") {
    throw new Error("Unauthorized: Commissioner access required");
  }
  return session;
}

export async function requireOwner(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized: Must select a team first");
  }
  return session;
}
