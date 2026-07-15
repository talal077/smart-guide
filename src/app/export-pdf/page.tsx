"use client";

import Link from "next/link";

export default function ExportPdfPage(){
  return (
    <main style={{minHeight:"100vh",background:"#f4f7fb",direction:"rtl",padding:24,fontFamily:"Tahoma"}}>
      <div style={{maxWidth:900,margin:"auto",background:"#fff",padding:24,borderRadius:18}}>
        <h1>تصدير PDF</h1>
        <p>هذه الصفحة جاهزة لربط إنشاء ملفات PDF الاحترافية.</p>

        <button
          onClick={()=>window.print()}
          style={{
            padding:"12px 20px",
            border:"none",
            borderRadius:12,
            background:"#dc2626",
            color:"#fff",
            fontWeight:"bold",
            cursor:"pointer"
          }}
        >
          إنشاء PDF
        </button>

        <div style={{marginTop:30}}>
          <Link href="/dashboard">العودة إلى لوحة التحكم</Link>
        </div>
      </div>
    </main>
  );
}
