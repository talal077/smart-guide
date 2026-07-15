"use client";
import Link from "next/link";
export default function UsersPage(){
const users=[{name:"طلال الصاعدي",role:"إداري",active:"نشط"},{name:"أحمد علي",role:"معلم",active:"نشط"}];
return <main style={{padding:24,direction:"rtl",fontFamily:"Tahoma",background:"#f4f7fb",minHeight:"100vh"}}>
<div style={{maxWidth:900,margin:"auto"}}>
<div style={{display:"flex",justifyContent:"space-between"}}><h1>إدارة المستخدمين</h1><Link href="/dashboard">العودة</Link></div>
<table style={{width:"100%",background:"#fff",borderCollapse:"collapse",marginTop:16}}>
<thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th></tr></thead>
<tbody>{users.map((u,i)=><tr key={i}><td style={td}>{u.name}</td><td style={td}>{u.role}</td><td style={td}>{u.active}</td></tr>)}</tbody>
</table></div></main>}
const td={padding:"12px",borderBottom:"1px solid #ddd",textAlign:"center"} as const;
