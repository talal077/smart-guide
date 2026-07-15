import Link from "next/link";

export default function LateStudentsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7f5",
        direction: "rtl",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 16, color: "#0f172a" }}>
          الطلاب المتأخرون
        </h1>
        <p style={{ marginBottom: 24, color: "#52606d" }}>
          صفحة تجريبية لمتابعة الطلاب المتأخرين.
        </p>
        <Link href="/dashboard" style={{ color: "#0f766e", textDecoration: "underline" }}>
          العودة إلى لوحة التحكم
        </Link>
      </div>
    </main>
  );
}
