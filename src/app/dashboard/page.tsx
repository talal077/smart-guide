"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type StudentRecord, getStudents } from "@/lib/students";
import { type AttendanceRecord, getAttendance } from "@/lib/attendance";
import { type ExcuseRecord, getExcuses } from "@/lib/excuses";

export type AppRole =
  | "principal"
  | "teacher"
  | "vice_principal"
  | "admin"
  | "student";

export type AppSession = {
  id: string;
  email: string | null;
  full_name: string;
  role: AppRole;
};

const roleLabel: Record<string, string> = {
  principal: "مدير",
  teacher: "معلم",
  vice_principal: "وكيل",
  admin: "إداري",
  student: "طالب",
};

const allowedLinks: Record<string, string[]> = {
  principal: ["dashboard", "attendance", "absence-records", "students", "reports", "student-actions", "notifications", "noor-import", "export-excel", "export-pdf", "audit-log", "settings"],
  admin: ["dashboard", "attendance", "absence-records", "students", "reports", "student-actions", "notifications", "noor-import", "export-excel", "export-pdf", "audit-log", "settings"],
  vice_principal: ["dashboard", "attendance", "absence-records", "students", "reports", "student-actions", "notifications", "noor-import", "export-excel", "export-pdf", "audit-log", "settings"],
  teacher: ["dashboard", "attendance", "absence-records", "reports", "student-actions", "notifications"],
  student: ["dashboard", "attendance", "reports", "notifications"],
};

const navItems = [
  { key: "dashboard", href: "/dashboard", icon: "🏠", label: "الرئيسية" },
  { key: "attendance", href: "/attendance", icon: "✅", label: "تحضير الحصص" },
  { key: "absence-records", href: "/absence-records", icon: "📋", label: "سجل الغياب" },
  { key: "students", href: "/students", icon: "🎓", label: "الطلاب" },
  { key: "student-actions", href: "/student-actions", icon: "📌", label: "إجراءات الطالب" },
  { key: "reports", href: "/reports", icon: "📊", label: "التقارير" },
  { key: "notifications", href: "/notifications", icon: "🔔", label: "التنبيهات" },
  { key: "noor-import", href: "/noor-import", icon: "📥", label: "استيراد نور" },
  { key: "export-excel", href: "/export-excel", icon: "📗", label: "تصدير Excel" },
  { key: "export-pdf", href: "/export-pdf", icon: "📕", label: "تصدير PDF" },
  { key: "audit-log", href: "/audit-log", icon: "🧾", label: "سجل العمليات" },
  { key: "settings", href: "/settings", icon: "⚙️", label: "الإعدادات" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [excuses, setExcuses] = useState<ExcuseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active, is_blocked")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile || profile.is_blocked || profile.is_active === false) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setSession({
        id: profile.id,
        email: data.user.email ?? null,
        full_name: profile.full_name,
        role: profile.role,
      });
    }

    loadSession();
  }, [router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [studentData, attendanceData, excuseData] = await Promise.all([
        getStudents(),
        getAttendance(),
        getExcuses(),
      ]);

      setStudents(studentData);
      setAttendance(attendanceData);
      setExcuses(excuseData);
      setLoading(false);
    }

    load();
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayRecords = attendance.filter((item) => item.date === today);

    const registeredToday =
      todayRecords.filter((item) =>
        ["present", "absent", "late", "excused"].includes(item.status)
      ).length;

    const commitment =
      students.length > 0 ? Math.round((registeredToday / students.length) * 100) : 0;

    return {
      totalStudents: students.length,
      present: todayRecords.filter((item) => item.status === "present").length,
      absent: todayRecords.filter((item) => item.status === "absent").length,
      late: todayRecords.filter((item) => item.status === "late").length,
      excused: todayRecords.filter((item) => item.status === "excused").length,
      pendingExcuses: excuses.filter((item) => item.status === "pending").length,
      submittedLessons: new Set(todayRecords.map((item) => item.lesson)).size,
      commitment,
    };
  }, [attendance, excuses, students]);

  if (!session) return null;

  const role = session.role;
  const visibleNav = navItems.filter((item) =>
    (allowedLinks[role] ?? allowedLinks.student).includes(item.key)
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>📘</div>
          <div>
            <div style={styles.brandTitle}>تحضير الطلاب الذكي</div>
            <div style={styles.brandSub}>ثانوية الأمير عبدالمجيد بن عبدالعزيز</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {visibleNav.map((item) => (
            <NavItem
              key={item.key}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={item.key === "dashboard"}
            />
          ))}
        </nav>
      </aside>

      <section style={styles.content}>
        <header style={styles.header}>
          <div>
            <p style={styles.welcome}>مرحبًا، {session.full_name}</p>
            <h1 style={styles.title}>لوحة التحكم</h1>
            <p style={styles.subtitle}>
              لوحة موحدة تعرض بيانات حقيقية من Supabase حسب صلاحية المستخدم.
            </p>
          </div>

          <div style={styles.userBox}>
            <span style={styles.roleBadge}>{roleLabel[role] ?? role}</span>
            <button onClick={handleLogout} style={styles.logoutButton}>
              تسجيل الخروج
            </button>
          </div>
        </header>

        <section style={styles.kpiGrid}>
          <KpiCard title="إجمالي الطلاب" value={stats.totalStudents} icon="🎓" color="#2563eb" />
          <KpiCard title="الحاضرون اليوم" value={stats.present} icon="✅" color="#16a34a" />
          <KpiCard title="الغائبون اليوم" value={stats.absent} icon="🚫" color="#dc2626" />
          <KpiCard title="المتأخرون اليوم" value={stats.late} icon="⏱️" color="#f59e0b" />
          <KpiCard title="المستأذنون اليوم" value={stats.excused} icon="🟦" color="#3b82f6" />
          <KpiCard title="استئذانات معلقة" value={stats.pendingExcuses} icon="📩" color="#7c3aed" />
        </section>

        <section style={styles.mainGrid}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.sectionTitle}>العمليات المصرح بها</h2>
              <span style={styles.smallHint}>{roleLabel[role] ?? role}</span>
            </div>

            <div style={styles.quickGrid}>
              {visibleNav
                .filter((item) => item.key !== "dashboard")
                .slice(0, 10)
                .map((item) => (
                  <QuickAction
                    key={item.key}
                    href={item.href}
                    icon={item.icon}
                    title={item.label}
                    desc="فتح الصفحة"
                    color="#2563eb"
                  />
                ))}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.sectionTitle}>مؤشر اليوم</h2>
              <span style={styles.smallHint}>
                {loading ? "تحميل..." : `الحصص المرفوعة: ${stats.submittedLessons}`}
              </span>
            </div>

            <div style={styles.progressWrap}>
              <div style={styles.progressText}>
                <span>نسبة التحضير اليوم</span>
                <strong>{stats.commitment}%</strong>
              </div>

              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${Math.min(100, stats.commitment)}%` }} />
              </div>
            </div>

            <div style={styles.noticeBox}>
              <strong>حالة الربط</strong>
              <p style={styles.noticeText}>
                تم ربط لوحة التحكم مع الجلسة، الصلاحيات، Supabase، وسجل الخروج الحقيقي. الصفحات تظهر حسب دور المستخدم.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: string; label: string; active?: boolean }) {
  return (
    <Link href={href} style={active ? styles.navItemActive : styles.navItem}>
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function KpiCard({ title, value, icon, color }: { title: string; value: number; icon: string; color: string }) {
  return (
    <div style={styles.kpiCard}>
      <div style={{ ...styles.kpiIcon, background: `${color}18`, color }}>{icon}</div>
      <div>
        <div style={styles.kpiValue}>{value}</div>
        <div style={styles.kpiTitle}>{title}</div>
      </div>
    </div>
  );
}

function QuickAction({ href, icon, title, desc, color }: { href: string; icon: string; title: string; desc: string; color: string }) {
  return (
    <Link href={href} style={styles.quickAction}>
      <div style={{ ...styles.quickIcon, background: `${color}18`, color }}>{icon}</div>
      <div>
        <h3 style={styles.quickTitle}>{title}</h3>
        <p style={styles.quickDesc}>{desc}</p>
      </div>
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    direction: "rtl",
    background: "#f4f7fb",
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    fontFamily: "Tahoma, Arial, sans-serif",
    color: "#0f172a",
  },
  sidebar: {
    background: "linear-gradient(180deg, #0f766e 0%, #1d4ed8 100%)",
    color: "#fff",
    padding: 22,
    minHeight: "100vh",
  },
  brand: { display: "flex", gap: 12, alignItems: "center", marginBottom: 28 },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    background: "rgba(255,255,255,0.16)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
  },
  brandTitle: { fontSize: 17, fontWeight: 800 },
  brandSub: { fontSize: 12, opacity: 0.82, marginTop: 4 },
  nav: { display: "flex", flexDirection: "column", gap: 10 },
  navItem: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "13px 14px",
    borderRadius: 14,
    color: "#eef2ff",
    textDecoration: "none",
    fontWeight: 700,
  },
  navItemActive: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    padding: "13px 14px",
    borderRadius: 14,
    color: "#0f172a",
    background: "#fff",
    textDecoration: "none",
    fontWeight: 800,
  },
  content: { padding: 28 },
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 22 },
  welcome: { margin: 0, color: "#64748b", fontSize: 14 },
  title: { margin: "6px 0 0", fontSize: 32, fontWeight: 900 },
  subtitle: { margin: "8px 0 0", color: "#64748b", fontSize: 14 },
  userBox: { display: "flex", gap: 10, alignItems: "center" },
  roleBadge: { background: "#e0f2fe", color: "#0369a1", padding: "9px 12px", borderRadius: 999, fontWeight: 800, fontSize: 13 },
  logoutButton: { border: "none", background: "#0f172a", color: "#fff", borderRadius: 12, padding: "10px 14px", cursor: "pointer", fontWeight: 800 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 18 },
  kpiCard: { background: "#fff", borderRadius: 20, padding: 18, display: "flex", gap: 14, alignItems: "center", boxShadow: "0 12px 30px rgba(15, 23, 42, 0.07)", border: "1px solid #e5e7eb" },
  kpiIcon: { width: 48, height: 48, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 },
  kpiValue: { fontSize: 28, fontWeight: 900 },
  kpiTitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  mainGrid: { display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18 },
  card: { background: "#fff", borderRadius: 22, padding: 20, boxShadow: "0 12px 30px rgba(15, 23, 42, 0.07)", border: "1px solid #e5e7eb" },
  cardHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 },
  sectionTitle: { margin: 0, fontSize: 20, fontWeight: 900 },
  smallHint: { fontSize: 12, color: "#64748b" },
  quickGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 },
  quickAction: { display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: "#0f172a", border: "1px solid #e5e7eb", borderRadius: 18, padding: 14, background: "#fbfdff" },
  quickIcon: { width: 46, height: 46, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 },
  quickTitle: { margin: 0, fontSize: 15, fontWeight: 900 },
  quickDesc: { margin: "5px 0 0", fontSize: 12, color: "#64748b" },
  progressWrap: { marginTop: 8 },
  progressText: { display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 },
  progressBar: { height: 12, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #0f766e, #2563eb)", borderRadius: 999 },
  noticeBox: { marginTop: 18, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 16, padding: 14, color: "#92400e" },
  noticeText: { margin: "6px 0 0", fontSize: 13, lineHeight: 1.8 },
};
