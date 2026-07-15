export type UserRole = "principal" | "admin" | "vice_principal" | "teacher" | "student";

export const permissions: Record<UserRole, string[]> = {
  principal: ["*"],
  admin: ["*"],
  vice_principal: ["*"],
  teacher: ["/dashboard", "/attendance", "/absence-records", "/reports", "/notifications", "/settings"],
  student: ["/dashboard", "/attendance", "/reports", "/notifications"],
};

export function canAccess(role: UserRole, path: string) {
  const allowed = permissions[role] ?? [];
  if (allowed.includes("*")) return true;
  return allowed.some((item) => path === item || path.startsWith(item + "/"));
}
