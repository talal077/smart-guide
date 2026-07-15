import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { parseWorkbookBuffer } from "@/lib/excel/parser";
import { validateStudents } from "@/lib/excel/validator";
import { buildImportPreview } from "@/lib/excel/preview";
import { persistStudentBatch } from "@/lib/excel/importer";
import type { ColumnMapping, ConflictMode, ExcelStudentRecord } from "@/lib/excel/types";

const ALLOWED_ROLES = ["principal", "admin", "vice_principal"];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

// Magic-byte signatures so a file is validated by its actual content, not
// just its extension: .xlsx is a zip (OOXML) container, legacy .xls is an
// OLE2/CFB container. CSV has no fixed signature (plain text), so it is only
// gated by extension + successful parse below.
const XLSX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const XLS_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function matchesSignature(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function getExtension(fileName: string) {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

async function authenticate(request: NextRequest) {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // no-op: this route does not need to persist auth cookie refreshes
      },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "يجب تسجيل الدخول." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, is_blocked")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!profile || profile.is_blocked || profile.is_active === false) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: "الحساب غير نشط أو محظور." }, { status: 401 }) };
  }

  if (!ALLOWED_ROLES.includes(String(profile.role))) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, message: "لا تملك صلاحية استيراد بيانات الطلاب." }, { status: 403 }),
    };
  }

  return { ok: true as const, supabase, viewer: { id: authData.user.id, name: profile.full_name ?? "", role: String(profile.role) } };
}

function parseMapping(raw: FormDataEntryValue | null): ColumnMapping | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as ColumnMapping;
  } catch {
    return undefined;
  }
}

function validateUploadedFile(file: File, buffer: Uint8Array): string | null {
  if (file.size === 0) return "الملف فارغ.";
  if (file.size > MAX_FILE_BYTES) return `حجم الملف كبير جدًا (${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت). الحد الأقصى 10 ميجابايت.`;

  const extension = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "صيغة الملف غير مدعومة. الصيغ المدعومة: xlsx, xls, csv.";
  }

  // Content-based check (not just the extension) for the two binary formats.
  // CSV is plain text so it has no signature to check here -- it is instead
  // validated by whether XLSX.read can actually parse it afterward.
  if (extension === ".xlsx" && !matchesSignature(buffer, XLSX_SIGNATURE)) {
    return "محتوى الملف لا يطابق صيغة xlsx الحقيقية.";
  }
  if (extension === ".xls" && !matchesSignature(buffer, XLS_SIGNATURE)) {
    return "محتوى الملف لا يطابق صيغة xls الحقيقية.";
  }

  return null;
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "import";

  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  if (mode === "preview") {
    try {
      const form = await request.formData();
      const file = form.get("file") as File | null;
      const mapping = parseMapping(form.get("mapping"));
      const fallbackGrade = form.get("grade")?.toString() || null;
      const fallbackSection = form.get("section")?.toString() || null;

      if (!file) {
        return NextResponse.json({ success: false, message: "لم يتم اختيار ملف." }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const fileError = validateUploadedFile(file, bytes);
      if (fileError) {
        return NextResponse.json({ success: false, message: fileError }, { status: 400 });
      }

      let parsed;
      try {
        parsed = await parseWorkbookBuffer(arrayBuffer, file.name, mapping, fallbackGrade, fallbackSection);
      } catch {
        return NextResponse.json({ success: false, message: "تعذّرت قراءة الملف. تأكد أنه ملف Excel/CSV صالح وغير تالف." }, { status: 400 });
      }

      const validation = validateStudents(parsed.records);
      const preview = buildImportPreview(
        parsed.records,
        validation,
        parsed.detectedMapping,
        parsed.requiresMapping,
        fallbackGrade ?? parsed.detectedGrade ?? null,
        fallbackSection ?? parsed.detectedSection ?? null,
        parsed.gradeCandidates,
        parsed.sectionCandidates,
        parsed.warnings,
        parsed.sheets.map((sheet) => sheet.sheetName),
        parsed.headers,
      );

      // Check which of the (non-duplicate) parsed records already exist in
      // Supabase by national_id, so the preview can show a real count before
      // any write happens -- not just discover it silently during import.
      const nationalIds = Array.from(new Set(validation.records.map((r) => r.national_id).filter((v): v is string => !!v)));
      let existingCount = 0;
      if (nationalIds.length) {
        const { data: existingRows } = await auth.supabase.from("students").select("national_id").in("national_id", nationalIds);
        existingCount = existingRows?.length ?? 0;
      }
      preview.existingCount = existingCount;

      return NextResponse.json({
        success: true,
        preview,
        students: preview.previewRows,
        total: preview.totalStudents,
        availableHeaders: preview.availableHeaders,
        requiresMapping: preview.requiresMapping,
        detectedMapping: preview.detectedMapping,
      });
    } catch (error) {
      return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
  }

  if (mode === "complete") {
    // Writes one audit_logs entry summarizing the whole import (never the
    // file itself), after the client has finished driving all batches. The
    // actual student writes were already fully validated server-side per
    // batch via the RPC in `import` mode below -- this call only records the
    // outcome, so trusting the client's aggregated counts here is safe.
    try {
      const body = await request.json();
      const fileName: string = typeof body.fileName === "string" ? body.fileName : "غير معروف";
      const summary = body.summary ?? {};

      await auth.supabase.from("audit_logs").insert({
        actor_id: auth.viewer.id,
        actor_name: auth.viewer.name,
        actor_role: auth.viewer.role,
        action: "استيراد بيانات نور",
        details: `الملف: ${fileName} — إضافة: ${summary.inserted ?? 0}، تحديث: ${summary.updated ?? 0}، تجاوز: ${summary.skipped ?? 0}، مرفوض: ${summary.rejected ?? 0}${
          summary.stopped ? ` — توقف الاستيراد قبل اكتماله: ${summary.stopReason ?? ""}` : ""
        }`,
        new_values: summary,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
  }

  try {
    const body = await request.json();
    const incoming: ExcelStudentRecord[] = Array.isArray(body.students) ? body.students : [];
    const conflictMode: ConflictMode = body.conflictMode === "ignore" ? "ignore" : "update";

    if (!incoming.length) {
      return NextResponse.json({ success: false, message: "لا يوجد طلاب في هذه الدفعة." }, { status: 400 });
    }

    const serviceClient = createServiceRoleClient();
    const result = await persistStudentBatch(incoming, conflictMode, serviceClient);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  }
}
