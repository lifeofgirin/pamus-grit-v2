import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "pamus_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export type SessionPayload = {
  role: "teacher" | "admin";
  teacherId: string | null;
  teacherCode: string | null;
  displayName: string;
  exp: number;
};

function getSigningKey() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY가 설정되지 않았습니다.");
  }

  return crypto
    .createHash("sha256")
    .update(`pamus-grit-session-v1:${secret}`)
    .digest();
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signBody(body: string) {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(body)
    .digest("base64url");
}

export function makeSessionToken(
  input: Omit<SessionPayload, "exp">
) {
  const payload: SessionPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };

  const body = base64url(JSON.stringify(payload));
  const signature = signBody(body);
  return `${body}.${signature}`;
}

export function parseSessionToken(
  token: string | undefined
): SessionPayload | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = signBody(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SessionPayload;

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentSession() {
  const store = await cookies();
  return parseSessionToken(store.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
