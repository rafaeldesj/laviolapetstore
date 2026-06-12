-- Execute este comando no SQL Editor do seu painel do Supabase para criar a tabela de agendamentos.

CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE,
    pet_name TEXT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'Agendado' CHECK (status IN ('Agendado', 'Em Andamento', 'Concluído', 'Cancelado')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (simplificadas para o ambiente de desenvolvimento)
CREATE POLICY "Permitir leitura de agendamentos" ON public.appointments
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Permitir insercao de agendamentos" ON public.appointments
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Permitir atualizacao de agendamentos" ON public.appointments
    FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "Permitir exclusao de agendamentos" ON public.appointments
    FOR DELETE TO anon, authenticated USING (true);

-- Garantir privilégios
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO anon, authenticated;
