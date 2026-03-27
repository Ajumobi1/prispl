ALTER TABLE public.profiles ADD COLUMN security_question text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN security_answer text NOT NULL DEFAULT '';