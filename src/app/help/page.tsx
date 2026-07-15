"use client";

import Link from "next/link";

export default function HelpPage() {
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
        <h1>المساعدة والدعم</h1>

        <div style={{ marginTop: 20 }}>
          <h3>الأسئلة الشائعة</h3>

          <p>• كيف أسجل حضور الطلاب؟</p>
          <p>• كيف أعدل الغياب؟</p>
          <p>• كيف أستورد الطلاب من نور؟</p>
          <p>• كيف أستخرج تقرير PDF أو Excel؟</p>
          <p>• كيف أنشئ حسابًا جديدًا؟</p>
        </div>

        <div style={{ marginTop: 30 }}>
          <h3>الدعم الفني</h3>

          <p>البريد الإلكتروني:</p>
          <p>support@school.local</p>

          <p style={{ marginTop: 15 }}>
            ساعات الدعم:
            <br />
            الأحد - الخميس
            <br />
            7:30 صباحًا - 2:30 ظهرًا
          </p>
        </div>

        <div style={{ marginTop: 30 }}>
          <Link href="/dashboard">
            العودة إلى لوحة التحكم
          </Link>
        </div>
      </div>
    </main>
  );
}