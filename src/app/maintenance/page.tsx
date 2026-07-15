"use client";

import Link from "next/link";

export default function MaintenancePage() {
  const tools = [
    "تنظيف البيانات المؤقتة",
    "إعادة بناء الفهارس",
    "إعادة مزامنة قاعدة البيانات",
    "فحص سلامة الجداول",
    "نسخة احتياطية فورية",
    "استعادة النسخة الاحتياطية",
  ];

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
          maxWidth: 950,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 18,
          padding: 24,
        }}
      >
        <h1>مركز الصيانة</h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
            gap: 16,
            marginTop: 25,
          }}
        >
          {tools.map((tool) => (
            <button
              key={tool}
              style={{
                padding: 18,
                borderRadius: 14,
                border: "1px solid #ddd",
                background: "#2563eb",
                color: "#fff",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              {tool}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 35 }}>
          <Link href="/dashboard">العودة إلى لوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}