"use client";
import Link from "next/link";

export default function TeachersPage(){
 const rows=[
  {n:"أحمد محمد",s:"الرياضيات",c:"3/أ",st:"مكتمل"},
  {n:"خالد علي",s:"الفيزياء",c:"2/ب",st:"بانتظار الرفع"},
 ];
 return(
 <main style={{padding:24,direction:"rtl",fontFamily:"Tahoma",background:"#f4f7fb",minHeight:"100vh"}}>
 <div style={{maxWidth:1100,margin:"auto"}}>
 <div style={{display:"flex",justifyContent:"space-between"}}>
 <h1>إدارة المعلمين</h1><Link href="/dashboard">العودة</Link>
 </div>
 <table style={{width:"100%",background:"#fff",borderCollapse:"collapse",marginTop:20}}>
 <thead><tr><th>المعلم</th><th>المادة</th><th>الشعبة</th><th>الحالة</th></tr></thead>
 <tbody>
 {rows.map((r,i)=><tr key={i}>
 <td style={td}>{r.n}</td><td style={td}>{r.s}</td><td style={td}>{r.c}</td><td style={td}>{r.st}</td>
 </tr>)}
 </tbody></table>
 </div></main>);
}
const td={padding:"12px",borderBottom:"1px solid #e5e7eb",textAlign:"center"} as const;
