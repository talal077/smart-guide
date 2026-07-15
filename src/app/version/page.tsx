"use client";

import Link from "next/link";

export default function VersionPage() {
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
        <h1>معلومات الإصدار</h1>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 20,
          }}
        >
          <tbody>
            <tr>
              <td style={td}>اسم النظام</td>
              <td style={td}>تحضير الطلاب الذكي</td>
            </tr>

            <tr>
              <td style={td}>الإصدار</td>
              <td style={td}>1.0.0</td>
            </tr>

            <tr>
              <td style={td}>قاعدة البيانات</td>
              <td style={td}>Supabase</td>
            </tr>

            <tr>
              <td style={td}>الإطار</td>
              <td style={td}>Next.js</td>
            </tr>

            <tr>
              <td style={td}>آخر تحديث</td>
              <td style={td}>2026</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 30 }}>
          <Link href="/dashboard">
            العودة إلى لوحة التحكم
          </Link>
        </div>
      </div>
    </main>
  );
}

const td: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: 12,
};