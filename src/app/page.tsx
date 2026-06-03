export default function Home() {
  return (
    <main
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f5f7fa",
        direction: "rtl",
      }}
    >
      <div
        style={{
          textAlign: "center",
          background: "#ffffff",
          padding: "40px",
          borderRadius: "20px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
        }}
      >
        <h1
          style={{
            color: "#0f766e",
            fontSize: "40px",
            marginBottom: "10px",
          }}
        >
          الموجه الذكي
        </h1>

        <p
          style={{
            color: "#666",
            fontSize: "18px",
          }}
        >
          أول نسخة تعمل بنجاح 🚀
        </p>
      </div>
    </main>
  );
}