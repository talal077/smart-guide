import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AttendanceFilters,
  AttendancePreparation,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceStudent,
  AttendanceUploadCheck,
  TeacherClassAssignment,
  TeacherProfile,
  TeacherSubject,
} from "../types";
import {
  AttendanceAuthError,
  buildFullRosterRecords,
  copyFromPreviousLesson,
  loadAssignedClasses,
  loadAssignedSubjects,
  loadAttendancePreparation,
  loadCurrentTeacher,
  loadStudentsForAttendance,
  markAllStudentsPresent,
  saveAttendancePreparation,
  submitAttendancePreparation,
  updateStudentNotes,
  updateStudentStatus,
  verifyLessonUpload,
} from "../services/attendance.service";
import { getSaudiTodayIso, readLastAttendanceContext, writeLastAttendanceContext } from "../utils/attendance.utils";

const AUTOSAVE_DELAY_MS = 2500;

export function useAttendancePreparation(initialFilters?: AttendanceFilters) {
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [preparation, setPreparation] = useState<AttendancePreparation | null>(null);
  const [uploadStatus, setUploadStatus] = useState<AttendanceUploadCheck | null>(null);
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [subjects, setSubjects] = useState<TeacherSubject[]>([]);
  const [classes, setClasses] = useState<TeacherClassAssignment[]>([]);
  const [selectedDate, setSelectedDate] = useState(getSaudiTodayIso());
  const [selectedLessonId, setSelectedLessonId] = useState("lesson-1");
  const [selectedLessonName, setSelectedLessonName] = useState("الحصة الأولى");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);

  const skipAutosaveRef = useRef(true);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lessonOptions = useMemo(
    () => [
      { id: "lesson-1", name: "الحصة الأولى" },
      { id: "lesson-2", name: "الحصة الثانية" },
      { id: "lesson-3", name: "الحصة الثالثة" },
      { id: "lesson-4", name: "الحصة الرابعة" },
      { id: "lesson-5", name: "الحصة الخامسة" },
      { id: "lesson-6", name: "الحصة السادسة" },
      { id: "lesson-7", name: "الحصة السابعة" },
    ],
    []
  );

  const initializeContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    try {
      const nextTeacher = await loadCurrentTeacher();
      setTeacher(nextTeacher);

      // Restore the class/period this teacher last worked on (if any) so the page
      // reopens the same lesson after a fresh login instead of an arbitrary default.
      // This only decides WHICH lesson to look at -- the actual saved statuses are
      // still always re-read from Supabase below/by the refreshAttendance effect,
      // never from this cache.
      const lastContext = readLastAttendanceContext(nextTeacher.id);

      const nextSubjects = await loadAssignedSubjects(nextTeacher.id);
      setSubjects(nextSubjects);

      const restoredSubject = lastContext && nextSubjects.some((subject) => subject.id === lastContext.subjectId)
        ? lastContext.subjectId
        : nextSubjects[0]?.id ?? "";
      if (restoredSubject) setSelectedSubjectId(restoredSubject);

      const nextClasses = await loadAssignedClasses(nextTeacher.id, restoredSubject || undefined);
      setClasses(nextClasses);

      const restoredClassMatch =
        lastContext && nextClasses.some((item) => item.grade === lastContext.grade && item.section === lastContext.section)
          ? lastContext
          : null;
      const initialClass = restoredClassMatch ?? nextClasses[0];

      if (initialClass) {
        setSelectedGrade(initialClass.grade);
        setSelectedSection(initialClass.section);
      }

      if (restoredClassMatch) {
        setSelectedLessonId(restoredClassMatch.lessonId);
        setSelectedLessonName(restoredClassMatch.lessonName);
      }
    } catch (err) {
      if (err instanceof AttendanceAuthError) {
        setUnauthorized(true);
        setError(err.message);
      } else {
        const message = err instanceof Error ? err.message : "تعذر تحميل بيانات المعلم.";
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadClassesForSubject = useCallback(async (subjectId: string) => {
    if (!teacher) return;

    try {
      const nextClasses = await loadAssignedClasses(teacher.id, subjectId || undefined);
      setClasses(nextClasses);
      if (nextClasses[0]) {
        setSelectedGrade(nextClasses[0].grade);
        setSelectedSection(nextClasses[0].section);
      } else {
        setSelectedGrade("");
        setSelectedSection("");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل الصفوف والشعب.";
      setError(message);
    }
  }, [teacher]);

  // Guards against out-of-order responses: if the grade/section/date/lesson change
  // again (e.g. the initial default gets corrected to a restored last-used class, or the
  // teacher flips dropdowns quickly) while an older refreshAttendance call is still
  // in-flight, that older call's response must never overwrite the newer, more correct
  // one when it resolves later. Only the response matching the latest requested id is
  // ever applied to state.
  const refreshRequestIdRef = useRef(0);

  const refreshAttendance = useCallback(async (filters: AttendanceFilters = initialFilters ?? {}) => {
    const requestId = ++refreshRequestIdRef.current;

    setLoading(true);
    setError(null);
    skipAutosaveRef.current = true;

    try {
      const grade = filters.grade ?? selectedGrade;
      const section = filters.section ?? selectedSection;
      const date = filters.date ?? selectedDate;
      const lessonId = filters.lessonId ?? selectedLessonId;
      const lessonName = filters.lessonName ?? selectedLessonName;

      const nextStudents = await loadStudentsForAttendance({ grade, section });
      const nextPreparation = await loadAttendancePreparation({ date, lessonId, lessonName, grade, section });

      if (refreshRequestIdRef.current !== requestId) {
        // A newer refresh was requested while this one was still in flight -- discard
        // this stale result instead of clobbering the newer (still loading) state.
        return { students: nextStudents, preparation: nextPreparation };
      }

      setStudents(nextStudents);
      setPreparation(nextPreparation);
      setRecords(nextPreparation?.records ?? []);
      return { students: nextStudents, preparation: nextPreparation };
    } catch (err) {
      if (refreshRequestIdRef.current !== requestId) {
        return { students: [] as AttendanceStudent[], preparation: null as AttendancePreparation | null };
      }
      const message = err instanceof Error ? err.message : "تعذر تحميل بيانات التحضير.";
      setError(message);
      return { students: [] as AttendanceStudent[], preparation: null as AttendancePreparation | null };
    } finally {
      if (refreshRequestIdRef.current === requestId) {
        setLoading(false);
        setTimeout(() => {
          skipAutosaveRef.current = false;
        }, 0);
      }
    }
  }, [initialFilters, selectedDate, selectedGrade, selectedLessonId, selectedLessonName, selectedSection]);

  const setStudentStatus = useCallback((student: AttendanceStudent, status: AttendanceStatus) => {
    setRecords((current) =>
      updateStudentStatus(current, student, status, {
        lessonId: selectedLessonId,
        lessonName: selectedLessonName,
        date: selectedDate,
      })
    );
  }, [selectedDate, selectedLessonId, selectedLessonName]);

  const setStudentNotes = useCallback((student: AttendanceStudent, notes: string) => {
    setRecords((current) =>
      updateStudentNotes(current, student, notes, {
        lessonId: selectedLessonId,
        lessonName: selectedLessonName,
        date: selectedDate,
      })
    );
  }, [selectedDate, selectedLessonId, selectedLessonName]);

  const markAllPresent = useCallback(() => {
    setRecords((current) => markAllStudentsPresent(students, current, {
      lessonId: selectedLessonId,
      lessonName: selectedLessonName,
      date: selectedDate,
    }));
  }, [selectedDate, selectedLessonId, selectedLessonName, students]);

  const copyPreviousLesson = useCallback(async () => {
    if (!selectedGrade || !selectedSection) return;

    setLoading(true);
    setError(null);

    try {
      const nextRecords = await copyFromPreviousLesson(students, records, selectedGrade, selectedSection, selectedDate, selectedLessonName, {
        lessonId: selectedLessonId,
        lessonName: selectedLessonName,
        date: selectedDate,
      });
      setRecords(nextRecords);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر جلب بيانات الحصة السابقة.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [records, selectedDate, selectedGrade, selectedLessonId, selectedLessonName, selectedSection, students]);

  const save = useCallback(async (notes?: string, options?: { silent?: boolean }) => {
    if (!selectedGrade || !selectedSection || !students.length) return preparation;

    setSaving(true);
    setSavingAction("save");
    setError(null);
    setSuccessMessage(null);

    try {
      // Always persist one row per real roster student -- not only the ones the
      // teacher explicitly touched -- so a partial edit (e.g. marking 3 of 5 students
      // absent) still saves all 5, defaulting the untouched ones to "present".
      const effectiveRecords = buildFullRosterRecords(students, records, {
        lessonId: selectedLessonId,
        lessonName: selectedLessonName,
        date: selectedDate,
      });

      const nextPreparation = await saveAttendancePreparation({
        lessonId: selectedLessonId,
        lessonName: selectedLessonName,
        date: selectedDate,
        teacherId: teacher?.id,
        teacherName: teacher?.name,
        subjectId: selectedSubjectId || undefined,
        grade: selectedGrade,
        section: selectedSection,
        records: effectiveRecords,
        notes,
      });
      setPreparation(nextPreparation);
      setRecords(nextPreparation.records);
      setLastAutoSaveAt(new Date().toISOString());
      if (!options?.silent) setSuccessMessage("تم حفظ التحضير بنجاح");
      return nextPreparation;
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر حفظ التحضير.";
      setError(message);
      throw err;
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }, [preparation, records, selectedDate, selectedGrade, selectedLessonId, selectedLessonName, selectedSection, selectedSubjectId, students, teacher]);

  const submit = useCallback(async (notes?: string) => {
    if (!selectedGrade || !selectedSection || !students.length) return preparation;

    setSaving(true);
    setSavingAction("submit");
    setError(null);
    setSuccessMessage(null);

    try {
      const effectiveRecords = buildFullRosterRecords(students, records, {
        lessonId: selectedLessonId,
        lessonName: selectedLessonName,
        date: selectedDate,
      });

      const nextPreparation = await submitAttendancePreparation({
        lessonId: selectedLessonId,
        lessonName: selectedLessonName,
        date: selectedDate,
        teacherId: teacher?.id,
        teacherName: teacher?.name,
        subjectId: selectedSubjectId || undefined,
        grade: selectedGrade,
        section: selectedSection,
        records: effectiveRecords,
        notes,
      });
      setPreparation(nextPreparation);
      setRecords(nextPreparation.records);
      setSuccessMessage("تم إرسال التحضير للوكيل بنجاح");
      return nextPreparation;
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إرسال التحضير.";
      setError(message);
      throw err;
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }, [preparation, records, selectedDate, selectedGrade, selectedLessonId, selectedLessonName, selectedSection, selectedSubjectId, students, teacher]);

  const verifyUpload = useCallback(async (filters: AttendanceFilters = initialFilters ?? {}) => {
    try {
      const nextStatus = await verifyLessonUpload(filters);
      setUploadStatus(nextStatus);
      return nextStatus;
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر التحقق من حالة الإرسال.";
      setError(message);
      return null;
    }
  }, [initialFilters]);

  const canEdit = preparation?.status !== "submitted";

  // Remember which class/period this teacher is looking at (not the attendance data
  // itself -- see attendance.utils.ts) so the next login/mount can restore it.
  useEffect(() => {
    if (!teacher || !selectedGrade || !selectedSection) return;

    writeLastAttendanceContext(teacher.id, {
      subjectId: selectedSubjectId,
      grade: selectedGrade,
      section: selectedSection,
      lessonId: selectedLessonId,
      lessonName: selectedLessonName,
    });
  }, [teacher, selectedSubjectId, selectedGrade, selectedSection, selectedLessonId, selectedLessonName]);

  // Auto-save the draft a short while after the teacher stops editing, unless already submitted.
  useEffect(() => {
    if (skipAutosaveRef.current) return;
    if (!canEdit) return;
    if (!selectedGrade || !selectedSection || !records.length) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void save(undefined, { silent: true });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  return {
    teacher,
    subjects,
    classes,
    students,
    records,
    preparation,
    uploadStatus,
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
    verifyUpload,
  };
}
