export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7f5",
        direction: "rtl",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Tahoma",
      }}
    >
      <div
        style={{
          width: "420px",
          background: "#ffffff",
          borderRadius: "24px",
          padding: "40px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            margin: "0 auto 20px",
            borderRadius: "20px",
            background: "#0f766e",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "#fff",
            fontSize: "34px",
          }}
        >
          🎓
        </div>

        <h1
          style={{
            color: "#0f766e",
            marginBottom: "10px",
          }}
        >
          نظام توجيه ذكي
        </h1>

        <p
          style={{
            color: "#666",
            marginBottom: "30px",
          }}
        >
          منصة الموجه الطلابي الذكية
        </p>

        <input
          type="text"
          placeholder="رقم الجوال"
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "12px",
            borderRadius: "12px",
            border: "1px solid #ddd",
          }}
        />

        <input
          type="text"
          placeholder="رمز التحقق"
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "20px",
            borderRadius: "12px",
            border: "1px solid #ddd",
          }}
        />

        <button
          style={{
            width: "100%",
            padding: "14px",
            border: "none",
            borderRadius: "12px",
            background: "#0f766e",
            color: "#fff",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          تسجيل الدخول
        </button>
      </div>
    </main>
  );
}