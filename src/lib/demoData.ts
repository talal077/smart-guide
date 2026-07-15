import type { SupabaseClient } from "@supabase/supabase-js";

// Demo Mode data generator. Deliberately takes a SupabaseClient as a parameter
// (instead of importing a shared instance) so it can be driven by a service-role
// client from the API routes (bypassing RLS, since it writes on behalf of
// principal/admin/vice_principal) without ever bundling that key into client code.

export type DemoCounts = {
  teachers: number;
  students: number;
  grades: number;
  sections: number;
  subjects: number;
  assignments: number;
  scheduleSlots: number;
  lessonSubmissions: number;
  attendanceRecords: number;
  excuses: number;
  notifications: number;
};

const LESSON_NAMES = [
  "الحصة الأولى",
  "الحصة الثانية",
  "الحصة الثالثة",
  "الحصة الرابعة",
  "الحصة الخامسة",
  "الحصة السادسة",
  "الحصة السابعة",
];

const WEEK_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const SECTION_LETTERS = ["أ", "ب", "ج", "د", "هـ"];

const SUBJECTS_BY_STAGE: Record<string, string[]> = {
  "ثانوي": [
    "القرآن الكريم",
    "الدراسات الإسلامية",
    "اللغة العربية",
    "اللغة الإنجليزية",
    "الرياضيات",
    "الفيزياء",
    "الكيمياء",
    "الأحياء",
    "الحاسب",
    "المهارات الرقمية",
    "التربية البدنية",
    "التربية الفنية",
  ],
  "متوسط": [
    "القرآن الكريم",
    "الدراسات الإسلامية",
    "اللغة العربية",
    "اللغة الإنجليزية",
    "الرياضيات",
    "العلوم",
    "الحاسب والمهارات الرقمية",
    "الدراسات الاجتماعية",
    "التربية البدنية",
    "التربية الفنية",
  ],
  "ابتدائي": [
    "القرآن الكريم",
    "اللغة العربية",
    "الرياضيات",
    "العلوم",
    "اللغة الإنجليزية",
    "المهارات الرقمية",
    "التربية البدنية",
    "التربية الفنية",
    "التربية الأسرية",
  ],
};

const MALE_FIRST_NAMES = [
  "عبدالله", "محمد", "أحمد", "خالد", "سعود", "فهد", "ناصر", "بندر", "تركي", "سلطان",
  "عبدالعزيز", "فيصل", "عبدالرحمن", "ماجد", "يزيد", "سامي", "وليد", "زياد", "باسل", "ريان",
  "عمر", "حمد", "سعد", "طلال", "مساعد", "نايف", "رائد", "هيثم", "معاذ", "إبراهيم",
];

const FEMALE_FIRST_NAMES = [
  "نورة", "سارة", "مها", "ريم", "لطيفة", "الجوهرة", "أمل", "هدى", "منيرة", "دلال",
  "شذى", "عبير", "فاطمة", "لمى", "غادة", "رنا", "أسماء", "وفاء", "بشاير", "روان",
];

const FAMILY_NAMES = [
  "الحربي", "الغامدي", "القحطاني", "العتيبي", "الشهري", "الزهراني", "الدوسري", "المطيري",
  "السلمي", "العنزي", "الجهني", "البلوي", "العوفي", "الرشيدي", "السبيعي", "الشمري",
  "الحارثي", "المالكي", "الخالدي", "اليامي", "القرني", "العمري", "الشريف", "النجدي",
];

function pick<T>(list: T[], index: number): T {
  return list[index % list.length];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedStatus(): "present" | "absent" | "late" | "excused" {
  const roll = Math.random();
  if (roll < 0.9) return "present";
  if (roll < 0.94) return "absent";
  if (roll < 0.97) return "late";
  return "excused";
}

function generateFullName(index: number, gender: "male" | "female"): string {
  const first = gender === "male" ? pick(MALE_FIRST_NAMES, index) : pick(FEMALE_FIRST_NAMES, index);
  const family = pick(FAMILY_NAMES, index + 7);
  return `${first} ${family}`;
}

function generateNationalId(seed: number): string {
  const prefix = seed % 2 === 0 ? "1" : "2";
  let digits = prefix;
  let n = seed * 7919 + 104729;
  for (let i = 0; i < 9; i += 1) {
    n = (n * 1103515245 + 12345) % 1000000007;
    digits += String(n % 10);
  }
  return digits;
}

function generatePhone(seed: number): string {
  let digits = "";
  let n = seed * 48271 + 17;
  for (let i = 0; i < 8; i += 1) {
    n = (n * 1103515245 + 12345) % 1000000007;
    digits += String(n % 10);
  }
  return `05${digits}`;
}

async function insertInChunks<T>(
  client: SupabaseClient,
  table: string,
  rows: T[],
  chunkSize = 500
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).insert(chunk as any);
    if (error) throw new Error(`فشل إدخال بيانات في جدول ${table}: ${error.message}`);
  }
}

async function countDemoRows(client: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("is_demo", true);
  if (error) throw new Error(`تعذر قراءة جدول ${table}: ${error.message}`);
  return count ?? 0;
}

export async function isDemoDataPresent(client: SupabaseClient): Promise<boolean> {
  const count = await countDemoRows(client, "profiles");
  return count > 0;
}

export async function getDemoSummary(client: SupabaseClient): Promise<DemoCounts> {
  const [teachers, students, subjects, sections, assignments, scheduleSlots, lessonSubmissions, attendanceRecords, excuses, notifications] =
    await Promise.all([
      countDemoRows(client, "profiles"),
      countDemoRows(client, "students"),
      countDemoRows(client, "subjects"),
      countDemoRows(client, "sections"),
      countDemoRows(client, "teacher_assignments"),
      countDemoRows(client, "class_schedule"),
      countDemoRows(client, "lesson_submissions"),
      countDemoRows(client, "attendance_records"),
      countDemoRows(client, "excuses"),
      countDemoRows(client, "notifications"),
    ]);

  let grades = 0;
  const { data: settings } = await client.from("school_settings").select("stage_id").eq("id", true).maybeSingle();
  if (settings?.stage_id) {
    const { count } = await client
      .from("grade_levels")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", settings.stage_id);
    grades = count ?? 0;
  }

  return { teachers, students, grades, sections, subjects, assignments, scheduleSlots, lessonSubmissions, attendanceRecords, excuses, notifications };
}

/**
 * Deletes only rows flagged is_demo = true, in FK-safe order. Never touches
 * real accounts, school_settings, education administrations, or the current
 * stage/year -- none of those are ever written with is_demo = true.
 */
export async function clearDemoData(client: SupabaseClient): Promise<void> {
  const tablesInOrder = [
    "attendance_records",
    "lesson_submissions",
    "excuses",
    "notifications",
    "class_schedule",
    "teacher_assignments",
    "students",
    "subjects",
    "sections",
  ];

  for (const table of tablesInOrder) {
    const { error } = await client.from(table).delete().eq("is_demo", true);
    if (error) throw new Error(`فشل حذف البيانات التجريبية من جدول ${table}: ${error.message}`);
  }

  const { error: profilesError } = await client.from("profiles").delete().eq("is_demo", true).eq("role", "teacher");
  if (profilesError) throw new Error(`فشل حذف المعلمين التجريبيين: ${profilesError.message}`);
}

export async function generateDemoData(client: SupabaseClient): Promise<DemoCounts> {
  const { data: settings, error: settingsError } = await client
    .from("school_settings")
    .select("stage_id, school_stages(name)")
    .eq("id", true)
    .maybeSingle();

  if (settingsError) throw new Error(`تعذر قراءة إعدادات المدرسة: ${settingsError.message}`);
  if (!settings) throw new Error("أكمل إعداد بيانات المدرسة أولًا من صفحة الإعداد الأولي قبل إنشاء بيانات تجريبية.");

  const stageId = String(settings.stage_id);
  const stageRel = Array.isArray(settings.school_stages) ? settings.school_stages[0] : settings.school_stages;
  const stageName = String(stageRel?.name ?? "");

  const { data: gradeRows, error: gradesError } = await client
    .from("grade_levels")
    .select("name")
    .eq("stage_id", stageId)
    .order("sort_order", { ascending: true });

  if (gradesError) throw new Error(`تعذر قراءة الصفوف: ${gradesError.message}`);
  const grades = (gradeRows ?? []).map((row) => String(row.name));
  if (!grades.length) throw new Error("لا توجد صفوف معرّفة لمرحلة المدرسة الحالية.");

  // ---- Subjects: reuse existing by name, create only what's missing ----
  const subjectNames = SUBJECTS_BY_STAGE[stageName] ?? SUBJECTS_BY_STAGE["ثانوي"];

  const { data: existingSubjectRows, error: existingSubjectsError } = await client.from("subjects").select("id, name");
  if (existingSubjectsError) throw new Error(`تعذر قراءة المواد الحالية: ${existingSubjectsError.message}`);

  const subjectIdByName = new Map<string, string>();
  for (const row of existingSubjectRows ?? []) subjectIdByName.set(String(row.name), String(row.id));

  const missingSubjects = subjectNames.filter((name) => !subjectIdByName.has(name));
  if (missingSubjects.length) {
    const { data: created, error: createSubjectsError } = await client
      .from("subjects")
      .insert(missingSubjects.map((name) => ({ name, is_demo: true })))
      .select("id, name");
    if (createSubjectsError) throw new Error(`فشل إنشاء المواد: ${createSubjectsError.message}`);
    for (const row of created ?? []) subjectIdByName.set(String(row.name), String(row.id));
  }

  const subjectIds = subjectNames.map((name) => subjectIdByName.get(name)!);

  // ---- Students & sections: decide distribution first ----
  const totalStudents = randomInt(400, 600);
  const studentsPerGrade = Math.floor(totalStudents / grades.length);

  type ClassPlan = { grade: string; section: string; studentCount: number };
  const classPlans: ClassPlan[] = [];

  for (const grade of grades) {
    const sectionsNeeded = Math.min(SECTION_LETTERS.length, Math.max(1, Math.ceil(studentsPerGrade / 30)));
    const baseCount = Math.floor(studentsPerGrade / sectionsNeeded);
    const remainder = studentsPerGrade - baseCount * sectionsNeeded;

    for (let s = 0; s < sectionsNeeded; s += 1) {
      classPlans.push({
        grade,
        section: SECTION_LETTERS[s],
        studentCount: baseCount + (s < remainder ? 1 : 0),
      });
    }
  }

  // ---- Sections: reuse existing by name, create only what's missing ----
  const neededSectionNames = Array.from(new Set(classPlans.map((c) => c.section)));
  const { data: existingSectionRows, error: existingSectionsError } = await client.from("sections").select("id, name, sort_order");
  if (existingSectionsError) throw new Error(`تعذر قراءة الشعب الحالية: ${existingSectionsError.message}`);

  const existingSectionNames = new Set((existingSectionRows ?? []).map((row) => String(row.name)));
  const maxSortOrder = (existingSectionRows ?? []).reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0);
  const missingSections = neededSectionNames.filter((name) => !existingSectionNames.has(name));

  if (missingSections.length) {
    const { error: createSectionsError } = await client.from("sections").insert(
      missingSections.map((name, index) => ({
        name,
        sort_order: maxSortOrder + index + 1,
        is_demo: true,
      }))
    );
    if (createSectionsError) throw new Error(`فشل إنشاء الشعب: ${createSectionsError.message}`);
  }

  // ---- Teachers ----
  const teacherCount = randomInt(20, 30);
  const teacherRows = Array.from({ length: teacherCount }, (_, index) => {
    const gender: "male" | "female" = index % 4 === 0 ? "female" : "male";
    const fullName = generateFullName(index, gender);
    return {
      full_name: fullName,
      role: "teacher",
      email: `teacher${index + 1}@demo-school.local`,
      phone: generatePhone(index + 1),
      national_id: generateNationalId(index + 1),
      is_active: true,
      is_blocked: false,
      is_demo: true,
    };
  });

  const { data: insertedTeachers, error: teachersError } = await client
    .from("profiles")
    .insert(teacherRows)
    .select("id, full_name");
  if (teachersError) throw new Error(`فشل إنشاء المعلمين: ${teachersError.message}`);

  const teachers = (insertedTeachers ?? []).map((row) => ({ id: String(row.id), fullName: String(row.full_name) }));

  // ---- Students ----
  const studentRows: Record<string, unknown>[] = [];
  let studentSeed = 0;
  const usedEntryCodes = new Set<string>();

  for (const plan of classPlans) {
    for (let i = 0; i < plan.studentCount; i += 1) {
      studentSeed += 1;
      const gender: "male" | "female" = studentSeed % 3 === 0 ? "female" : "male";
      const fullName = generateFullName(studentSeed + 50, gender);

      let entryCode = String(100000 + studentSeed * 7 + randomInt(0, 6));
      while (usedEntryCodes.has(entryCode)) entryCode = String(Number(entryCode) + 1);
      usedEntryCodes.add(entryCode);

      studentRows.push({
        id: globalThis.crypto.randomUUID(),
        full_name: fullName,
        grade: plan.grade,
        section: plan.section,
        entry_code: entryCode,
        national_id: generateNationalId(studentSeed + 1000),
        status: "active",
        is_demo: true,
      });
    }
  }

  await insertInChunks(client, "students", studentRows);

  // ---- Teacher assignments: one teacher per (subject, grade, section) ----
  type AssignmentPlan = { teacherId: string; subjectId: string; grade: string; section: string };
  const assignmentPlans: AssignmentPlan[] = [];
  const assignmentKeyToTeacher = new Map<string, string>();

  const teachersPerSubject = Math.max(1, Math.round(teachers.length / subjectIds.length));
  let teacherPointer = 0;

  for (const subjectId of subjectIds) {
    const subjectTeacherPool: string[] = [];
    for (let i = 0; i < teachersPerSubject; i += 1) {
      subjectTeacherPool.push(teachers[teacherPointer % teachers.length].id);
      teacherPointer += 1;
    }

    let classPointer = 0;
    for (const plan of classPlans) {
      const teacherId = subjectTeacherPool[classPointer % subjectTeacherPool.length];
      classPointer += 1;

      assignmentPlans.push({ teacherId, subjectId, grade: plan.grade, section: plan.section });
      assignmentKeyToTeacher.set(`${subjectId}__${plan.grade}__${plan.section}`, teacherId);
    }
  }

  await insertInChunks(
    client,
    "teacher_assignments",
    assignmentPlans.map((a) => ({
      teacher_id: a.teacherId,
      subject_id: a.subjectId,
      grade: a.grade,
      section: a.section,
      is_demo: true,
    }))
  );

  const teacherNameById = new Map(teachers.map((t) => [t.id, t.fullName]));

  // ---- Weekly schedule ----
  type ScheduleSlot = {
    dayOfWeek: string;
    period: number;
    grade: string;
    section: string;
    subjectId: string;
    teacherId: string;
  };
  const scheduleSlots: ScheduleSlot[] = [];

  classPlans.forEach((plan, classIndex) => {
    WEEK_DAYS.forEach((dayOfWeek, dayIndex) => {
      for (let period = 1; period <= LESSON_NAMES.length; period += 1) {
        const subjectId = subjectIds[(dayIndex * LESSON_NAMES.length + period + classIndex) % subjectIds.length];
        const teacherId = assignmentKeyToTeacher.get(`${subjectId}__${plan.grade}__${plan.section}`);
        if (!teacherId) continue;

        scheduleSlots.push({ dayOfWeek, period, grade: plan.grade, section: plan.section, subjectId, teacherId });
      }
    });
  });

  await insertInChunks(
    client,
    "class_schedule",
    scheduleSlots.map((slot) => ({
      day_of_week: slot.dayOfWeek,
      period: slot.period,
      grade: slot.grade,
      section: slot.section,
      subject_id: slot.subjectId,
      teacher_id: slot.teacherId,
      is_demo: true,
    }))
  );

  // ---- Attendance for the last 7 school days (Sun-Thu) ----
  const studentsByClass = new Map<string, { id: string; name: string }[]>();
  for (const row of studentRows) {
    const key = `${row.grade}__${row.section}`;
    const list = studentsByClass.get(key) ?? [];
    list.push({ id: String(row.id), name: String(row.full_name) });
    studentsByClass.set(key, list);
  }

  const slotsByDay = new Map<string, ScheduleSlot[]>();
  for (const slot of scheduleSlots) {
    const list = slotsByDay.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    slotsByDay.set(slot.dayOfWeek, list);
  }

  const schoolDates: { date: string; dayOfWeek: string }[] = [];
  const cursor = new Date();
  while (schoolDates.length < 7) {
    const jsDay = cursor.getDay(); // 0 = Sunday ... 6 = Saturday
    if (jsDay >= 0 && jsDay <= 4) {
      schoolDates.push({ date: cursor.toISOString().slice(0, 10), dayOfWeek: WEEK_DAYS[jsDay] });
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  const lessonSubmissionRows: Record<string, unknown>[] = [];
  const attendanceRows: Record<string, unknown>[] = [];
  const excuseRows: Record<string, unknown>[] = [];

  for (const { date, dayOfWeek } of schoolDates) {
    const daySlots = slotsByDay.get(dayOfWeek) ?? [];

    for (const slot of daySlots) {
      const lessonName = LESSON_NAMES[slot.period - 1];
      const classKey = `${slot.grade}__${slot.section}`;
      const classStudents = studentsByClass.get(classKey) ?? [];
      const teacherName = teacherNameById.get(slot.teacherId) ?? "";

      lessonSubmissionRows.push({
        teacher_id: slot.teacherId,
        subject_id: slot.subjectId,
        grade: slot.grade,
        section: slot.section,
        date,
        lesson: lessonName,
        status: "submitted",
        saved_at: `${date}T07:00:00.000Z`,
        submitted_at: `${date}T07:30:00.000Z`,
        is_demo: true,
      });

      for (const student of classStudents) {
        const status = weightedStatus();

        attendanceRows.push({
          id: globalThis.crypto.randomUUID(),
          student_id: student.id,
          student_name: student.name,
          grade: slot.grade,
          section: slot.section,
          date,
          lesson: lessonName,
          status,
          teacher_id: slot.teacherId,
          teacher_name: teacherName,
          subject_id: slot.subjectId,
          attendance_time: `${date}T07:30:00.000Z`,
          is_demo: true,
        });

        if (status === "absent" && Math.random() < 0.3) {
          excuseRows.push({
            id: globalThis.crypto.randomUUID(),
            student_id: student.id,
            student_name: student.name,
            reason: "ظرف عائلي",
            date,
            status: "approved",
            is_demo: true,
          });
        }
      }
    }
  }

  await insertInChunks(client, "lesson_submissions", lessonSubmissionRows);
  await insertInChunks(client, "attendance_records", attendanceRows);
  await insertInChunks(client, "excuses", excuseRows);

  // ---- Notifications ----
  const notificationTemplates = [
    { title: "معلم لم يرفع التحضير", body: (name: string) => `لم يقم المعلم ${name} برفع تحضير الحصة اليوم.` },
    { title: "طالب كثير الغياب", body: (name: string) => `الطالب ${name} تجاوز عدد أيام الغياب المسموح بها.` },
    { title: "طالب متأخر", body: (name: string) => `تسجيل تأخر جديد للطالب ${name} اليوم.` },
    { title: "استدعاء طالب", body: (name: string) => `تم استدعاء ولي أمر الطالب ${name} لمراجعة الإدارة.` },
    { title: "استئذان طالب", body: (name: string) => `طلب استئذان جديد للطالب ${name} بانتظار الموافقة.` },
  ];

  const allStudents = studentRows;
  const notificationRows = Array.from({ length: 20 }, (_, index) => {
    const template = notificationTemplates[index % notificationTemplates.length];
    const student = allStudents[randomInt(0, allStudents.length - 1)];
    const daysAgo = randomInt(0, 6);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);

    return {
      title: template.title,
      body: template.body(String(student?.full_name ?? "طالب")),
      role: "vice_principal",
      is_read: Math.random() < 0.4,
      created_at: createdAt.toISOString(),
      is_demo: true,
    };
  });

  await insertInChunks(client, "notifications", notificationRows);

  return {
    teachers: teachers.length,
    students: studentRows.length,
    grades: grades.length,
    sections: neededSectionNames.length,
    subjects: subjectIds.length,
    assignments: assignmentPlans.length,
    scheduleSlots: scheduleSlots.length,
    lessonSubmissions: lessonSubmissionRows.length,
    attendanceRecords: attendanceRows.length,
    excuses: excuseRows.length,
    notifications: notificationRows.length,
  };
}
