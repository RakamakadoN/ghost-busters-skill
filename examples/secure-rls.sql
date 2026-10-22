-- Demo schema ONLY. Evaluate for your actual authorization and migration framework.
-- Run on a disposable development database first; explicit approval for production.
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  body text NOT NULL CHECK (length(body) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;

DROP POLICY IF EXISTS customer_notes_owner_select ON public.customer_notes;
CREATE POLICY customer_notes_owner_select ON public.customer_notes
FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_notes_owner_insert ON public.customer_notes;
CREATE POLICY customer_notes_owner_insert ON public.customer_notes
FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_notes_owner_update ON public.customer_notes;
CREATE POLICY customer_notes_owner_update ON public.customer_notes
FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_notes_owner_delete ON public.customer_notes;
CREATE POLICY customer_notes_owner_delete ON public.customer_notes
FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

-- Mandatory negative tests before use: anonymous denied, user A cannot read/update/delete
-- user B's notes, user A cannot spoof owner_id on insert or update.
-- The authenticated DB role is shared by users: auth.uid() is the identity boundary.
