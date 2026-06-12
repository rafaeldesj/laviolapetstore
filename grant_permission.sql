-- Execute este comando no SQL Editor do seu painel do Supabase para permitir a busca de e-mail por nome, telefone ou login.
GRANT SELECT (email, username, phone, full_name, is_active) ON public.profiles TO anon;
