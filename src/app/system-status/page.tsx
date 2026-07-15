"use client";
import Link from "next/link";

export default function SystemStatusPage(){
const items=[
["قاعدة البيانات","متصلة"],
["Supabase","يعمل"],
["عدد المستخدمين","--"],
["آخر مزامنة","الآن"],
];
return(
<main style={{padding:24,direction:"rtl",fontFamily:"Tahoma",background:"#f4f7fb",minHeight:"100vh"}}>
<div style={{maxWidth:900,margin:"auto"}}>
<div style={{display:"flex",justifyContent:"space-between"}}>
<h1>حالة النظام</h1>
<Link href="/dashboard">العودة</Link>
</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginTop:20}}>
{items.map((i,n)=><div key={n} style={{background:"#fff",padding:20,borderRadius:16,border:"1px solid #e5e7eb"}}>
<h2 style={{margin:0,color:"#2563eb"}}>{i[1]}</h2>
<p>{i[0]}</p>
</div>)}
</div>
</div>
</main>
)}
