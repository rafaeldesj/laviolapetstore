-- Execute este comando no SQL Editor do seu painel do Supabase para criar a tabela de produtos.

CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    brand TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 0,
    sku TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (simplificadas para o ambiente de desenvolvimento)
CREATE POLICY "Permitir leitura de produtos" ON public.products
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Permitir insercao de produtos" ON public.products
    FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Permitir atualizacao de produtos" ON public.products
    FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "Permitir exclusao de produtos" ON public.products
    FOR DELETE TO anon, authenticated USING (true);

-- Garantir privilégios
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;
