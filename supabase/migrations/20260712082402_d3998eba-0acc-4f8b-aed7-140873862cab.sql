-- Vault: shared org-wide data storage (files, notes, records)

-- 1) NOTES
CREATE TABLE public.vault_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_notes TO authenticated;
GRANT ALL ON public.vault_notes TO service_role;
ALTER TABLE public.vault_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_notes_read_approved" ON public.vault_notes FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "vault_notes_insert_approved" ON public.vault_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "vault_notes_update_own_or_admin" ON public.vault_notes FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "vault_notes_delete_own_or_admin" ON public.vault_notes FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_vault_notes_updated BEFORE UPDATE ON public.vault_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) RECORDS (flexible JSONB entries grouped by collection)
CREATE TABLE public.vault_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection text NOT NULL,
  title text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_records_collection_idx ON public.vault_records(collection);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_records TO authenticated;
GRANT ALL ON public.vault_records TO service_role;
ALTER TABLE public.vault_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_records_read_approved" ON public.vault_records FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "vault_records_insert_approved" ON public.vault_records FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "vault_records_update_own_or_admin" ON public.vault_records FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()) AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "vault_records_delete_own_or_admin" ON public.vault_records FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_vault_records_updated BEFORE UPDATE ON public.vault_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) FILES metadata (actual bytes live in the 'vault-files' storage bucket)
CREATE TABLE public.vault_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  file_size bigint NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_files_folder_idx ON public.vault_files(folder);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_files TO authenticated;
GRANT ALL ON public.vault_files TO service_role;
ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vault_files_read_approved" ON public.vault_files FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "vault_files_insert_approved" ON public.vault_files FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "vault_files_update_own_or_admin" ON public.vault_files FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "vault_files_delete_own_or_admin" ON public.vault_files FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Storage policies for the vault-files bucket (bucket itself is created via the storage tool)
CREATE POLICY "vault_files_storage_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vault-files' AND public.is_approved(auth.uid()));
CREATE POLICY "vault_files_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vault-files' AND public.is_approved(auth.uid()));
CREATE POLICY "vault_files_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vault-files' AND public.is_approved(auth.uid()));
CREATE POLICY "vault_files_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vault-files' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
