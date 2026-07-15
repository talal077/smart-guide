import Link from "next/link";
import { DatabaseBackup, ExternalLink, ShieldCheck } from "lucide-react";

// This page previously had two buttons ("إنشاء نسخة احتياطية" / "استعادة نسخة")
// with no onClick handlers at all — pure UI theater that did nothing when
// clicked. No real backup/restore service exists in this codebase (no
// Supabase Management API credentials, no server-side backup job), and
// building one is a separate infrastructure project, not a Settings-page fix.
// Rather than fabricate another non-functional button, this page now states
// the real, current backup story: Supabase manages project-level backups
// automatically, restorable from the Supabase dashboard by someone with
// project access — not from inside this app.
export default function BackupPage() {
  return (
    <div className="space-y-4 p-4 pb-10" dir="rtl">
      <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <p className="flex items-center gap-2 text-sm font-bold text-blue-700">
          <DatabaseBackup size={16} /> النسخ الاحتياطي
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">النسخ الاحتياطي والاستعادة</h1>
      </header>

      <section className="rounded-3xl bg-amber-50 border border-amber-100 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck size={22} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <h2 className="font-bold text-amber-900">لا توجد خدمة نسخ احتياطي داخل التطبيق حاليًا</h2>
            <p className="mt-2 text-sm text-amber-800">
              بيانات النظام مخزَّنة في مشروع Supabase، وتُدار النسخ الاحتياطية على مستوى المشروع تلقائيًا من لوحة تحكم
              Supabase نفسها — وليس من داخل هذا التطبيق. لا يوجد حاليًا مفتاح أو خدمة آمنة لإنشاء أو استعادة نسخة من
              المتصفح، ولذلك لا تعرض هذه الصفحة زرًا لا يقوم بأي عملية فعلية.
            </p>
            <p className="mt-3 text-sm font-bold text-amber-900">
              للاطلاع على النسخ الاحتياطية أو استعادة إحداها، يلزم الدخول إلى لوحة تحكم Supabase مباشرة بصلاحية مسؤول
              المشروع.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700"
        >
          <ExternalLink size={16} /> الرجوع إلى الإعدادات
        </Link>
      </section>
    </div>
  );
}
