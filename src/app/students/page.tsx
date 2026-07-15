"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSchoolGrades } from "@/lib/schoolSettings";
import { getAllStudents, type StudentSearchResult } from "@/lib/students";
import { writeAuditLog } from "@/lib/auditLog";

const MANAGER_ROLES = ["principal", "admin", "vice_principal"];

type StudentRecord = StudentSearchResult;

type StudentForm = { name: string; grade: string; section: string; entryCode: string; nationalId: string };
const emptyForm: StudentForm = { name: "", grade: "", section: "", entryCode: "", nationalId: "" };

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (code === "23505") return "القيمة المدخلة مستخدمة من قبل طالب آخر (رمز الدخول أو رقم الهوية مكرر).";
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "حدث خطأ غير متوقع.";
}

export default function StudentsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState<string>("");
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [teacherScope, setTeacherScope] = useState<{ grade: string; section: string }[]>([]);

  const isManager = viewerRole ? MANAGER_ROLES.includes(viewerRole) : false;
  const isTeacherView = viewerRole === "teacher";

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [schoolGrades, setSchoolGrades] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (authError || !authData.user) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, full_name, is_active, is_blocked")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (cancelled) return;

        if (!profile || profile.is_blocked || profile.is_active === false) {
          router.replace("/login");
          return;
        }

        const role = String(profile.role);

        // Students never get access to student management.
        if (role === "student") {
          router.replace("/dashboard");
          return;
        }

        if (!MANAGER_ROLES.includes(role) && role !== "teacher") {
          router.replace("/dashboard");
          return;
        }

        if (role === "teacher") {
          const { data: assignments, error: assignError } = await supabase
            .from("teacher_assignments")
            .select("grade, section")
            .eq("teacher_id", authData.user.id);
          if (assignError) throw assignError;
          if (cancelled) return;

          const scope = Array.from(
            new Map((assignments ?? []).map((a) => [`${a.grade}|${a.section}`, { grade: a.grade, section: a.section }])).values()
          );
          setTeacherScope(scope);
        }

        setViewerId(authData.user.id);
        setViewerName(profile.full_name ?? "");
        setViewerRole(role);
        setAuthorized(true);
        setCheckingAccess(false);
      } catch (err) {
        if (!cancelled) {
          setAccessError(getErrorMessage(err));
          setCheckingAccess(false);
        }
      }
    }

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllStudents();
      setStudents(data);
    } catch (error: unknown) {
      console.error("LOAD_STUDENTS_ERROR", error);
      setStudents([]);
      setMessage("فشل تحميل الطلاب من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadStudents();
  }, [authorized, loadStudents]);

  useEffect(() => {
    getSchoolGrades()
      .then(setSchoolGrades)
      .catch(() => setSchoolGrades([]));
  }, []);

  // For a teacher, restrict the visible roster to their own assigned classes only.
  // This is a UI-level scope (read access to the full table is already granted by
  // RLS elsewhere in the app); the manager-only write policies are the real security
  // boundary for mutations.
  const scopedStudents = useMemo(() => {
    if (!isTeacherView) return students;
    if (teacherScope.length === 0) return [];
    const allowed = new Set(teacherScope.map((s) => `${s.grade}|${s.section}`));
    return students.filter((s) => allowed.has(`${s.grade}|${s.section}`));
  }, [students, isTeacherView, teacherScope]);

  const grades = useMemo(() => Array.from(new Set(scopedStudents.map((s) => s.grade).filter(Boolean))) as string[], [scopedStudents]);
  const sections = useMemo(() => Array.from(new Set(scopedStudents.map((s) => s.section).filter(Boolean))) as string[], [scopedStudents]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedStudents.filter((s) => {
      const fullName = (s.name ?? "").toLowerCase();
      const grade = (s.grade ?? "").toLowerCase();
      const section = (s.section ?? "").toLowerCase();
      const entryCode = (s.entryCode ?? "").toLowerCase();
      const nationalId = (s.nationalId ?? "").toLowerCase();
      const matchesSearch =
        !q || fullName.includes(q) || grade.includes(q) || section.includes(q) || entryCode.includes(q) || nationalId.includes(q);
      const matchesGrade = gradeFilter === "all" || (s.grade ?? "") === gradeFilter;
      const matchesSection = sectionFilter === "all" || (s.section ?? "") === sectionFilter;
      return matchesSearch && matchesGrade && matchesSection;
    });
  }, [scopedStudents, search, gradeFilter, sectionFilter]);

  function updateField(field: keyof StudentForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function findDuplicate(field: "entry_code" | "national_id", value: string, excludeId?: string) {
    if (!value) return false;
    let query = supabase.from("students").select("id").eq(field, value).limit(1);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!isManager) {
      setMessage("لا تملك صلاحية إدارة الطلاب.");
      return;
    }

    if (!form.name.trim()) return setMessage("يرجى إدخال اسم الطالب.");
    if (!form.grade.trim()) return setMessage("يرجى اختيار الصف.");
    if (!form.section.trim()) return setMessage("يرجى إدخال الشعبة.");
    if (!form.entryCode.trim()) return setMessage("يرجى إدخال رمز الدخول.");
    if (!form.nationalId.trim()) return setMessage("يرجى إدخال رقم الهوية.");

    setSubmitting(true);

    try {
      const dupEntryCode = await findDuplicate("entry_code", form.entryCode.trim(), editingId ?? undefined);
      if (dupEntryCode) {
        setMessage("رمز الدخول مستخدم من قبل طالب آخر.");
        setSubmitting(false);
        return;
      }

      const dupNationalId = await findDuplicate("national_id", form.nationalId.trim(), editingId ?? undefined);
      if (dupNationalId) {
        setMessage("رقم الهوية مستخدم من قبل طالب آخر.");
        setSubmitting(false);
        return;
      }

      if (editingId) {
        const before = students.find((s) => s.id === editingId) ?? null;

        const { error } = await supabase
          .from("students")
          .update({
            full_name: form.name.trim(),
            grade: form.grade.trim(),
            section: form.section.trim(),
            entry_code: form.entryCode.trim(),
            national_id: form.nationalId.trim(),
          })
          .eq("id", editingId);

        if (error) throw error;

        const isTransfer = !!before && (before.grade !== form.grade.trim() || before.section !== form.section.trim());

        await writeAuditLog({
          actorId: viewerId ?? "",
          actorName: viewerName,
          actorRole: viewerRole ?? "",
          action: isTransfer ? "نقل الطالب" : "تعديل بيانات الطالب",
          details: isTransfer
            ? `${form.name.trim()}: من (${before?.grade ?? "-"} / ${before?.section ?? "-"}) إلى (${form.grade.trim()} / ${form.section.trim()})`
            : `تعديل بيانات الطالب ${form.name.trim()}`,
          studentId: editingId,
          oldValues: before
            ? { full_name: before.name, grade: before.grade, section: before.section, entry_code: before.entryCode, national_id: before.nationalId }
            : null,
          newValues: {
            full_name: form.name.trim(),
            grade: form.grade.trim(),
            section: form.section.trim(),
            entry_code: form.entryCode.trim(),
            national_id: form.nationalId.trim(),
          },
        });

        setMessage("تم تعديل بيانات الطالب.");
        setToast({ type: "success", text: isTransfer ? "تم نقل الطالب بنجاح." : "تم تعديل بيانات الطالب بنجاح." });
      } else {
        const newId = globalThis.crypto?.randomUUID?.() ?? `student-${Date.now()}`;
        const { error } = await supabase.from("students").insert({
          id: newId,
          full_name: form.name.trim(),
          grade: form.grade.trim(),
          section: form.section.trim(),
          entry_code: form.entryCode.trim(),
          national_id: form.nationalId.trim(),
        });

        if (error) throw error;

        await writeAuditLog({
          actorId: viewerId ?? "",
          actorName: viewerName,
          actorRole: viewerRole ?? "",
          action: "إضافة طالب جديد",
          details: `${form.name.trim()} (${form.grade.trim()} / ${form.section.trim()})`,
          studentId: newId,
          newValues: {
            full_name: form.name.trim(),
            grade: form.grade.trim(),
            section: form.section.trim(),
            entry_code: form.entryCode.trim(),
            national_id: form.nationalId.trim(),
          },
        });

        setMessage("تمت إضافة الطالب.");
        setToast({ type: "success", text: "تمت إضافة الطالب بنجاح." });
      }

      await loadStudents();
      setForm(emptyForm);
      setEditingId(null);
    } catch (error: unknown) {
      console.error("SAVE_STUDENT_ERROR", error);
      const text = getErrorMessage(error);
      setMessage(text);
      setToast({ type: "error", text });
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(student: StudentRecord) {
    if (!isManager) return;
    setEditingId(student.id);
    setForm({
      name: student.name ?? "",
      grade: student.grade ?? "",
      section: student.section ?? "",
      entryCode: student.entryCode ?? "",
      nationalId: student.nationalId ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleBlock(student: StudentRecord) {
    if (!isManager) return;
    const nextStatus = student.status === "blocked" ? "active" : "blocked";

    try {
      const { error } = await supabase.from("students").update({ status: nextStatus }).eq("id", student.id);
      if (error) throw error;

      await writeAuditLog({
        actorId: viewerId ?? "",
        actorName: viewerName,
        actorRole: viewerRole ?? "",
        action: nextStatus === "blocked" ? "حظر الطالب" : "إلغاء حظر الطالب",
        details: `${student.name} (${student.grade ?? "-"} / ${student.section ?? "-"})`,
        studentId: student.id,
        oldValues: { status: student.status },
        newValues: { status: nextStatus },
      });

      setToast({ type: "success", text: nextStatus === "blocked" ? "تم حظر الطالب." : "تم إلغاء حظر الطالب." });
      await loadStudents();
    } catch (error: unknown) {
      const text = getErrorMessage(error);
      setMessage(text);
      setToast({ type: "error", text });
    }
  }

  async function deleteStudent(student: StudentRecord) {
    if (!isManager) return;
    if (!confirm("هل تريد حذف الطالب؟")) return;

    try {
      const { error } = await supabase.from("students").delete().eq("id", student.id);
      if (error) throw error;

      await writeAuditLog({
        actorId: viewerId ?? "",
        actorName: viewerName,
        actorRole: viewerRole ?? "",
        action: "حذف الطالب",
        details: `${student.name} (${student.grade ?? "-"} / ${student.section ?? "-"})`,
        studentId: student.id,
        oldValues: { full_name: student.name, grade: student.grade, section: student.section },
      });

      setMessage("تم حذف الطالب من القائمة الحالية.");
      await loadStudents();
    } catch (error: unknown) {
      console.error("DELETE_STUDENT_ERROR", error);
      setMessage(getErrorMessage(error));
    }
  }

  async function deleteAllStudents() {
    if (!isManager) return;
    setMessage("");
    if (confirmText !== "حذف الجميع") {
      setMessage("الرجاء كتابة 'حذف الجميع' في مربع التأكيد للمتابعة.");
      return;
    }

    setDeletingAll(true);
    try {
      const { error } = await supabase.from("students").delete().neq("id", "");
      if (error) throw error;

      await writeAuditLog({
        actorId: viewerId ?? "",
        actorName: viewerName,
        actorRole: viewerRole ?? "",
        action: "حذف جميع الطلاب",
        details: "تم حذف جميع سجلات الطلاب من النظام.",
      });

      await loadStudents();
      setToast({ type: "success", text: "تم حذف جميع الطلاب بنجاح." });
      setShowDeleteAll(false);
      setConfirmText("");
      setMessage("");
    } catch (error: unknown) {
      console.error("DELETE_ALL_ERROR", error);
      const text = getErrorMessage(error);
      setMessage(text);
      setToast({ type: "error", text });
    } finally {
      setDeletingAll(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const stats = {
    total: scopedStudents.length,
    grades: grades.length,
    sections: sections.length,
    blocked: scopedStudents.filter((s) => s.status === "blocked").length,
  };

  if (checkingAccess) {
    return (
      <main style={styles.page}>
        <section style={styles.container}>
          <div style={styles.empty}>جارٍ التحقق من صلاحيات الوصول...</div>
        </section>
      </main>
    );
  }

  if (accessError) {
    return (
      <main style={styles.page}>
        <section style={styles.container}>
          <div style={{ ...styles.tableCard, padding: 24 }}>
            <p style={{ margin: 0, fontWeight: 900, color: "#dc2626" }}>تعذر التحقق من صلاحيات الوصول لهذه الصفحة.</p>
            <p style={{ marginTop: 8, color: "#64748b" }}>{accessError}</p>
            <Link href="/dashboard" style={{ ...styles.back, display: "inline-block", marginTop: 16, textAlign: "center" }}>
              العودة إلى لوحة التحكم
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!authorized) return null;

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.path}>الرئيسية / إدارة المدرسة / الطلاب</p>
            <h1 style={styles.title}>إدارة الطلاب</h1>
            <p style={styles.subtitle}>
              {isTeacherView ? "عرض طلاب شعبتك (قراءة فقط)." : "إضافة الطلاب وتعديل بياناتهم ونقلهم بين الصفوف والشعب."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {isManager ? (
              <button onClick={() => setShowDeleteAll(true)} style={styles.deleteAllButton}>🗑 حذف جميع الطلاب</button>
            ) : null}
            <Link href="/dashboard" style={styles.back}>العودة</Link>
          </div>
        </header>

        {isTeacherView ? (
          <div style={styles.teacherBanner}>
            أنت تعرض طلاب شعبتك فقط بصلاحية القراءة. لإدارة كاملة تواصل مع الإدارة.
          </div>
        ) : null}

        <section style={styles.stats}>
          <Card title="إجمالي الطلاب" value={stats.total} color="#2563eb" />
          <Card title="عدد الصفوف" value={stats.grades} color="#16a34a" />
          <Card title="عدد الشعب" value={stats.sections} color="#f59e0b" />
          <Card title="محظورون" value={stats.blocked} color="#dc2626" />
        </section>

        {isManager ? (
          <section style={styles.formCard}>
            <div style={styles.formHeader}>
              <h2 style={styles.sectionTitle}>{editingId ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}</h2>
              {editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} style={styles.cancelButton}>إلغاء التعديل</button> : null}
            </div>

            <form onSubmit={handleSubmit} style={styles.formGrid}>
              <Field label="اسم الطالب"><input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="مثال: طلال الجهني" style={styles.input} disabled={submitting} /></Field>
              <Field label="الصف">
                <select value={form.grade} onChange={(e) => updateField("grade", e.target.value)} style={styles.input} disabled={submitting}>
                  <option value="">اختر الصف</option>
                  {schoolGrades.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </Field>
              <Field label="الشعبة"><input value={form.section} onChange={(e) => updateField("section", e.target.value)} placeholder="مثال: أ" style={styles.input} disabled={submitting} /></Field>
              <Field label="رمز الدخول"><input value={form.entryCode} onChange={(e) => updateField("entryCode", e.target.value)} placeholder="مثال: 1234" style={styles.input} disabled={submitting} /></Field>
              <Field label="رقم الهوية"><input value={form.nationalId} onChange={(e) => updateField("nationalId", e.target.value)} placeholder="رقم الهوية الوطنية" style={styles.input} disabled={submitting} /></Field>
              <button type="submit" style={styles.submitButton} disabled={submitting}>{submitting ? "جارٍ الحفظ..." : editingId ? "حفظ التعديل" : "إضافة الطالب"}</button>
            </form>

            {message ? <p style={message.includes("يرجى") || message.includes("مستخدم") || message.includes("لا تملك") ? styles.error : styles.message}>{message}</p> : null}
          </section>
        ) : null}

        <section style={styles.filters}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة" style={styles.input} />
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={styles.select}>
            <option value="all">كل الصفوف</option>
            {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} style={styles.select}>
            <option value="all">كل الشعب</option>
            {sections.map((section) => <option key={section} value={section}>{section}</option>)}
          </select>
        </section>

        <section style={styles.tableCard}>
          <div style={styles.tableHeader}>
            <h2 style={styles.sectionTitle}>قائمة الطلاب</h2>
            <span style={styles.count}>{filteredStudents.length} طالب</span>
          </div>

          {loading ? <div style={styles.empty}>جارٍ تحميل الطلاب...</div> : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.headRow}>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>اسم الطالب</th>
                    <th style={styles.th}>الصف</th>
                    <th style={styles.th}>الشعبة</th>
                    <th style={styles.th}>رمز الدخول</th>
                    <th style={styles.th}>رقم الهوية</th>
                    <th style={styles.th}>الحالة</th>
                    {isManager ? <th style={styles.th}>الإجراءات</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, index) => (
                    <tr key={student.id}>
                      <td style={styles.td}>{index + 1}</td>
                      <td style={{ ...styles.td, fontWeight: 900, color: "#000" }}>{student.name}</td>
                      <td style={styles.td}>{student.grade ?? "-"}</td>
                      <td style={styles.td}>{student.section ?? "-"}</td>
                      <td style={styles.td}>{student.entryCode ?? "-"}</td>
                      <td style={styles.td}>{student.nationalId ?? "-"}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, background: student.status === "blocked" ? "#dc2626" : "#16a34a" }}>
                          {student.status === "blocked" ? "محظور" : "نشط"}
                        </span>
                      </td>
                      {isManager ? (
                        <td style={styles.td}>
                          <div style={styles.actions}>
                            <button onClick={() => startEdit(student)} style={styles.editButton}>تعديل</button>
                            <button onClick={() => toggleBlock(student)} style={student.status === "blocked" ? styles.unblockButton : styles.blockButton}>
                              {student.status === "blocked" ? "إلغاء الحظر" : "حظر"}
                            </button>
                            <button onClick={() => deleteStudent(student)} style={styles.deleteButton}>حذف</button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStudents.length === 0 ? <div style={styles.empty}>لا يوجد طلاب مطابقون للبحث.</div> : null}
            </div>
          )}
        </section>

        {showDeleteAll && isManager ? (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <h3 style={styles.modalTitle}>تأكيد حذف جميع الطلاب</h3>
              <p style={styles.modalText}>سيتم حذف جميع الطلاب نهائياً من قاعدة البيانات، ولا يمكن التراجع عن هذه العملية.</p>
              <p style={{ marginTop: 8, marginBottom: 8, color: "#334155", fontWeight: 800 }}>للمتابعة اكتب: <span style={{ color: "#dc2626" }}>حذف الجميع</span></p>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="اكتب هنا " style={styles.modalInput} disabled={deletingAll} />
              <div style={styles.modalActions}>
                <button onClick={() => { setShowDeleteAll(false); setConfirmText(""); setMessage(""); }} style={styles.cancelButton} disabled={deletingAll}>إلغاء</button>
                <button onClick={() => void deleteAllStudents()} disabled={deletingAll || confirmText !== "حذف الجميع"} style={{ ...styles.confirmButton, opacity: deletingAll || confirmText !== "حذف الجميع" ? 0.6 : 1 }}>
                  {deletingAll ? "جارٍ الحذف..." : "تأكيد الحذف"}
                </button>
              </div>
              {message ? <p style={styles.error}>{message}</p> : null}
            </div>
          </div>
        ) : null}

        {toast ? (
          <div style={{ ...styles.toast, background: toast.type === "success" ? "#16a34a" : "#dc2626" }}>{toast.text}</div>
        ) : null}
      </section>
    </main>
  );
}

function Card({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardValue, color }}>{value}</div>
      <div style={styles.cardTitle}>{title}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f4f7fb", direction: "rtl", padding: 24, fontFamily: "Tahoma, Arial, sans-serif", color: "#0f172a" },
  container: { maxWidth: 1180, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" },
  path: { margin: 0, color: "#64748b", fontSize: 13 },
  title: { margin: "6px 0", fontSize: 32, fontWeight: 900 },
  subtitle: { margin: 0, color: "#64748b" },
  back: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "12px 18px", color: "#0f172a", textDecoration: "none", fontWeight: 800, height: "fit-content" },
  teacherBanner: { background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 14, padding: "12px 16px", fontWeight: 800, marginBottom: 16, textAlign: "center" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 },
  card: { background: "#fff", borderRadius: 18, padding: 16, textAlign: "center", border: "1px solid #e5e7eb", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" },
  cardValue: { fontSize: 30, fontWeight: 900 },
  cardTitle: { color: "#64748b", marginTop: 4, fontSize: 13 },
  formCard: { background: "#fff", borderRadius: 22, padding: 18, marginBottom: 16, border: "1px solid #e5e7eb", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" },
  formHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 },
  sectionTitle: { margin: 0, fontSize: 20, fontWeight: 900 },
  cancelButton: { border: "none", borderRadius: 12, background: "#f1f5f9", color: "#334155", padding: "10px 14px", cursor: "pointer", fontWeight: 800 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" },
  label: { display: "block", marginBottom: 6, fontSize: 13, color: "#334155", fontWeight: 800 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid #cbd5e1", color: "#111827", background: "#fff", fontSize: 14, outline: "none" },
  select: { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid #cbd5e1", color: "#111827", background: "#fff", fontSize: 14, outline: "none" },
  submitButton: { border: "none", borderRadius: 14, background: "linear-gradient(90deg, #0f766e, #2563eb)", color: "#fff", padding: "12px 16px", cursor: "pointer", fontWeight: 900 },
  message: { margin: "12px 0 0", color: "#0f766e", fontWeight: 800, fontSize: 13 },
  error: { margin: "12px 0 0", color: "#dc2626", fontWeight: 800, fontSize: 13 },
  filters: { background: "#fff", borderRadius: 20, padding: 16, display: "grid", gridTemplateColumns: "1fr 220px 220px", gap: 12, marginBottom: 16, border: "1px solid #e5e7eb" },
  tableCard: { background: "#fff", borderRadius: 22, border: "1px solid #e5e7eb", overflow: "hidden" },
  tableHeader: { padding: 18, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  count: { background: "#e0f2fe", color: "#0369a1", padding: "7px 12px", borderRadius: 999, fontWeight: 900, fontSize: 12 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", minWidth: 900, borderCollapse: "collapse" },
  headRow: { background: "#f0fdf4" },
  th: { padding: 14, color: "#14532d", fontWeight: 900, borderBottom: "1px solid #dcfce7", textAlign: "center" },
  td: { padding: 14, borderBottom: "1px solid #f1f5f9", textAlign: "center", color: "#111827" },
  badge: { display: "inline-flex", color: "#fff", padding: "6px 12px", borderRadius: 999, fontWeight: 900, fontSize: 12 },
  actions: { display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  editButton: { border: "none", borderRadius: 10, padding: "8px 12px", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 900 },
  blockButton: { border: "none", borderRadius: 10, padding: "8px 12px", background: "#f59e0b", color: "#fff", cursor: "pointer", fontWeight: 900 },
  unblockButton: { border: "none", borderRadius: 10, padding: "8px 12px", background: "#0f766e", color: "#fff", cursor: "pointer", fontWeight: 900 },
  deleteButton: { border: "none", borderRadius: 10, padding: "8px 12px", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 900 },
  empty: { padding: 28, textAlign: "center", color: "#64748b" },
  deleteAllButton: { border: 'none', borderRadius: 12, padding: '10px 14px', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 900 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  modal: { background: '#fff', borderRadius: 12, padding: 20, width: 520, maxWidth: '94%', boxShadow: '0 20px 60px rgba(2,6,23,0.4)' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' },
  modalText: { marginTop: 8, color: '#475569' },
  modalInput: { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 12, marginBottom: 12 },
  modalActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
  confirmButton: { border: 'none', borderRadius: 10, padding: '10px 14px', background: 'linear-gradient(90deg,#dc2626,#b91c1c)', color: '#fff', cursor: 'pointer', fontWeight: 900 },
  toast: { position: 'fixed', right: 20, bottom: 20, color: '#fff', padding: '12px 16px', borderRadius: 10, boxShadow: '0 10px 30px rgba(2,6,23,0.3)', zIndex: 80 },
};
