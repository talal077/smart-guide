import Link from "next/link";

export default function Home() {
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
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 24,
          padding: "32px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            margin: "0 auto 20px",
            borderRadius: 20,
            background: "#0f766e",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "#fff",
            fontSize: 34,
          }}
        >
          🎓
        </div>

        <h1 style={{ color: "#0f766e", marginBottom: 10 }}>
          نظام توجيه ذكي
        </h1>

        <p style={{ color: "#666", marginBottom: 30 }}>
          منصة الموجه الطلابي الذكية
        </p>

        <input
          type="text"
          placeholder="رقم الجوال"
          style={{
            width: "100%",
            padding: 14,
            marginBottom: 12,
            borderRadius: 12,
            border: "1px solid #ddd",
            boxSizing: "border-box",
          }}
        />

        <input
          type="text"
          placeholder="رمز التحقق"
          style={{
            width: "100%",
            padding: 14,
            marginBottom: 20,
            borderRadius: 12,
            border: "1px solid #ddd",
            boxSizing: "border-box",
          }}
        />

        <button
          style={{
            width: "100%",
            padding: 14,
            border: "none",
            borderRadius: 12,
            background: "#0f766e",
            color: "#fff",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          تسجيل الدخول
        </button>

        <div style={{ marginTop: 20 }}>
          <Link
            href="/login"
            style={{ color: "#0f766e", textDecoration: "underline" }}
          >
            الذهاب إلى صفحة الدخول
          </Link>
        </div>
      </div>
    </main>
  );
}
