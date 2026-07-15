"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, type Role } from "@/lib/session";

export default function RoleGuard({allowed,children}:{allowed:Role[];children:React.ReactNode}){
 const router=useRouter();
 useEffect(()=>{
  const s=getSession();
  if(!s){router.replace("/login");return;}
  if(!allowed.includes(s.role)) router.replace("/dashboard");
 },[router,allowed]);
 return <>{children}</>;
}
