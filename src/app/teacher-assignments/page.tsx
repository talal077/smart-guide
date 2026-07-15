"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSchoolGrades } from "@/lib/schoolSettings";
import { type Section, type Subject, getSections, getSubjects } from "@/lib/basicData";

const ALLOWED_ROLES = ["admin", "vice_principal", "principal"];

type Teacher = { id: string; fullName: string };
type Assignment = { id: string; teacherId: string; subjectId: string; subjectName: string; grade: string; section: string };
type AssignmentConflict = { teacherId: string; teacherName: string };

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

export default function TeacherAssignmentsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [formSubjectId, setFormSubjectId] = useState("");
  const [formGrade, setFormGrade] = useState("");
  const [formSection, setFormSection] = useState("");
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (cancelled) return;

        if (!authData.user) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, is_active, is_blocked")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (cancelled) return;

        if (!profile || profile.is_blocked || profile.is_active === false) {
          router.replace("/login");
          return;
        }

        if (!ALLOWED_ROLES.includes(String(profile.role))) {
          router.replace("/dashboard");
          return;
        }

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

  useEffect(() => {
    if (!authorized) return;

    let cancelled = false;

    async function loadBaseData() {
      setLoading(true);
      setError(null);

      try {
        const [teachersRes, subjectList, gradeList, sectionList] = await Promise.all([
          supabase.from("profiles").select("id, full_name").eq("role", "teacher").order("full_name", { ascending: true }),
          getSubjects(),
          getSchoolGrades(),
          getSections(),
        ]);

        if (teachersRes.error) throw teachersRes.error;

        if (cancelled) return;

        setTeachers((teachersRes.data ?? []).map((row) => ({ id: String(row.id), fullName: String(row.full_name ?? "") })));
        setSubjects(subjectList);
        setGrades(gradeList);
        setSections(sectionList);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBaseData();

    return () => {
      cancelled = true;
    };
  }, [authorized]);

  async function refreshAssignments(teacherId: string) {
    if (!teacherId) {
      setAssignments([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("teacher_assignments")
        .select("id, teacher_id, subject_id, grade, section, subjects(name)")
        .eq("teacher_id", teacherId)
        .order("grade", { ascending: true });

      if (fetchError) throw fetchError;

      setAssignments(
        (data ?? []).map((row) => {
          const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
          return {
            id: String(row.id),
            teacherId: String(row.teacher_id),
            subjectId: String(row.subject_id ?? ""),
            subjectName: String(subject?.name ?? ""),
            grade: String(row.grade ?? ""),
            section: String(row.section ?? ""),
          };
        })
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormSubjectId("");
    setFormGrade("");
    setFormSection("");
    setEditingAssignmentId(null);
  }

  function handleSelectTeacher(teacherId: string) {
    setSelectedTeacherId(teacherId);
    resetForm();
    setSuccessMessage(null);
    setError(null);
    void refreshAssignments(teacherId);
  }

  function handleEditAssignment(assignment: Assignment) {
    setEditingAssignmentId(assignment.id);
    setFormSubjectId(assignment.subjectId);
    setFormGrade(assignment.grade);
    setFormSection(assignment.section);
    setSuccessMessage(null);
    setError(null);
  }

  async function handleDeleteAssignment(assignment: Assignment) {
    if (!window.confirm(`هل تريد حذف إسناد "${assignment.subjectName}" (${assignment.grade} / ${assignment.section})؟`)) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { error: deleteError } = await supabase.from("teacher_assignments").delete().eq("id", assignment.id);
      if (deleteError) throw deleteError;

      if (editingAssignmentId === assignment.id) resetForm();
      setSuccessMessage("تم حذف الإسناد بنجاح.");
      await refreshAssignments(selectedTeacherId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function findConflictingAssignment(
    subjectId: string,
    grade: string,
    section: string,
    excludeAssignmentId: string | null
  ): Promise<AssignmentConflict | null> {
    const { data, error: fetchError } = await supabase
      .from("teacher_assignments")
      .select("id, teacher_id, profiles(full_name)")
      .eq("subject_id", subjectId)
      .eq("grade", grade)
      .eq("section", section);

    if (fetchError) throw fetchError;

    const conflict = (data ?? []).find((row) => String(row.id) !== excludeAssignmentId);
    if (!conflict) return null;

    const teacherProfile = Array.isArray(conflict.profiles) ? conflict.profiles[0] : conflict.profiles;
    return {
      teacherId: String(conflict.teacher_id ?? ""),
      teacherName: String(teacherProfile?.full_name ?? "معلم آخر"),
    };
  }

  async function handleSaveAssignment() {
    if (!selectedTeacherId || !formSubjectId || !formGrade || !formSection) {
      setError("يرجى اختيار المعلم والمادة والصف والشعبة.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const conflict = await findConflictingAssignment(formSubjectId, formGrade, formSection, editingAssignmentId);

      if (conflict) {
        setError(
          conflict.teacherId === selectedTeacherId
            ? "هذا الإسناد (المادة/الصف/الشعبة) موجود بالفعل لهذا المعلم."
            : `هذا الإسناد (المادة/الصف/الشعبة) مسند بالفعل للمعلم "${conflict.teacherName}".`
        );
        return;
      }

      if (editingAssignmentId) {
        const { error: updateError } = await supabase
          .from("teacher_assignments")
          .update({ subject_id: formSubjectId, grade: formGrade, section: formSection })
          .eq("id", editingAssignmentId);
        if (updateError) throw updateError;
        setSuccessMessage("تم تحديث الإسناد بنجاح.");
      } else {
        const { error: insertError } = await supabase
          .from("teacher_assignments")
          .insert({ teacher_id: selectedTeacherId, subject_id: formSubjectId, grade: formGrade, section: formSection });
        if (insertError) throw insertError;
        setSuccessMessage("تم حفظ الإسناد بنجاح.");
      }

      resetForm();
      await refreshAssignments(selectedTeacherId);
    } catch (err) {
      setError(isDuplicateKeyError(err) ? "هذا الإسناد (المادة/الصف/الشعبة) مسند بالفعل لمعلم آخر." : getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const selectedTeacherName = useMemo(
    () => teachers.find((teacher) => teacher.id === selectedTeacherId)?.fullName ?? "",
    [teachers, selectedTeacherId]
  );

  const missingBasicData = !loading && (subjects.length === 0 || grades.length === 0 || sections.length === 0);

  if (checkingAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <p className="text-sm text-slate-500">جارٍ التحقق من الصلاحيات...</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6" dir="rtl">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">تعذر التحقق من صلاحيات الوصول لهذه الصفحة.</p>
          <p className="mt-2">{accessError}</p>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">إسناد المعلمين</h1>
          <p className="text-sm text-slate-500">إسناد المعلمين إلى المواد والصفوف والشعب.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
          العودة
        </Link>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMessage ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">جارٍ التحميل...</p> : null}

      {missingBasicData ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          أضف البيانات الأساسية أولًا من صفحة إدارة البيانات الأساسية.{" "}
          <Link href="/basic-data" className="underline">
            الانتقال إلى إدارة البيانات الأساسية
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-sm text-slate-600">
                <tr>
                  <th className="px-3 py-2">المعلم</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr
                    key={teacher.id}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                      selectedTeacherId === teacher.id ? "bg-blue-50" : ""
                    }`}
                    onClick={() => handleSelectTeacher(teacher.id)}
                  >
                    <td className="px-3 py-2 text-sm font-medium text-slate-900">{teacher.fullName}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectTeacher(teacher.id);
                        }}
                      >
                        اختيار
                      </button>
                    </td>
                  </tr>
                ))}
                {!teachers.length && !loading ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-sm text-slate-500">
                      لا يوجد معلمون مسجلون بعد.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            {!selectedTeacherId ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                اختر معلمًا من القائمة لعرض إسناداته أو إضافة إسناد جديد.
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="mb-3 text-sm font-semibold text-slate-900">
                    {editingAssignmentId ? "تعديل الإسناد" : "إضافة إسناد جديد"} — {selectedTeacherName}
                  </h2>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm text-slate-600">
                      <span className="mb-1 block">المادة</span>
                      <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        value={formSubjectId}
                        onChange={(event) => setFormSubjectId(event.target.value)}
                      >
                        <option value="">اختر المادة</option>
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm text-slate-600">
                      <span className="mb-1 block">الصف</span>
                      <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        value={formGrade}
                        onChange={(event) => setFormGrade(event.target.value)}
                      >
                        <option value="">اختر الصف</option>
                        {grades.map((grade) => (
                          <option key={grade} value={grade}>
                            {grade}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm text-slate-600">
                      <span className="mb-1 block">الشعبة</span>
                      <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        value={formSection}
                        onChange={(event) => setFormSection(event.target.value)}
                      >
                        <option value="">اختر الشعبة</option>
                        {sections.map((section) => (
                          <option key={section.id} value={section.name}>
                            {section.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => void handleSaveAssignment()}
                      disabled={saving}
                    >
                      {editingAssignmentId ? "تحديث الإسناد" : "حفظ الإسناد"}
                    </button>
                    {editingAssignmentId ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                        onClick={resetForm}
                      >
                        إلغاء التعديل
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-right">
                    <thead className="bg-slate-50 text-sm text-slate-600">
                      <tr>
                        <th className="px-3 py-2">المادة</th>
                        <th className="px-3 py-2">الصف</th>
                        <th className="px-3 py-2">الشعبة</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => (
                        <tr key={assignment.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-sm text-slate-900">{assignment.subjectName}</td>
                          <td className="px-3 py-2 text-sm text-slate-600">{assignment.grade}</td>
                          <td className="px-3 py-2 text-sm text-slate-600">{assignment.section}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                                onClick={() => handleEditAssignment(assignment)}
                              >
                                تعديل
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700"
                                onClick={() => void handleDeleteAssignment(assignment)}
                              >
                                حذف
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!assignments.length ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                            لا توجد إسنادات لهذا المعلم بعد.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
