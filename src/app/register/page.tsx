"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/auth";

const roleOptions: Array<{ key: AppRole; label: string; hint: string }> = [
  { key: "teacher", label: "معلم", hint: "مادة وشعبة" },
  { key: "vice_principal", label: "وكيل", hint: "صلاحيات متابعة" },
  { key: "admin", label: "إداري", hint: "إدارة النظام" },
  { key: "student", label: "طالب", hint: "رمز دخول" },
];

export default function RegisterPage() {
  const router = useRouter();

  const [role, setRole] = useState<AppRole>("teacher");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    subject: "",
    section: "",
    grade: "",
    entryCode: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name.trim()) {
      setError("يرجى إدخال الاسم.");
      setSaving(false);
      return;
    }

    if (!form.email.trim()) {
      setError("يرجى إدخال البريد الإلكتروني.");
      setSaving(false);
      return;
    }

    if (!form.password.trim() || !form.confirmPassword.trim()) {
      setError("يرجى إدخال كلمة المرور وتأكيدها.");
      setSaving(false);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      setSaving(false);
      return;
    }

    if (role === "teacher") {
      if (!form.subject.trim() || !form.section.trim()) {
        setError("يرجى إدخال المادة والشعبة للمعلم.");
        setSaving(false);
        return;
      }
    }

    if (role === "student") {
      if (!form.grade.trim() || !form.section.trim() || !form.entryCode.trim()) {
        setError("يرجى إدخال الصف والشعبة ورمز الدخول للطالب.");
        setSaving(false);
        return;
      }
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password.trim(),
      options: {
        data: {
          full_name: form.name.trim(),
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setSaving(false);
      return;
    }

    if (!data?.user?.id) {
      setError("تعذر إنشاء حساب المستخدم. حاول مرة أخرى.");
      setSaving(false);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        full_name: form.name.trim(),
        role,
        email: form.email.trim(),
        subject: form.subject.trim() || null,
        section: form.section.trim() || null,
        grade: form.grade.trim() || null,
        entry_code: form.entryCode.trim() || null,
        is_active: true,
        is_blocked: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (profileError) {
      setError(profileError.message || "حدث خطأ أثناء حفظ ملف المستخدم.");
      setSaving(false);
      return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password.trim(),
    });

    if (loginError) {
      setSaving(false);
      setError(loginError.message || "تم إنشاء الحساب، ولكن لم نتمكن من تسجيل الدخول تلقائيًا.");
      return;
    }

    setSaving(false);
    router.push("/dashboard");
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <header style={styles.header}>
          <div style={styles.logo}>🎓</div>
          <div>
            <p style={styles.schoolTop}>إدارة تعليم المدينة المنورة</p>
            <h1 style={styles.title}>إنشاء حساب جديد</h1>
            <p style={styles.subtitle}>نظام تحضير الطلاب الذكي</p>
          </div>
        </header>

        <div style={styles.roleGrid}>
          {roleOptions.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setRole(item.key);
                setError("");
              }}
              style={{
                ...styles.roleButton,
                ...(role === item.key ? styles.roleButtonActive : {}),
              }}
            >
              <b>{item.label}</b>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>

        <form onSubmit={submitRegister} style={styles.form}>
          <div>
            <label style={styles.label}>الاسم</label>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="أدخل الاسم كاملًا"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>البريد الإلكتروني</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="example@email.com"
              style={styles.input}
            />
          </div>

          {role === "teacher" ? (
            <>
              <div>
                <label style={styles.label}>مادة التدريس</label>
                <input
                  value={form.subject}
                  onChange={(event) => updateField("subject", event.target.value)}
                  placeholder="مثال: اللغة العربية"
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>الشعبة المسندة</label>
                <input
                  value={form.section}
                  onChange={(event) => updateField("section", event.target.value)}
                  placeholder="مثال: 1/أ"
                  style={styles.input}
                />
              </div>
            </>
          ) : null}

          {role === "student" ? (
            <>
              <div>
                <label style={styles.label}>الصف</label>
                <input
                  value={form.grade}
                  onChange={(event) => updateField("grade", event.target.value)}
                  placeholder="مثال: الأول الثانوي"
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>الشعبة</label>
                <input
                  value={form.section}
                  onChange={(event) => updateField("section", event.target.value)}
                  placeholder="مثال: أ"
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>رمز الدخول</label>
                <input
                  value={form.entryCode}
                  onChange={(event) => updateField("entryCode", event.target.value)}
                  placeholder="رمز الطالب"
                  style={styles.input}
                />
              </div>
            </>
          ) : null}

          <div>
            <label style={styles.label}>كلمة المرور</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="أدخل كلمة المرور"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>تأكيد كلمة المرور</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
              placeholder="أعد كتابة كلمة المرور"
              style={styles.input}
            />
          </div>

          {error ? <p style={styles.error}>{error}</p> : null}

          <button type="submit" disabled={saving} style={styles.submit}>
            {saving ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
          </button>
        </form>

        <div style={styles.footer}>
          <span>لديك حساب؟</span>
          <Link href="/login" style={styles.loginLink}>
            تسجيل الدخول
          </Link>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "#f4f7fb",
  },
  card: {
    width: "100%",
    maxWidth: 560,
    background: "#fff",
    borderRadius: 24,
    padding: 32,
    boxShadow: "0 20px 60px rgba(15, 23, 42, 0.12)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    marginBottom: 28,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    background: "#dbeafe",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
  },
  schoolTop: { margin: 0, fontSize: 14, color: "#0f172a", opacity: 0.7 },
  title: { margin: "8px 0 0", fontSize: 28, fontWeight: 800 },
  subtitle: { margin: "6px 0 0", color: "#475569", fontSize: 14 },
  roleGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 24 },
  roleButton: {
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    padding: 16,
    textAlign: "left",
    cursor: "pointer",
  },
  roleButtonActive: {
    background: "#2563eb",
    borderColor: "#1d4ed8",
    color: "#fff",
  },
  form: { display: "grid", gap: 18 },
  label: { display: "block", marginBottom: 8, fontWeight: 700, color: "#0f172a" },
  input: {
    width: "100%",
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    padding: "14px 16px",
    fontSize: 15,
    outline: "none",
  },
  submit: {
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  error: { color: "#b91c1c", fontWeight: 700, margin: 0 },
  footer: { marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" },
  loginLink: { color: "#2563eb", fontWeight: 700 },
};
