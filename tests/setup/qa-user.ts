export type QaRole = "principal" | "admin" | "vice_principal" | "teacher" | "student";

export const QA_PASSWORD = "Qa12345!Reports";

export const QA_ROLE_LABELS: Record<QaRole, string> = {
  principal: "مدير",
  admin: "إداري",
  vice_principal: "وكيل",
  teacher: "معلم",
  student: "طالب",
};

export const QA_USERS: Record<QaRole, { email: string; fullName: string }> = {
  principal: { email: "qa-reports-principal@smartguide.local", fullName: "QA Reports Principal" },
  admin: { email: "qa-reports-admin@smartguide.local", fullName: "QA Reports Admin" },
  vice_principal: { email: "qa-reports-vp@smartguide.local", fullName: "QA Reports VP" },
  teacher: { email: "qa-reports-teacher@smartguide.local", fullName: "QA Reports Teacher" },
  student: { email: "qa-reports-student@smartguide.local", fullName: "QA Reports Student" },
};

// Kept for backward compatibility with any leftover references.
export const QA_EMAIL = QA_USERS.principal.email;
