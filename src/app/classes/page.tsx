"use client";
import Link from "next/link";

export default function ClassesPage(){
 const rows=[
  {grade:"الأول الثانوي",section:"أ",students:32,teacher:"أ. أحمد"},
  {grade:"الأول الثانوي",section:"ب",students:30,teacher:"أ. خالد"},
  {grade:"الثاني الثانوي",section:"أ",students:28,teacher:"أ. محمد"},
 ];
 return(
 <main style={{padding:24,direction:"rtl",fontFamily:"Tahoma",background:"#f4f7fb",minHeight:"100vh"}}>
 <div style={{maxWidth:1000,margin:"auto"}}>
 <div style={{display:"flex",justifyContent:"space-between"}}>
 <h1>الشعب الدراسية</h1><Link href="/dashboard">العودة</Link>
 </div>
 <table style={{width:"100%",background:"#fff",borderCollapse:"collapse",marginTop:20}}>
 <thead><tr><th>الصف</th><th>الشعبة</th><th>عدد الطلاب</th><th>المعلم المسؤول</th></tr></thead>
 <tbody>{rows.map((r,i)=><tr key={i}><td style={td}>{r.grade}</td><td style={td}>{r.section}</td><td style={td}>{r.students}</td><td style={td}>{r.teacher}</td></tr>)}</tbody>
 </table>
 </div></main>);
}
const td={padding:"12px",borderBottom:"1px solid #e5e7eb",textAlign:"center"} as const;
