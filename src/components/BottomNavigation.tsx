export default function BottomNavigation() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: "430px",
        height: "70px",
        background: "#ffffff",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        zIndex: 999,
      }}
    >
      <div>الرئيسية</div>
      <div>الحضور</div>
      <div>التقارير</div>
      <div>حسابي</div>
    </div>
  );
}