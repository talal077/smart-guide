"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AttendanceEmptyState } from "./components/AttendanceEmptyState";
import { AttendanceStudentRow } from "./components/AttendanceStudentRow";
import { AttendanceSummaryCard } from "./components/AttendanceSummaryCard";
import { useAttendancePreparation } from "./hooks/useAttendancePreparation";
import { exportAttendanceToExcel, exportAttendanceToPdf } from "./utils/attendance.export";

export default function AttendanceModulePage() {
  const router = useRouter();
  const {
    teacher,
    subjects,
    classes,
    students,
    records,
    preparation,
    loading,
    saving,
    savingAction,
    error,
    successMessage,
    unauthorized,
    canEdit,
    lastAutoSaveAt,
    selectedDate,
    selectedLessonId,
    selectedLessonName,
    selectedSubjectId,
    selectedGrade,
    selectedSection,
    lessonOptions,
    setSelectedDate,
    setSelectedLessonId,
    setSelectedLessonName,
    setSelectedSubjectId,
    setSelectedGrade,
    setSelectedSection,
    initializeContext,
    reloadClassesForSubject,
    refreshAttendance,
    setStudentStatus,
    setStudentNotes,
    markAllPresent,
    copyPreviousLesson,
    save,
    submit,
  } = useAttendancePreparation();

  useEffect(() => {
    void initializeContext();
  }, [initializeContext]);

  useEffect(() => {
    if (unauthorized) {
      router.replace("/login");
    }
  }, [router, unauthorized]);

  useEffect(() => {
    if (!selectedGrade || !selectedSection) return;

    void refreshAttendance({
      date: selectedDate,
      lessonId: selectedLessonId,
      lessonName: selectedLessonName,
      grade: selectedGrade,
      section: selectedSection,
    });
  }, [refreshAttendance, selectedDate, selectedGrade, selectedLessonId, selectedLessonName, selectedSection]);

  const currentSubjectName = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId)?.name ?? "",
    [subjects, selectedSubjectId]
  );

  const availableGrades = useMemo(
    () => Array.from(new Set(classes.map((item) => item.grade))),
    [classes]
  );

  const availableSections = useMemo(
    () => classes.filter((item) => item.grade === selectedGrade).map((item) => item.section),
    [classes, selectedGrade]
  );

  const summary = useMemo(() => {
    const present = records.filter((record) => record.status === "present").length;
    const absent = records.filter((record) => record.status === "absent").length;
    const late = records.filter((record) => record.status === "late").length;
    const excused = records.filter((record) => record.status === "excused").length;

    return { present, absent, late, excused, total: students.length };
  }, [records, students.length]);

  const exportContext = {
    teacherName: teacher?.name ?? "",
    subjectName: currentSubjectName,
    grade: selectedGrade,
    section: selectedSection,
    date: selectedDate,
    lessonName: selectedLessonName,
  };

  const isSubmitted = preparation?.status === "submitted";

  // No mock/demo data anywhere in this page: an empty subjects list after loading means
  // the school has genuinely not assigned this teacher anything yet -- that is real
  // information, shown as a plain notice, never masked with fabricated placeholder data.
  const hasNoRealAssignments = !loading && Boolean(teacher) && subjects.length === 0;

  if (unauthorized) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <p className="text-sm text-slate-500">جارٍ التحويل إلى صفحة تسجيل الدخول...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">نظام تحضير الحصص</h1>
          <p className="text-sm text-slate-500">المعلم: {teacher?.name ?? "غير محدد"}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm text-slate-600">
            <span className="mb-1 block">اليوم</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block">الحصة</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={selectedLessonId}
              onChange={(event) => {
                const selected = lessonOptions.find((item) => item.id === event.target.value);
                setSelectedLessonId(event.target.value);
                setSelectedLessonName(selected?.name ?? "الحصة الأولى");
              }}
            >
              {lessonOptions.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lesson.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block">المادة</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={selectedSubjectId}
              disabled={!subjects.length}
              onChange={(event) => {
                setSelectedSubjectId(event.target.value);
                void reloadClassesForSubject(event.target.value);
              }}
            >
              {!subjects.length ? <option value="">لا توجد مواد مسندة</option> : null}
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block">الصف</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={selectedGrade}
              disabled={!availableGrades.length}
              onChange={(event) => setSelectedGrade(event.target.value)}
            >
              {!availableGrades.length ? <option value="">لا يوجد</option> : null}
              {availableGrades.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block">الشعبة</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={selectedSection}
              disabled={!availableSections.length}
              onChange={(event) => setSelectedSection(event.target.value)}
            >
              {!availableSections.length ? <option value="">لا يوجد</option> : null}
              {availableSections.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {hasNoRealAssignments ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          لم يتم إسناد أي مواد أو صفوف لك بعد من إدارة المدرسة. تواصل مع الوكيل أو الإدارة لإسناد المواد والصفوف قبل تحضير
          الحصص.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <AttendanceSummaryCard title="إجمالي الطلاب" value={summary.total} />
        <AttendanceSummaryCard title="الحاضرون" value={summary.present} />
        <AttendanceSummaryCard title="الغائبون" value={summary.absent} />
        <AttendanceSummaryCard title="المتأخرون/المستأذنون" value={summary.late + summary.excused} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={markAllPresent} type="button" disabled={!canEdit || !students.length}>
          اعتبار الجميع حاضرين
        </button>
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => void copyPreviousLesson()} type="button" disabled={!canEdit || !selectedGrade || !selectedSection}>
          نسخ من الحصة السابقة
        </button>
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" onClick={() => void refreshAttendance()} type="button">
          تحديث
        </button>
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => void save()} type="button" disabled={!canEdit || saving || !students.length}>
          {saving && savingAction === "save" ? "جارٍ الحفظ..." : "حفظ التحضير"}
        </button>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={() => void submit()} type="button" disabled={isSubmitted || saving || !students.length}>
          {saving && savingAction === "submit" ? "جارٍ الإرسال..." : isSubmitted ? "تم الإرسال بالفعل" : "إرسال للوكيل"}
        </button>
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => exportAttendanceToPdf(students, records, exportContext)} type="button" disabled={!students.length}>
          تصدير PDF
        </button>
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" onClick={() => exportAttendanceToExcel(students, records, exportContext)} type="button" disabled={!students.length}>
          تصدير Excel
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMessage ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div> : null}

      {preparation ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p>الحالة: {isSubmitted ? "تم الإرسال للوكيل" : "مسودة"}</p>
          <p>آخر حفظ: {preparation.savedAt ? new Date(preparation.savedAt).toLocaleString("ar-EG") : "—"}</p>
          <p>آخر إرسال: {preparation.submittedAt ? new Date(preparation.submittedAt).toLocaleString("ar-EG") : "—"}</p>
          {lastAutoSaveAt ? <p className="text-xs text-slate-400">تم الحفظ التلقائي في {new Date(lastAutoSaveAt).toLocaleTimeString("ar-EG")}</p> : null}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">جارٍ التحميل...</p> : null}

      {!loading && selectedGrade && selectedSection && students.length === 0 ? (
        <AttendanceEmptyState title="لا يوجد طلاب" description="لا توجد بيانات طلاب حقيقية مرتبطة بهذا الصف والشعبة." />
      ) : null}

      {students.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-3 py-2">الرقم</th>
                <th className="px-3 py-2">الهوية</th>
                <th className="px-3 py-2">الاسم</th>
                <th className="px-3 py-2">حالة الحضور</th>
                <th className="px-3 py-2">وقت التسجيل</th>
                <th className="px-3 py-2">الملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => (
                <AttendanceStudentRow
                  key={student.id}
                  index={index}
                  student={student}
                  record={records.find((item) => item.studentId === student.id)}
                  disabled={!canEdit}
                  onStatusChange={setStudentStatus}
                  onNotesChange={setStudentNotes}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
