import React, { useState, useEffect, useCallback } from 'react';
import { Package, AlertTriangle, PlusCircle, Search, Filter, Trash2, Edit, Save, AlertCircle, ShoppingBag, LayoutGrid, List, Rows3, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, logAction } from '../supabaseClient';
import type { Product } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { NcmImportModal } from './NcmImportModal';
import { SkuField } from './SkuField';
import { matchesQuery, searchTokens } from '../utils/productSearch';
import { UNIT_OPTIONS, formatQty, isFractional, priceLabel, roundQty, unitShort } from '../utils/units';

interface EstoqueProps {
  styles: any;
}

const categories = [
  'Ração / Alimentos',
  'Higiene & Beleza',
  'Medicamentos / Farmácia',
  'Acessórios',
  'Brinquedos',
  'Outros'
];

type ViewMode = 'cards' | 'lista' | 'categorias';
type SortKey = 'name' | 'category' | 'cost' | 'price' | 'margin' | 'stock';

const SORT_OPTIONS: { key: SortKey; dir: 'asc' | 'desc'; label: string }[] = [
  { key: 'name', dir: 'asc', label: 'Nome (A → Z)' },
  { key: 'name', dir: 'desc', label: 'Nome (Z → A)' },
  { key: 'stock', dir: 'asc', label: 'Menor estoque primeiro' },
  { key: 'stock', dir: 'desc', label: 'Maior estoque primeiro' },
  { key: 'price', dir: 'asc', label: 'Menor preço de venda' },
  { key: 'price', dir: 'desc', label: 'Maior preço de venda' },
  { key: 'cost', dir: 'asc', label: 'Menor custo' },
  { key: 'cost', dir: 'desc', label: 'Maior custo' },
  { key: 'margin', dir: 'asc', label: 'Menor margem' },
  { key: 'margin', dir: 'desc', label: 'Maior margem' },
  { key: 'category', dir: 'asc', label: 'Categoria (A → Z)' },
];

const PAGE_SIZES = [20, 50, 100, 0]; // 0 = todos

const marginOf = (p: Product): number => (p.price > 0 ? ((p.price - p.cost_price) / p.price) * 100 : 0);

const readPref = <T,>(key: string, fallback: T, valid: (v: any) => boolean): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const v = JSON.parse(raw);
      if (valid(v)) return v as T;
    }
  } catch { /* sem armazenamento: usa o padrão */ }
  return fallback;
};
const savePref = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignora */ }
};

export const Estoque: React.FC<EstoqueProps> = ({ styles }) => {
  const { user: currentUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('Ração / Alimentos');
  const [brand, setBrand] = useState<string>('');
  const [price, setPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  // Texto (não número) para aceitar "0,350" enquanto se digita.
  const [quantity, setQuantity] = useState<string>('0');
  const [minStock, setMinStock] = useState<string>('0');
  const [unit, setUnit] = useState<string>('UN');
  const toNum = (v: string): number => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const [sku, setSku] = useState<string>('');
  const [isNcmImportOpen, setIsNcmImportOpen] = useState<boolean>(false);
  const [ncm, setNcm] = useState<string>('');
  const [origin, setOrigin] = useState<string>('0');

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all'); // 'all' | 'normal' | 'low' | 'out'

  // Forma de ver a lista (fica salva neste computador)
  const [viewMode, setViewMode] = useState<ViewMode>(() => readPref<ViewMode>('estoque:view', 'lista', v => ['cards', 'lista', 'categorias'].includes(v)));
  const [sortKey, setSortKey] = useState<SortKey>(() => readPref<SortKey>('estoque:sortKey', 'name', v => SORT_OPTIONS.some(o => o.key === v)));
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => readPref<'asc' | 'desc'>('estoque:sortDir', 'asc', v => v === 'asc' || v === 'desc'));
  const [pageSize, setPageSize] = useState<number>(() => readPref<number>('estoque:pageSize', 50, v => PAGE_SIZES.includes(v)));
  const [page, setPage] = useState<number>(1);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => { savePref('estoque:view', viewMode); }, [viewMode]);
  useEffect(() => { savePref('estoque:sortKey', sortKey); savePref('estoque:sortDir', sortDir); }, [sortKey, sortDir]);
  useEffect(() => { savePref('estoque:pageSize', pageSize); }, [pageSize]);
  useEffect(() => { setPage(1); }, [searchQuery, filterCategory, filterStatus, sortKey, sortDir, pageSize]);

  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (false && supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name');
        if (error) throw error;
        setProducts(data || []);
      } else {
        const { data, error } = await mockSupabaseDb.getProducts();
        if (error) throw error; // mostra o motivo em vez de uma lista vazia
        setProducts(data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar o estoque.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setName('');
    setCategory('Ração / Alimentos');
    setBrand('');
    setPrice(0);
    setCostPrice(0);
    setQuantity('0');
    setMinStock('0');
    setUnit('UN');
    setSku('');
    setNcm('');
    setOrigin('0');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setCategory(product.category || 'Outros');
    setBrand(product.brand || '');
    setPrice(product.price);
    setCostPrice(product.cost_price);
    setQuantity(String(product.quantity).replace('.', ','));
    setMinStock(String(product.min_stock).replace('.', ','));
    setUnit(product.unit || 'UN');
    setSku(product.sku || '');
    setNcm((product as Product & { ncm?: string }).ncm || '');
    setOrigin((product as Product & { origin?: string }).origin || '0');
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('O nome do produto é obrigatório.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);

    const productData = {
      name: name.trim(),
      category,
      brand: brand.trim(),
      price: Number(price) || 0,
      cost_price: Number(costPrice) || 0,
      quantity: roundQty(toNum(quantity)),
      min_stock: roundQty(toNum(minStock)),
      unit,
      sku: sku.trim(),
      ncm: ncm.replace(/\D/g, ''),
      origin
    };

    try {
      if (editingProduct) {
        // Edit Mode
        if (false && supabase) {
          const { error } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
          if (error) throw error;
        } else {
          const { error } = await mockSupabaseDb.updateProduct(editingProduct.id, productData);
          if (error) throw error;
        }

        await logAction(
          currentUser?.email || '',
          currentUser?.name || 'Administrador',
          'Edição de Estoque',
          `O produto "${productData.name}" (SKU: ${productData.sku || 'N/A'}) foi editado. Quantidade: ${productData.quantity}, Preço: R$ ${productData.price.toFixed(2)}.`
        );
      } else {
        // Add Mode
        if (false && supabase) {
          const { error } = await supabase.from('products').insert(productData);
          if (error) throw error;
        } else {
          const { error } = await mockSupabaseDb.addProduct(productData);
          if (error) throw error;
        }

        await logAction(
          currentUser?.email || '',
          currentUser?.name || 'Administrador',
          'Criação de Estoque',
          `Novo produto "${productData.name}" (SKU: ${productData.sku || 'N/A'}) cadastrado no estoque com quantidade inicial de ${productData.quantity}.`
        );
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar o produto.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    const confirmed = window.confirm(`Tem certeza de que deseja remover o produto "${product.name}" do estoque?`);
    if (!confirmed) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (false && supabase) {
        const { error } = await supabase.from('products').delete().eq('id', product.id);
        if (error) throw error;
      } else {
        const { error } = await mockSupabaseDb.deleteProduct(product.id);
        if (error) throw error;
      }

      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Administrador',
        'Exclusão de Estoque',
        `O produto "${product.name}" (SKU: ${product.sku || 'N/A'}) foi removido permanentemente do estoque.`
      );

      fetchProducts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao deletar o produto.');
      setIsLoading(false);
    }
  };

  // Metrics
  const totalProducts = products.length;
  const outOfStockCount = products.filter(p => p.quantity === 0).length;
  const lowStockCount = products.filter(p => p.quantity > 0 && p.quantity <= p.min_stock).length;

  const searchTok = searchTokens(searchQuery);

  // Filtered List
  const filteredProducts = products.filter(p => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    
    if (filterStatus === 'out' && p.quantity !== 0) return false;
    if (filterStatus === 'low' && (p.quantity === 0 || p.quantity > p.min_stock)) return false;
    if (filterStatus === 'normal' && p.quantity <= p.min_stock) return false;

    return matchesQuery(p, searchTok);
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let r = 0;
    switch (sortKey) {
      case 'name': r = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }); break;
      case 'category': r = (a.category || '').localeCompare(b.category || '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }); break;
      case 'cost': r = a.cost_price - b.cost_price; break;
      case 'price': r = a.price - b.price; break;
      case 'margin': r = marginOf(a) - marginOf(b); break;
      case 'stock': r = a.quantity - b.quantity; break;
    }
    return sortDir === 'asc' ? r : -r;
  });

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = pageSize === 0 ? sortedProducts : sortedProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const statusOf = (p: Product) => {
    if (p.quantity === 0) return { color: 'hsl(0, 75%, 55%)', bg: 'rgba(255, 99, 132, 0.08)', border: 'rgba(255, 99, 132, 0.25)', label: 'Sem Estoque' };
    if (p.quantity <= p.min_stock) return { color: 'hsl(36, 95%, 50%)', bg: 'rgba(255, 165, 0, 0.08)', border: 'rgba(255, 165, 0, 0.25)', label: 'Estoque Baixo' };
    return { color: 'hsl(142, 60%, 40%)', bg: 'rgba(75, 192, 192, 0.08)', border: 'rgba(75, 192, 192, 0.25)', label: 'Normal' };
  };

  const clickSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' || key === 'category' ? 'asc' : 'desc'); }
  };

  const renderRow = (product: Product) => {
    const st = statusOf(product);
    const margin = marginOf(product);
    return (
      <tr key={product.id} style={{ borderTop: `1px solid ${styles.borderColor}`, opacity: product.quantity === 0 ? 0.8 : 1 }}>
        <td style={{ padding: '8px 10px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: styles.textMain, overflowWrap: 'anywhere' }}>{product.name}</div>
          <div style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color, overflowWrap: 'anywhere' }}>
            {[product.category, product.brand, product.sku && `Cód: ${product.sku}`].filter(Boolean).join(' · ')}
          </div>
        </td>
        <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap', color: styles.sidebarWidgetText?.color }}>{priceLabel(product.cost_price, product.unit)}</td>
        <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: styles.textMain }}>{priceLabel(product.price, product.unit)}</td>
        <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap', color: margin < 0 ? 'hsl(0, 75%, 50%)' : styles.textMain }}>{margin.toFixed(1).replace('.', ',')}%</td>
        <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: st.color }}>{formatQty(product.quantity, product.unit)}</td>
        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', backgroundColor: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: 'nowrap' }}>{st.label}</span>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button onClick={() => handleOpenEditModal(product)} className="btn-action-icon" style={{ backgroundColor: styles.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', color: styles.textMain, marginRight: '6px' }} title="Editar Produto" aria-label={`Editar produto ${product.name}`}>
            <Edit size={14} />
          </button>
          <button onClick={() => handleDeleteProduct(product)} className="btn-action-icon btn-action-danger" title="Remover Produto" aria-label={`Remover produto ${product.name}`}>
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
    );
  };

  const renderTable = () => {
    const head = (key: SortKey | null, label: string, align: 'left' | 'right' | 'center') => (
      <th
        scope="col"
        style={{ padding: '8px 6px', textAlign: align, fontSize: '0.72rem', fontWeight: 700, color: styles.sidebarWidgetText?.color, whiteSpace: 'nowrap', cursor: key ? 'pointer' : 'default', userSelect: 'none' }}
        onClick={key ? () => clickSort(key) : undefined}
        aria-sort={key && sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {label}
        {key && sortKey === key && (sortDir === 'asc' ? <ChevronUp size={12} style={{ verticalAlign: 'middle' }} /> : <ChevronDown size={12} style={{ verticalAlign: 'middle' }} />)}
      </th>
    );
    const header = (
      <thead>
        <tr style={{ backgroundColor: styles.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
          {head('name', 'Produto', 'left')}
          {head('cost', 'Custo', 'right')}
          {head('price', 'Venda', 'right')}
          {head('margin', 'Margem', 'right')}
          {head('stock', 'Estoque', 'right')}
          {head(null, 'Status', 'center')}
          {head(null, '', 'right')}
        </tr>
      </thead>
    );
    const box: React.CSSProperties = { border: `1px solid ${styles.borderColor}`, borderRadius: '10px', overflow: 'hidden', marginTop: '20px' };
    const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'auto' };

    if (viewMode === 'categorias') {
      const groups: Record<string, Product[]> = {};
      pagedProducts.forEach(p => { (groups[p.category || 'Outros'] ||= []).push(p); });
      const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
          {names.map(cat => {
            const items = groups[cat];
            const isCollapsed = !!collapsed[cat];
            const alerts = items.filter(p => p.quantity <= p.min_stock).length;
            return (
              <div key={cat} style={{ ...box, marginTop: 0 }}>
                <button
                  type="button"
                  onClick={() => setCollapsed(c => ({ ...c, [cat]: !c[cat] }))}
                  aria-expanded={!isCollapsed}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: styles.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: 'none', cursor: 'pointer', color: styles.textMain, fontWeight: 700, fontSize: '0.9rem', textAlign: 'left' }}
                >
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  {cat}
                  <span style={{ fontWeight: 600, fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
                    {items.length} {items.length === 1 ? 'produto' : 'produtos'}
                  </span>
                  {alerts > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, color: 'hsl(36, 95%, 42%)' }}>⚠ {alerts} com estoque baixo/zerado</span>}
                </button>
                {!isCollapsed && (
                  <table style={tableStyle}>
                    {header}
                    <tbody>{items.map(renderRow)}</tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div style={box}>
        <table style={tableStyle}>
          {header}
          <tbody>{pagedProducts.map(renderRow)}</tbody>
        </table>
      </div>
    );
  };

  const modeBtn = (mode: ViewMode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setViewMode(mode)}
      aria-pressed={viewMode === mode}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: 'none',
        backgroundColor: viewMode === mode ? styles.primary : 'transparent',
        color: viewMode === mode ? '#fff' : styles.textMain,
      }}
    >
      {icon} {label}
    </button>
  );

  const missingNcm = products.filter(p => ((p as Product & { ncm?: string }).ncm || '').replace(/\D/g, '').length !== 8).length;

  return (
    <section style={styles.contentSection} aria-labelledby="estoque-heading">
      {/* Header */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="estoque-heading" style={styles.sectionTitle}>
            <Package size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Controle de Estoque & Produtos
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Acompanhe a quantidade de mercadorias, altere preços e configure alertas de estoque baixo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsNcmImportOpen(true)}
            style={styles.btnAcc(hoveredBtn === 'import-ncm')}
            onMouseEnter={() => setHoveredBtn('import-ncm')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            Preencher NCM por planilha
          </button>
          <button
            onClick={handleOpenAddModal}
            style={styles.btnAcc(hoveredBtn === 'new-product')}
            onMouseEnter={() => setHoveredBtn('new-product')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            <PlusCircle size={16} /> Novo Produto
          </button>
        </div>
      </div>

      {missingNcm > 0 && (
        <div role="status" style={{
          margin: '15px 0', padding: '8px 12px', borderRadius: '6px', fontSize: '0.82rem',
          backgroundColor: 'hsl(36,95%,45%,0.08)', border: '1px solid hsl(36,95%,45%,0.25)', color: 'hsl(36,95%,30%)'
        }}>
          ⚠ {missingNcm} produto(s) sem NCM — sem ele não dá para emitir nota fiscal desses itens.{' '}
          <button type="button" onClick={() => setIsNcmImportOpen(true)} style={{ background: 'none', border: 'none', color: styles.primary, cursor: 'pointer', fontWeight: 700, padding: 0 }}>
            Resolver agora
          </button>
        </div>
      )}

      {isNcmImportOpen && (
        <NcmImportModal
          styles={styles}
          products={products as any}
          onClose={() => setIsNcmImportOpen(false)}
          onDone={fetchProducts}
        />
      )}

      {errorMsg && (
        <div style={{
          color: 'hsl(0,75%,55%)',
          fontSize: '0.85rem',
          margin: '15px 0',
          padding: '8px 12px',
          backgroundColor: 'hsl(0,75%,55%,0.08)',
          borderRadius: '6px',
          border: '1px solid hsl(0,75%,55%,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginTop: '20px',
      }}>
        {/* Total Products */}
        <div style={{
          backgroundColor: styles.cardBackground || styles.background,
          padding: '16px 20px',
          borderRadius: '12px',
          border: `1px solid ${styles.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          boxShadow: styles.shadow,
        }}>
          <div style={{
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            color: 'hsl(210, 85%, 45%)',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ShoppingBag size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, fontWeight: 600 }}>Total de Itens</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: styles.textMain }}>{totalProducts}</strong>
          </div>
        </div>

        {/* Low Stock */}
        <div style={{
          backgroundColor: styles.cardBackground || styles.background,
          padding: '16px 20px',
          borderRadius: '12px',
          border: `1px solid ${lowStockCount > 0 ? 'rgba(255, 165, 0, 0.3)' : styles.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          boxShadow: styles.shadow,
        }}>
          <div style={{
            backgroundColor: lowStockCount > 0 ? 'rgba(255, 165, 0, 0.1)' : 'rgba(120, 120, 120, 0.08)',
            color: lowStockCount > 0 ? 'hsl(36, 95%, 50%)' : styles.sidebarWidgetText?.color,
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, fontWeight: 600 }}>Estoque Baixo</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: lowStockCount > 0 ? 'hsl(36, 95%, 50%)' : styles.textMain }}>{lowStockCount}</strong>
          </div>
        </div>

        {/* Out of Stock */}
        <div style={{
          backgroundColor: styles.cardBackground || styles.background,
          padding: '16px 20px',
          borderRadius: '12px',
          border: `1px solid ${outOfStockCount > 0 ? 'rgba(255, 99, 132, 0.3)' : styles.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          boxShadow: styles.shadow,
        }}>
          <div style={{
            backgroundColor: outOfStockCount > 0 ? 'rgba(255, 99, 132, 0.1)' : 'rgba(120, 120, 120, 0.08)',
            color: outOfStockCount > 0 ? 'hsl(0, 75%, 55%)' : styles.sidebarWidgetText?.color,
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AlertCircle size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, fontWeight: 600 }}>Fora de Estoque</span>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: outOfStockCount > 0 ? 'hsl(0, 75%, 55%)' : styles.textMain }}>{outOfStockCount}</strong>
          </div>
        </div>
      </div>

      {/* Filters Control Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginTop: '25px',
        padding: '12px 14px',
        backgroundColor: styles.background,
        borderRadius: '10px',
        border: `1px solid ${styles.borderColor}`,
        alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ flex: '2 1 240px', position: 'relative', minWidth: '200px' }}>
          <input
            type="text"
            placeholder="Buscar por nome, marca ou SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              ...styles.formInput,
              width: '100%',
              paddingLeft: '34px',
              padding: '8px 10px 8px 34px',
              fontSize: '0.85rem'
            }}
          />
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
        </div>

        {/* Category dropdown filter */}
        <div style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} style={{ color: styles.sidebarWidgetText?.color }} />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', width: '100%' }}
          >
            <option value="all">Todas as Categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status filter dropdown */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '1 1 160px' }}
        >
          <option value="all">Todos os Status</option>
          <option value="normal">Estoque Normal</option>
          <option value="low">Estoque Baixo</option>
          <option value="out">Fora de Estoque</option>
        </select>

        {/* Ordenação */}
        <select
          aria-label="Ordenar por"
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => { const [k, d] = e.target.value.split(':'); setSortKey(k as SortKey); setSortDir(d as 'asc' | 'desc'); }}
          style={{ ...styles.formInput, padding: '8px 10px', fontSize: '0.85rem', flex: '1 1 180px' }}
        >
          {SORT_OPTIONS.map(o => (
            <option key={`${o.key}:${o.dir}`} value={`${o.key}:${o.dir}`}>{o.label}</option>
          ))}
        </select>

        {/* Forma de visualização */}
        <div role="group" aria-label="Forma de visualização" style={{ display: 'inline-flex', border: `1px solid ${styles.borderColor}`, borderRadius: '8px', overflow: 'hidden', flex: '0 0 auto' }}>
          {modeBtn('lista', 'Lista', <List size={14} />)}
          {modeBtn('categorias', 'Por categoria', <Rows3 size={14} />)}
          {modeBtn('cards', 'Cards', <LayoutGrid size={14} />)}
        </div>
      </div>

      {/* Loading state / Empty State */}
      {isLoading && products.length === 0 ? (
        <p style={{ color: styles.sidebarWidgetText?.color, marginTop: '30px', textAlign: 'center' }}>Carregando inventário...</p>
      ) : filteredProducts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '50px 20px',
          border: `1px dashed ${styles.borderColor}`,
          borderRadius: '12px',
          marginTop: '25px'
        }}>
          <Package size={40} style={{ color: styles.secondary, margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
          <p style={{ color: styles.sidebarWidgetText?.color, fontWeight: 500 }}>
            Nenhum produto correspondente encontrado no estoque.
          </p>
        </div>
      ) : viewMode !== 'cards' ? (
        renderTable()
      ) : (
        /* Products Grid */
        <div style={{
          display: 'grid',
          gridTemplateColumns: styles.crudList.gridTemplateColumns || 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
          marginTop: '20px',
        }}>
          {pagedProducts.map((product) => {
            const isOut = product.quantity === 0;
            const isLow = product.quantity > 0 && product.quantity <= product.min_stock;
            
            let statusBadge = { bg: 'rgba(75, 192, 192, 0.08)', text: 'hsl(142, 60%, 40%)', border: 'rgba(75, 192, 192, 0.25)', label: 'Normal' };
            if (isOut) {
              statusBadge = { bg: 'rgba(255, 99, 132, 0.08)', text: 'hsl(0, 75%, 55%)', border: 'rgba(255, 99, 132, 0.25)', label: 'Sem Estoque' };
            } else if (isLow) {
              statusBadge = { bg: 'rgba(255, 165, 0, 0.08)', text: 'hsl(36, 95%, 50%)', border: 'rgba(255, 165, 0, 0.25)', label: 'Estoque Baixo' };
            }

            return (
              <article key={product.id} style={{
                ...styles.petCard,
                opacity: isOut ? 0.75 : 1,
                border: isOut ? '1px solid rgba(255, 99, 132, 0.25)' : (isLow ? '1px solid rgba(255, 165, 0, 0.25)' : `1px solid ${styles.borderColor}`),
              }}>
                <div style={styles.petHeader}>
                  <h3 style={{ ...styles.petName, fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={product.name}>
                    {product.name}
                  </h3>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '20px',
                    backgroundColor: statusBadge.bg,
                    color: statusBadge.text,
                    border: `1px solid ${statusBadge.border}`,
                  }}>
                    {statusBadge.label}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color, marginTop: '-4px' }}>
                  Categoria: <strong>{product.category || 'Outros'}</strong> {product.brand && `| Marca: ${product.brand}`}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: styles.sidebarWidgetText?.color }}>Preço Venda:</span>
                    <strong style={{ color: styles.textMain }}>{priceLabel(product.price, product.unit)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: styles.sidebarWidgetText?.color }}>Preço Custo:</span>
                    <span style={{ color: styles.textMuted || styles.sidebarWidgetText?.color }}>{priceLabel(product.cost_price, product.unit)}</span>
                  </div>
                  
                  <hr style={{ border: 'none', borderTop: `1px solid ${styles.borderColor}`, margin: '4px 0' }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: styles.sidebarWidgetText?.color }}>Qtd em Estoque:</span>
                    <strong style={{
                      fontSize: '1.15rem',
                      color: isOut ? 'hsl(0, 75%, 55%)' : (isLow ? 'hsl(36, 95%, 50%)' : styles.primary)
                    }}>
                      {formatQty(product.quantity, product.unit)}
                    </strong>
                  </div>

                  {product.sku && (
                    <div style={{ fontSize: '0.72rem', color: styles.sidebarWidgetText?.color, marginTop: '2px', fontFamily: 'monospace' }}>
                      SKU/Cód: {product.sku}
                    </div>
                  )}
                </div>

                <div style={{ ...styles.petActions, marginTop: 'auto' }}>
                  <button
                    onClick={() => handleOpenEditModal(product)}
                    className="btn-action-icon"
                    style={{
                      backgroundColor: styles.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                      color: styles.textMain,
                    }}
                    title="Editar Produto"
                    aria-label={`Editar produto ${product.name}`}
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(product)}
                    className="btn-action-icon btn-action-danger"
                    title="Remover Produto"
                    aria-label={`Remover produto ${product.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Contagem e paginação */}
      {sortedProducts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '14px', fontSize: '0.8rem', color: styles.sidebarWidgetText?.color }}>
          <span>
            {pageSize === 0
              ? `Mostrando todos os ${sortedProducts.length} produtos`
              : `Mostrando ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, sortedProducts.length)} de ${sortedProducts.length} produtos`}
            {sortedProducts.length !== products.length && ` (filtrados de ${products.length})`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label htmlFor="page-size" style={{ fontWeight: 600 }}>Por página:</label>
            <select id="page-size" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...styles.formInput, width: 'auto', padding: '5px 8px', fontSize: '0.8rem' }}>
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n === 0 ? 'Todos' : n}</option>)}
            </select>
            {totalPages > 1 && (
              <>
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} style={{ ...styles.btnAcc(false), padding: '5px 10px', opacity: currentPage <= 1 ? 0.5 : 1 }}>‹ Anterior</button>
                <span style={{ fontWeight: 700, color: styles.textMain }}>{currentPage} / {totalPages}</span>
                <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} style={{ ...styles.btnAcc(false), padding: '5px 10px', opacity: currentPage >= totalPages ? 0.5 : 1 }}>Próxima ›</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* CRUD Product Modal */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '500px' }} role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <div style={styles.modalHeader}>
              <h2 id="product-modal-title" style={styles.modalTitle}>
                {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={handleSaveProduct} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label htmlFor="prod-name" style={styles.formLabel}>Nome do Produto *</label>
                <input
                  id="prod-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={styles.formInput}
                  placeholder="Ex: Ração Premier Raças Pequenas 2.5kg"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '15px' }}>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-cat" style={styles.formLabel}>Categoria *</label>
                  <select
                    id="prod-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={styles.formInput}
                    required
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-brand" style={styles.formLabel}>Marca</label>
                  <input
                    id="prod-brand"
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    style={styles.formInput}
                    placeholder="Ex: Premier Pet"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="prod-unit" style={styles.formLabel}>Unidade de venda *</label>
                <select
                  id="prod-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  style={styles.formInput}
                >
                  {UNIT_OPTIONS.map(u => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: styles.sidebarWidgetText?.color }}>
                  {isFractional(unit)
                    ? `Venda a granel: o caixa pergunta quanto o cliente leva (ex.: 0,350 ${unitShort(unit)}) e o estoque baixa em frações. Preços e estoque abaixo são por ${unitShort(unit)}.`
                    : 'Vendido por unidade inteira (ex.: 1 pacote). Para vender por peso, escolha KG.'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '15px' }}>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-cost" style={styles.formLabel}>Preço Custo (R$){isFractional(unit) ? ` por ${unitShort(unit)}` : ''} *</label>
                  <input
                    id="prod-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    style={styles.formInput}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-price" style={styles.formLabel}>Preço Venda (R$){isFractional(unit) ? ` por ${unitShort(unit)}` : ''} *</label>
                  <input
                    id="prod-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={price || ''}
                    onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    style={styles.formInput}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              {price > 0 && costPrice > 0 && (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.8rem', fontWeight: 600, color: styles.sidebarWidgetText?.color, marginTop: '-6px' }}>
                  <span>Markup: <strong style={{ color: styles.textMain }}>{(((price - costPrice) / costPrice) * 100).toFixed(2).replace('.', ',')}%</strong></span>
                  <span>Margem: <strong style={{ color: styles.textMain }}>{(((price - costPrice) / price) * 100).toFixed(2).replace('.', ',')}%</strong></span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '15px' }}>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-qty" style={styles.formLabel}>Qtd em Estoque ({unitShort(unit)}) *</label>
                  <input
                    id="prod-qty"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={quantity}
                    onChange={(e) => setQuantity(isFractional(unit) ? e.target.value : e.target.value.replace(/[^0-9]/g, ''))}
                    style={styles.formInput}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-min" style={styles.formLabel}>Estoque Mínimo ({unitShort(unit)}) *</label>
                  <input
                    id="prod-min"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={minStock}
                    onChange={(e) => setMinStock(isFractional(unit) ? e.target.value : e.target.value.replace(/[^0-9]/g, ''))}
                    style={styles.formInput}
                    required
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="prod-sku" style={styles.formLabel}>Código SKU / Barras</label>
                <SkuField id="prod-sku" styles={styles} value={sku} onChange={setSku} placeholder="Ex: 7891020304050" />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="prod-ncm" style={styles.formLabel}>NCM (8 dígitos, p/ NFC-e)</label>
                  <input
                    id="prod-ncm"
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={ncm}
                    onChange={(e) => setNcm(e.target.value.replace(/\D/g, ''))}
                    style={styles.formInput}
                    placeholder="Ex: 23091000"
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="prod-origin" style={styles.formLabel}>Origem</label>
                  <select id="prod-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} style={styles.formInput}>
                    <option value="0">0 - Nacional</option>
                    <option value="1">1 - Estrangeira (importação direta)</option>
                    <option value="2">2 - Estrangeira (mercado interno)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-save"
                  style={{ ...styles.formSubmitBtn(hoveredBtn === 'submit-prod'), flexGrow: 1, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onMouseEnter={() => setHoveredBtn('submit-prod')}
                  onMouseLeave={() => setHoveredBtn(null)}
                >
                  <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Produto'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ ...styles.btnAcc(hoveredBtn === 'cancel-prod'), padding: '12px' }}
                  onMouseEnter={() => setHoveredBtn('cancel-prod')}
                  onMouseLeave={() => setHoveredBtn(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
