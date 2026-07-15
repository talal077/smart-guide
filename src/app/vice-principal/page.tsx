"use client";

import Link from "next/link";

export default function VicePrincipalPage(){
  const cards=[
    ["الطلاب","إدارة بيانات الطلاب"],
    ["المعلمون","متابعة التحضير"],
    ["التقارير","تقارير يومية"],
    ["التنبيهات","متابعة المتأخرين"],
  ];
  return (
    <main style={{padding:24,direction:"rtl",background:"#f3f6fb",minHeight:"100vh",fontFamily:"Tahoma"}}>
      <div style={{maxWidth:1100,margin:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h1>لوحة الوكيل</h1>
          <Link href="/dashboard">العودة</Link>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>
          {cards.map(c=>(
            <div key={c[0]} style={{background:"#fff",padding:20,borderRadius:16,boxShadow:"0 2px 8px #0001"}}>
              <h3>{c[0]}</h3>
              <p>{c[1]}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
