"use client";

import Link from "next/link";

export default function AboutPage() {
  return (
    <main
      style={{
        padding: 24,
        direction: "rtl",
        fontFamily: "Tahoma",
        background: "#f4f7fb",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "#fff",
          padding: 24,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
        }}
      >
        <h1>حول النظام</h1>

        <p>
          <strong>اسم النظام:</strong> تحضير الطلاب الذكي
        </p>

        <p>
          <strong>الإصدار:</strong> 1.0.0
        </p>

        <p>
          <strong>المدرسة:</strong> ثانوية الأمير عبدالمجيد بن عبدالعزيز
        </p>

        <p>
          <strong>الإدارة التعليمية:</strong> إدارة تعليم المدينة المنورة
        </p>

        <p>
          نظام متكامل لإدارة حضور الطلاب، الغياب، التقارير، الإشعارات،
          الإجراءات، ولوحات التحكم الخاصة بالمعلمين والوكلاء والإداريين.
        </p>

        <div style={{ marginTop: 30 }}>
          <Link href="/dashboard">العودة إلى لوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}