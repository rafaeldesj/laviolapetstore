import React, { useState, useEffect, useCallback } from 'react';
import { Package, AlertTriangle, PlusCircle, Search, Filter, Trash2, Edit, Save, AlertCircle, ShoppingBag } from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, logAction } from '../supabaseClient';
import type { Product } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';

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
  const [quantity, setQuantity] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(0);
  const [sku, setSku] = useState<string>('');

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all'); // 'all' | 'normal' | 'low' | 'out'

  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name');
        if (error) throw error;
        setProducts(data || []);
      } else {
        const { data } = await mockSupabaseDb.getProducts();
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
    setQuantity(0);
    setMinStock(0);
    setSku('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setCategory(product.category || 'Outros');
    setBrand(product.brand || '');
    setPrice(product.price);
    setCostPrice(product.cost_price);
    setQuantity(product.quantity);
    setMinStock(product.min_stock);
    setSku(product.sku || '');
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
      quantity: Number(quantity) || 0,
      min_stock: Number(minStock) || 0,
      sku: sku.trim()
    };

    try {
      if (editingProduct) {
        // Edit Mode
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
          if (error) throw error;
        } else {
          await mockSupabaseDb.updateProduct(editingProduct.id, productData);
        }

        await logAction(
          currentUser?.email || '',
          currentUser?.name || 'Administrador',
          'Edição de Estoque',
          `O produto "${productData.name}" (SKU: ${productData.sku || 'N/A'}) foi editado. Quantidade: ${productData.quantity}, Preço: R$ ${productData.price.toFixed(2)}.`
        );
      } else {
        // Add Mode
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.from('products').insert(productData);
          if (error) throw error;
        } else {
          await mockSupabaseDb.addProduct(productData);
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
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('products').delete().eq('id', product.id);
        if (error) throw error;
      } else {
        await mockSupabaseDb.deleteProduct(product.id);
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

  // Filtered List
  const filteredProducts = products.filter(p => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    
    if (filterStatus === 'out' && p.quantity !== 0) return false;
    if (filterStatus === 'low' && (p.quantity === 0 || p.quantity > p.min_stock)) return false;
    if (filterStatus === 'normal' && p.quantity <= p.min_stock) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand?.toLowerCase().includes(q) ?? false) ||
        (p.sku?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

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
        <button
          onClick={handleOpenAddModal}
          style={styles.btnAcc(hoveredBtn === 'new-product')}
          onMouseEnter={() => setHoveredBtn('new-product')}
          onMouseLeave={() => setHoveredBtn(null)}
        >
          <PlusCircle size={16} /> Novo Produto
        </button>
      </div>

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
      ) : (
        /* Products Grid */
        <div style={{
          display: 'grid',
          gridTemplateColumns: styles.crudList.gridTemplateColumns || 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
          marginTop: '20px',
        }}>
          {filteredProducts.map((product) => {
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
                    <strong style={{ color: styles.textMain }}>R$ {product.price.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: styles.sidebarWidgetText?.color }}>Preço Custo:</span>
                    <span style={{ color: styles.textMuted || styles.sidebarWidgetText?.color }}>R$ {product.cost_price.toFixed(2)}</span>
                  </div>
                  
                  <hr style={{ border: 'none', borderTop: `1px solid ${styles.borderColor}`, margin: '4px 0' }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: styles.sidebarWidgetText?.color }}>Qtd em Estoque:</span>
                    <strong style={{
                      fontSize: '1.15rem',
                      color: isOut ? 'hsl(0, 75%, 55%)' : (isLow ? 'hsl(36, 95%, 50%)' : styles.primary)
                    }}>
                      {product.quantity}
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
                    style={styles.btnIcon(hoveredBtn === `edit-${product.id}`)}
                    onMouseEnter={() => setHoveredBtn(`edit-${product.id}`)}
                    onMouseLeave={() => setHoveredBtn(null)}
                    title="Editar Produto"
                    aria-label={`Editar produto ${product.name}`}
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(product)}
                    style={styles.btnIcon(hoveredBtn === `del-${product.id}`, true)}
                    onMouseEnter={() => setHoveredBtn(`del-${product.id}`)}
                    onMouseLeave={() => setHoveredBtn(null)}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-cost" style={styles.formLabel}>Preço Custo (R$) *</label>
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
                  <label htmlFor="prod-price" style={styles.formLabel}>Preço Venda (R$) *</label>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-qty" style={styles.formLabel}>Qtd em Estoque *</label>
                  <input
                    id="prod-qty"
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    style={styles.formInput}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label htmlFor="prod-min" style={styles.formLabel}>Estoque Mínimo (Alerta) *</label>
                  <input
                    id="prod-min"
                    type="number"
                    min="0"
                    value={minStock}
                    onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                    style={styles.formInput}
                    required
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="prod-sku" style={styles.formLabel}>Código SKU / Barras</label>
                <input
                  id="prod-sku"
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  style={styles.formInput}
                  placeholder="Ex: 7891020304050"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button
                  type="submit"
                  disabled={isSaving}
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
