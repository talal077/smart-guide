"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        direction: "rtl",
        fontFamily: "Tahoma",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 18,
          padding: 24,
          border: "1px solid #e5e7eb",
        }}
      >
        <h1>شروط الاستخدام</h1>

        <ul style={{ lineHeight: 2 }}>
          <li>يستخدم النظام للأغراض التعليمية فقط.</li>
          <li>يلتزم كل مستخدم بالحفاظ على بيانات الدخول الخاصة به.</li>
          <li>يمنع تعديل أو حذف البيانات دون صلاحية.</li>
          <li>تسجل جميع العمليات في سجل النظام.</li>
          <li>يحق لإدارة المدرسة إيقاف أي حساب مخالف.</li>
        </ul>

        <div style={{ marginTop: 30 }}>
          <Link href="/dashboard">
            العودة إلى لوحة التحكم
          </Link>
        </div>
      </div>
    </main>
  );
}