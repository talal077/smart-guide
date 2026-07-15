"use client";

import Link from "next/link";

export default function PrivacyPage() {
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
        <h1>سياسة الخصوصية</h1>

        <p>
          يلتزم نظام تحضير الطلاب الذكي بالمحافظة على خصوصية جميع بيانات
          المستخدمين وعدم مشاركتها مع أي جهة غير مخولة.
        </p>

        <h3>البيانات التي يتم حفظها</h3>

        <ul>
          <li>بيانات المستخدمين.</li>
          <li>بيانات الطلاب.</li>
          <li>سجلات الحضور والغياب.</li>
          <li>التقارير والإحصائيات.</li>
          <li>سجل العمليات.</li>
        </ul>

        <h3>الحماية</h3>

        <p>
          يتم حفظ البيانات داخل قاعدة بيانات Supabase مع صلاحيات وصول حسب دور
          المستخدم.
        </p>

        <div style={{ marginTop: 30 }}>
          <Link href="/dashboard">العودة إلى لوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}