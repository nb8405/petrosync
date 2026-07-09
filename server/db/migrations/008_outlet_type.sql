-- Adds the retail outlet format (KSK / Regular RO / COCO / CODO / DODO) captured
-- during onboarding. Nullable so existing workspaces remain valid.
ALTER TABLE pump_workspaces
  ADD COLUMN IF NOT EXISTS outlet_type TEXT;
