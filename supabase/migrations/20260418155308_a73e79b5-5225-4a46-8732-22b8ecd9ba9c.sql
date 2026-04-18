-- Add restrictive INSERT/UPDATE/DELETE policies so only admins can modify user_roles.
-- The existing "Admins can manage roles" ALL policy is permissive, which still allows
-- non-admin INSERT/UPDATE/DELETE because no policy restricts those actions. Restrictive
-- policies enforce the admin-only requirement on every write.

CREATE POLICY "Only admins can insert roles (restrictive)"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can update roles (restrictive)"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can delete roles (restrictive)"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));