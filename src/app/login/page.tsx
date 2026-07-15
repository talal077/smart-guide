"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, GraduationCap, LockKeyhole, LogIn, Mail, Phone, School, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/auth";

type Role = AppRole;

const roles: { key: Role; label: string }[] = [
  { key: "principal", label: "مدير" },
  { key: "teacher", label: "معلم" },
  { key: "vice_principal", label: "وكيل" },
  { key: "admin", label: "إداري" },
  { key: "student", label: "طالب" },
];

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("principal");
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleRegister() {
    setMessage("");

    if (!fullName.trim()) return setMessage("أدخل الاسم الكامل.");
    if (!email.trim()) return setMessage("أدخل البريد الإلكتروني.");
    if (password.length < 6) return setMessage("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        },
      },
    });

    if (error) {
      setLoading(false);
      return setMessage(error.message);
    }

    if (data?.user) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          full_name: fullName.trim(),
          role,
          phone: phone.trim() || null,
          is_active: true,
          is_blocked: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (profileError) {
        console.error(profileError);
        setLoading(false);
        return setMessage("تم إنشاء الحساب، لكن حدث خطأ في حفظ ملف المستخدم. حاول تسجيل الدخول.");
      }
    }

    setLoading(false);
    setMessage("تم إنشاء الحساب بنجاح. اضغط دخول الآن.");
    setIsRegister(false);
  }

  async function handleLogin() {
    setMessage("");

    if (!email.trim()) return setMessage("أدخل البريد الإلكتروني.");
    if (!password.trim()) return setMessage("أدخل كلمة المرور.");

    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password, selectedRole: role }),
    });

    const result = await response.json();
    setLoading(false);

    if (!response.ok || !result.success) {
      return setMessage(result.message || "خطأ في تسجيل الدخول.");
    }

    router.replace("/dashboard");
  }

  return (
    <main dir="rtl" className="fixed inset-0 z-[9999] overflow-auto bg-slate-100">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] bg-white shadow-2xl lg:grid-cols-2">
          <section className="hidden bg-gradient-to-br from-blue-900 via-blue-800 to-blue-600 p-8 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15"><School size={34} /></div>
              <p className="text-sm font-bold text-blue-100">إدارة تعليم المدينة المنورة</p>
              <h1 className="mt-3 text-4xl font-black">تحضير الطلاب الذكي</h1>
              <p className="mt-4 text-sm leading-7 text-blue-100">نظام موحد لإدارة التحضير، الغياب، الأعذار، إجراءات الطلاب، التقارير والتنبيهات.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["تحضير سريع", "حصر مباشر", "تقارير فورية", "صلاحيات متعددة"].map((item) => (
                <div key={item} className="rounded-2xl bg-white/10 p-4"><p className="font-bold">{item}</p></div>
              ))}
            </div>
          </section>

          <section className="p-6 sm:p-8">
            <div className="mx-auto max-w-md">
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-700"><GraduationCap size={34} /></div>
                <p className="text-sm font-black text-blue-700">ثانوية الأمير عبدالمجيد بن عبدالعزيز</p>
                <h2 className="mt-1 text-2xl font-black text-slate-900">{isRegister ? "تسجيل أول دخول" : "تسجيل الدخول"}</h2>
              </div>

              <div className="grid grid-cols-5 gap-2 rounded-2xl bg-slate-100 p-2">
                {roles.map((item) => (
                  <button key={item.key} type="button" onClick={() => { setRole(item.key); setMessage(""); }} className={`rounded-xl px-2 py-3 text-xs font-black transition ${role === item.key ? "bg-blue-700 text-white" : "bg-white text-slate-700"}`}>
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                {isRegister && (
                  <>
                    <Input label="الاسم الكامل" icon={<UserRound size={18} />} value={fullName} onChange={setFullName} placeholder="أدخل الاسم الكامل" />
                    <Input label="رقم الجوال" icon={<Phone size={18} />} value={phone} onChange={setPhone} placeholder="اختياري" />
                  </>
                )}

                <Input label="البريد الإلكتروني" icon={<Mail size={18} />} value={email} onChange={setEmail} placeholder="example@email.com" type="email" />

                <div>
                  <label className="mb-2 block text-sm font-black text-slate-700">كلمة المرور</label>
                  <div className="relative">
                    <LockKeyhole size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} placeholder="أدخل كلمة المرور" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-11 pl-12 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>

                {message && <div className="rounded-2xl bg-yellow-50 px-4 py-3 text-sm font-bold text-yellow-800">{message}</div>}

                <button type="button" onClick={isRegister ? handleRegister : handleLogin} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60">
                  <LogIn size={18} /> {loading ? "جاري المعالجة..." : isRegister ? "إنشاء الحساب" : "دخول"}
                </button>

                <button type="button" onClick={() => { setIsRegister(!isRegister); setMessage(""); }} className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">
                  {isRegister ? "لدي حساب بالفعل" : "تسجيل أول دخول"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Input({ label, icon, value, onChange, placeholder, type = "text" }: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-black text-slate-700">{label}</label>
      <div className="relative">
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
        <input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-11 pl-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      </div>
    </div>
  );
}
