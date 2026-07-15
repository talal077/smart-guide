"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  type Section,
  type Subject,
  addGradeLevel,
  createSection,
  createSubject,
  deleteGradeLevel,
  deleteSection,
  deleteSubject,
  getSections,
  getSubjects,
  updateSection,
  updateSubject,
} from "@/lib/basicData";
import { type GradeLevel, getGradeLevelsForStage, getSchoolSettings } from "@/lib/schoolSettings";

const ALLOWED_ROLES = ["admin", "vice_principal", "principal"];
const TABS = [
  { key: "subjects", label: "المواد" },
  { key: "grades", label: "الصفوف" },
  { key: "sections", label: "الشعب" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

export default function BasicDataPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("subjects");

  const [stageId, setStageId] = useState<string | null>(null);
  const [stageName, setStageName] = useState<string>("");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const settings = await getSchoolSettings();
      if (!settings) {
        setError("لم يتم إعداد بيانات المدرسة بعد.");
        setStageId(null);
        setStageName("");
        setGrades([]);
      } else {
        setStageId(settings.stageId);
        setStageName(settings.stageName);
        setGrades(await getGradeLevelsForStage(settings.stageId));
      }

      const [subjectList, sectionList] = await Promise.all([getSubjects(), getSections()]);
      setSubjects(subjectList);
      setSections(sectionList);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authorized) return;
    void loadAll();
  }, [authorized]);

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
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">إدارة البيانات الأساسية</h1>
          <p className="text-sm text-slate-500">المواد، الصفوف، والشعب المستخدمة في إسناد المعلمين وباقي صفحات النظام.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
          العودة
        </Link>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div> : null}
      {loading ? <p className="text-sm text-slate-500">جارٍ التحميل...</p> : null}

      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-2 sm:inline-grid sm:w-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              activeTab === tab.key ? "bg-blue-700 text-white" : "bg-white text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "subjects" ? (
        <SubjectsTab
          subjects={subjects}
          setSubjects={setSubjects}
          setError={setError}
          setMessage={setMessage}
        />
      ) : null}

      {activeTab === "grades" ? (
        <GradesTab
          stageId={stageId}
          stageName={stageName}
          grades={grades}
          setGrades={setGrades}
          setError={setError}
          setMessage={setMessage}
        />
      ) : null}

      {activeTab === "sections" ? (
        <SectionsTab
          sections={sections}
          setSections={setSections}
          setError={setError}
          setMessage={setMessage}
        />
      ) : null}
    </div>
  );
}

function SubjectsTab({
  subjects,
  setSubjects,
  setError,
  setMessage,
}: {
  subjects: Subject[];
  setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
  setError: (value: string | null) => void;
  setMessage: (value: string | null) => void;
}) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      setError("يرجى إدخال اسم المادة.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createSubject(name);
      setSubjects((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setNewName("");
      setMessage("تمت إضافة المادة.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: string) {
    const name = editingName.trim();
    if (!name) {
      setError("يرجى إدخال اسم المادة.");
      return;
    }

    setError(null);
    try {
      await updateSubject(id, name);
      setSubjects((current) => current.map((item) => (item.id === id ? { ...item, name } : item)));
      setEditingId(null);
      setMessage("تم تعديل المادة.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDelete(subject: Subject) {
    if (!window.confirm(`هل تريد حذف مادة "${subject.name}"؟`)) return;

    setError(null);
    try {
      await deleteSubject(subject.id);
      setSubjects((current) => current.filter((item) => item.id !== subject.id));
      setMessage("تم حذف المادة.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="اسم المادة الجديدة"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          إضافة مادة
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              <th className="px-3 py-2">اسم المادة</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-sm text-slate-900">
                  {editingId === subject.id ? (
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                  ) : (
                    subject.name
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex justify-center gap-2">
                    {editingId === subject.id ? (
                      <>
                        <button
                          type="button"
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white"
                          onClick={() => void handleSaveEdit(subject.id)}
                        >
                          حفظ
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                          onClick={() => setEditingId(null)}
                        >
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                          onClick={() => {
                            setEditingId(subject.id);
                            setEditingName(subject.name);
                          }}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700"
                          onClick={() => void handleDelete(subject)}
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!subjects.length ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-sm text-slate-500">
                  لا توجد مواد بعد.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GradesTab({
  stageId,
  stageName,
  grades,
  setGrades,
  setError,
  setMessage,
}: {
  stageId: string | null;
  stageName: string;
  grades: GradeLevel[];
  setGrades: React.Dispatch<React.SetStateAction<GradeLevel[]>>;
  setError: (value: string | null) => void;
  setMessage: (value: string | null) => void;
}) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!stageId) {
      setError("يرجى إكمال إعداد بيانات المدرسة أولًا.");
      return;
    }

    const name = newName.trim();
    if (!name) {
      setError("يرجى إدخال اسم الصف.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await addGradeLevel(stageId, name);
      setGrades(await getGradeLevelsForStage(stageId));
      setNewName("");
      setMessage("تمت إضافة الصف.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(grade: GradeLevel) {
    if (!window.confirm(`هل تريد حذف صف "${grade.name}"؟`)) return;

    setError(null);
    try {
      await deleteGradeLevel(grade.id);
      setGrades((current) => current.filter((item) => item.id !== grade.id));
      setMessage("تم حذف الصف.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-800">
        المرحلة الحالية: {stageName || "غير محددة"}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="اسم الصف الجديد"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          disabled={!stageId}
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving || !stageId}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          إضافة صف
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              <th className="px-3 py-2">اسم الصف</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {grades.map((grade) => (
              <tr key={grade.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-sm text-slate-900">{grade.name}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700"
                    onClick={() => void handleDelete(grade)}
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
            {!grades.length ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-sm text-slate-500">
                  لا توجد صفوف لهذه المرحلة بعد.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionsTab({
  sections,
  setSections,
  setError,
  setMessage,
}: {
  sections: Section[];
  setSections: React.Dispatch<React.SetStateAction<Section[]>>;
  setError: (value: string | null) => void;
  setMessage: (value: string | null) => void;
}) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      setError("يرجى إدخال اسم الشعبة.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createSection(name);
      setSections((current) => [...current, created]);
      setNewName("");
      setMessage("تمت إضافة الشعبة.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: string) {
    const name = editingName.trim();
    if (!name) {
      setError("يرجى إدخال اسم الشعبة.");
      return;
    }

    setError(null);
    try {
      await updateSection(id, name);
      setSections((current) => current.map((item) => (item.id === id ? { ...item, name } : item)));
      setEditingId(null);
      setMessage("تم تعديل الشعبة.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleDelete(section: Section) {
    if (!window.confirm(`هل تريد حذف شعبة "${section.name}"؟`)) return;

    setError(null);
    try {
      await deleteSection(section.id);
      setSections((current) => current.filter((item) => item.id !== section.id));
      setMessage("تم حذف الشعبة.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="مثال: أ أو 1"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          إضافة شعبة
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              <th className="px-3 py-2">اسم الشعبة</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <tr key={section.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-sm text-slate-900">
                  {editingId === section.id ? (
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                  ) : (
                    section.name
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex justify-center gap-2">
                    {editingId === section.id ? (
                      <>
                        <button
                          type="button"
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white"
                          onClick={() => void handleSaveEdit(section.id)}
                        >
                          حفظ
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                          onClick={() => setEditingId(null)}
                        >
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                          onClick={() => {
                            setEditingId(section.id);
                            setEditingName(section.name);
                          }}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700"
                          onClick={() => void handleDelete(section)}
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!sections.length ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-sm text-slate-500">
                  لا توجد شعب بعد.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
