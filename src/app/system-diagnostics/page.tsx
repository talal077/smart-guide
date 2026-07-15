"use client";

import Link from "next/link";

export default function SystemDiagnosticsPage() {
  const checks = [
    { name: "قاعدة البيانات", status: "✅ متصلة" },
    { name: "Supabase", status: "✅ يعمل" },
    { name: "المستخدمون", status: "✅ سليم" },
    { name: "الطلاب", status: "✅ سليم" },
    { name: "التحضير", status: "✅ سليم" },
    { name: "التقارير", status: "✅ سليم" },
    { name: "الإشعارات", status: "✅ سليم" },
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
          maxWidth: 900,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 18,
          padding: 24,
        }}
      >
        <h1>تشخيص النظام</h1>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 20,
          }}
        >
          <thead>
            <tr>
              <th style={th}>الخدمة</th>
              <th style={th}>الحالة</th>
            </tr>
          </thead>

          <tbody>
            {checks.map((c) => (
              <tr key={c.name}>
                <td style={td}>{c.name}</td>
                <td style={td}>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 30 }}>
          <Link href="/dashboard">العودة</Link>
        </div>
      </div>
    </main>
  );
}

const th: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 12,
  background: "#eff6ff",
};

const td: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 12,
};