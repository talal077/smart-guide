"use client";
import Link from "next/link";
export default function StudentDashboardPage(){
const cards=[["حضوري اليوم","حاضر"],["الغياب هذا الشهر","2"],["التأخر","1"],["الاستئذانات","0"]];
return <main style={{padding:24,direction:"rtl",fontFamily:"Tahoma",background:"#f4f7fb",minHeight:"100vh"}}><div style={{maxWidth:1000,margin:"auto"}}><div style={{display:"flex",justifyContent:"space-between"}}><h1>لوحة الطالب</h1><Link href="/dashboard">العودة</Link></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginTop:20}}>{cards.map((c,i)=><div key={i} style={{background:"#fff",padding:20,borderRadius:16,border:"1px solid #e5e7eb"}}><h2 style={{margin:0,color:"#2563eb"}}>{c[1]}</h2><p>{c[0]}</p></div>)}</div><div style={{background:"#fff",padding:20,borderRadius:16,marginTop:20}}><h2>آخر السجلات</h2><p>لا توجد ملاحظات جديدة.</p></div></div></main>}
