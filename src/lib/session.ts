export type Role = "principal" | "teacher" | "vice_principal" | "admin" | "student";
export type AppRole = Role;

export type AppSession = {
  id?: string;
  userId: string;
  name: string;
  email?: string | null;
  role: Role;
};

const SESSION_KEY = "smart-guide-session";

export function getSession(): AppSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AppSession) {
  if (typeof window === "undefined") return;
  const value = JSON.stringify(session);
  localStorage.setItem(SESSION_KEY, value);
  document.cookie = `${SESSION_KEY}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  document.cookie = `${SESSION_KEY}=; path=/; max-age=0`;
}
