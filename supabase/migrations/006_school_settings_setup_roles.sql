-- Widen who may complete the first-run setup wizard to include vice_principal
-- (matches /setup page access rules), while tightening later edits from the
-- Settings page to admin only, per the "لا تسمح بإعادة تشغيل الإعداد إلا لاحقًا
-- من صفحة الإعدادات بواسطة admin فقط" requirement.

DROP POLICY IF EXISTS school_settings_insert_managers ON public.school_settings;
CREATE POLICY school_settings_insert_managers ON public.school_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
    )
  );

DROP POLICY IF EXISTS school_settings_update_managers ON public.school_settings;
CREATE POLICY school_settings_update_managers ON public.school_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
