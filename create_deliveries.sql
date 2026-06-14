-- Execute este comando no SQL Editor do seu painel do Supabase para criar a tabela de entregas (deliveries) e permitir sincronização online em tempo real entre diferentes dispositivos.

CREATE TABLE IF NOT EXISTS public.deliveries (
  id TEXT PRIMARY KEY,
  client_id UUID REFERENCES public.profiles(id),
  client_name TEXT NOT NULL,
  client_address TEXT NOT NULL,
  client_lat DOUBLE PRECISION NOT NULL,
  client_lng DOUBLE PRECISION NOT NULL,
  driver_id UUID REFERENCES public.profiles(id),
  driver_name TEXT,
  driver_lat DOUBLE PRECISION,
  driver_lng DOUBLE PRECISION,
  status TEXT NOT NULL CHECK (status IN ('agendada', 'a-caminho', 'concluida')),
  items TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Desabilitar Row Level Security (RLS) para permitir que o frontend insira, atualize e exclua registros diretamente sem travas extras
ALTER TABLE public.deliveries DISABLE ROW LEVEL SECURITY;

-- Conceder permissões totais para os usuários anônimos e autenticados acessarem e editarem as entregas
GRANT ALL ON public.deliveries TO anon, authenticated, service_role;
