/**
 * Client-side account registry (there is no backend in this build).
 * Registered users live in localStorage with a SHA-256 password digest.
 * Demo accounts are always available with the shared demo password.
 */
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ROLES, toSession, type RoleId, type SessionUser } from './portals';

const KEY = 'samanvay.users';

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  designation: string;
  division: string;
  passwordHash: string;
  createdAt: string;
}

function readAll(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as StoredUser[];
  } catch {
    return [];
  }
}

function writeAll(list: StoredUser[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode) */
  }
}

async function digest(s: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // insecure context fallback (http on LAN): plain marker
  return `plain:${s}`;
}

export const FIELD_INVITE_CODE = 'FIELD2026';
export const SELF_SIGNUP_ROLES: RoleId[] = ['GANG_INCHARGE', 'LOCO_PILOT'];

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  role: RoleId;
  designation?: string;
  division?: string;
  inviteCode?: string;
  isSelfSignup?: boolean;
};

export async function signup(input: SignupInput): Promise<{ ok: true; user: SessionUser } | { ok: false; error: 'exists' | 'invalid' | 'invalid_role' | 'invalid_code' }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || input.password.length < 4 || !input.name.trim()) return { ok: false, error: 'invalid' };

  if (input.isSelfSignup) {
    if (!SELF_SIGNUP_ROLES.includes(input.role)) return { ok: false, error: 'invalid_role' };
    const code = (input.inviteCode || '').trim().toUpperCase();
    if (code !== FIELD_INVITE_CODE && code !== 'SAMANVAY') return { ok: false, error: 'invalid_code' };
  }

  if (DEMO_ACCOUNTS.some((d) => d.email === email) || readAll().some((u) => u.email === email)) return { ok: false, error: 'exists' };
  const role = ROLES[input.role];
  const user: StoredUser = {
    id: `U-${Date.now().toString(36).toUpperCase()}`,
    name: input.name.trim(),
    email,
    role: input.role,
    designation: input.designation?.trim() || role.label.en,
    division: input.division?.trim() || 'Agra',
    passwordHash: await digest(input.password),
    createdAt: new Date().toISOString(),
  };
  writeAll([...readAll(), user]);
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, portal: role.portal, designation: user.designation, division: user.division, dept: role.dept, demo: false } };
}

export async function login(emailRaw: string, password: string): Promise<SessionUser | null> {
  const email = emailRaw.trim().toLowerCase();
  const demo = DEMO_ACCOUNTS.find((d) => d.email === email);
  if (demo && password === DEMO_PASSWORD) return toSession(demo);
  const stored = readAll().find((u) => u.email === email);
  if (!stored) return null;
  if (stored.passwordHash !== (await digest(password))) return null;
  const role = ROLES[stored.role];
  return { id: stored.id, name: stored.name, email: stored.email, role: stored.role, portal: role.portal, designation: stored.designation, division: stored.division, dept: role.dept, demo: false };
}

export function listRegistered(): Omit<StoredUser, 'passwordHash'>[] {
  return readAll().map(({ passwordHash: _ph, ...rest }) => rest);
}

export function removeRegistered(id: string) {
  writeAll(readAll().filter((u) => u.id !== id));
}
