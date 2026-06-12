-- Execute este comando no SQL Editor do seu painel do Supabase para criar a tabela de logs de auditoria.

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (simplificadas para o ambiente de desenvolvimento)
CREATE POLICY "Permitir leitura de logs" ON public.audit_logs
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Permitir insercao de logs" ON public.audit_logs
    FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Garantir privilégios
GRANT SELECT, INSERT ON public.audit_logs TO anon, authenticated;
