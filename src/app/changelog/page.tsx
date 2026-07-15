"use client";

import Link from "next/link";

const versions = [
  {
    version: "1.0.0",
    date: "2026",
    changes: [
      "إطلاق النسخة الأولى.",
      "ربط Supabase.",
      "نظام التحضير.",
      "إدارة الطلاب.",
      "التقارير.",
      "الإشعارات.",
      "إجراءات الطالب.",
    ],
  },
];

export default function ChangelogPage() {
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
        }}
      >
        <h1>سجل الإصدارات</h1>

        {versions.map((v) => (
          <div
            key={v.version}
            style={{
              marginTop: 20,
              padding: 20,
              border: "1px solid #e5e7eb",
              borderRadius: 14,
            }}
          >
            <h2>{v.version}</h2>
            <p>{v.date}</p>

            <ul>
              {v.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ))}

        <div style={{ marginTop: 30 }}>
          <Link href="/dashboard">
            العودة
          </Link>
        </div>
      </div>
    </main>
  );
}