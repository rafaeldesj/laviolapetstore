import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, Search, PlusCircle, Trash2, Barcode, DollarSign, 
  CheckCircle, CreditCard, AlertTriangle, ArrowRight, User, Hash, Plus, Minus,
  Store, Truck
} from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured, logAction } from '../supabaseClient';
import type { Product } from '../supabaseClient';
import type { AuthUser } from '../hooks/useAuth';
import { DeliveryMap, type MapAddress } from './DeliveryMap';

interface VendaAvulsaProps {
  styles: any;
  currentUser: AuthUser;
}

interface CartItem {
  product: Product;
  quantity: number;
}

// NF-e structure prep
interface NFData {
  ncm: string;
  origin: string; // '0' = Nacional, '1' = Estrangeira/Importação
}

// Extended product interface to hold NF-e details locally if needed
type ProductWithNF = Product & Partial<NFData>;

export const VendaAvulsa: React.FC<VendaAvulsaProps> = ({ styles, currentUser }) => {
  const [products, setProducts] = useState<ProductWithNF[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [skuInput, setSkuInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Payment States
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('Dinheiro');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [clientCPF, setClientCPF] = useState<string>('');
  const [checkoutSuccess, setCheckoutSuccess] = useState<boolean>(false);
  const [lastSaleSummary, setLastSaleSummary] = useState<any>(null);
  const [deliveryType, setDeliveryType] = useState<'store' | 'delivery' | null>(null);
  const [hoveredType, setHoveredType] = useState<'store' | 'delivery' | null>(null);
  const [addressStreet, setAddressStreet] = useState<string>('');
  const [addressNumber, setAddressNumber] = useState<string>('');
  const [addressNeighborhood, setAddressNeighborhood] = useState<string>('');
  const [addressReference, setAddressReference] = useState<string>('');
  const [addressLat, setAddressLat] = useState<number | undefined>(undefined);
  const [addressLng, setAddressLng] = useState<number | undefined>(undefined);
  const [deliveryAsap, setDeliveryAsap] = useState<boolean>(true);
  const [deliveryTime, setDeliveryTime] = useState<string>('');

  const handleMapAddressSelect = (addr: MapAddress) => {
    setAddressStreet(addr.street);
    setAddressNumber(addr.number || '');
    setAddressNeighborhood(addr.neighborhood);
    setAddressReference(addr.complement || '');
    setAddressLat(addr.lat);
    setAddressLng(addr.lng);
  };

  // Register on the fly States
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [regSku, setRegSku] = useState<string>('');
  const [regName, setRegName] = useState<string>('');
  const [regCategory, setRegCategory] = useState<string>('Outros');
  const [regBrand, setRegBrand] = useState<string>('');
  const [regPrice, setRegPrice] = useState<string>('');
  const [regCostPrice, setRegCostPrice] = useState<string>('');
  const [regQuantity, setRegQuantity] = useState<string>('10');
  const [regMinStock, setRegMinStock] = useState<string>('2');
  const [regNcm, setRegNcm] = useState<string>('');
  const [regOrigin, setRegOrigin] = useState<string>('0'); // Nacional

  // Keyboard shortcut focus
  const skuInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    'Ração / Alimentos',
    'Higiene & Beleza',
    'Medicamentos / Farmácia',
    'Acessórios',
    'Brinquedos',
    'Outros'
  ];

  // Simulated Beep Sound
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, ctx.currentTime); // 1100Hz
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('AudioContext beep blocked or unsupported:', e);
    }
  };

  const loadProducts = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      let loadedProducts: ProductWithNF[] = [];
      if (false && supabase) { const { data, error } = await (supabase as any).from(""); } else {
        const { data } = await mockSupabaseDb.getProducts();
        loadedProducts = data || [];
      }

      // Merge local NF-e metadata to avoid database schema column cache conflicts
      const nfeMetadata = JSON.parse(localStorage.getItem('laviola_products_nfe_metadata') || '{}');
      const productsWithNfe = loadedProducts.map(p => ({
        ...p,
        ncm: p.ncm || nfeMetadata[p.id]?.ncm || nfeMetadata[p.sku]?.ncm || '',
        origin: p.origin || nfeMetadata[p.id]?.origin || nfeMetadata[p.sku]?.origin || '0'
      }));

      setProducts(productsWithNfe);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar o estoque.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Autofocus barcode scanner field on load and listen for global shortcuts
  useEffect(() => {
    if (skuInputRef.current) {
      skuInputRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Focar Leitor
      if (e.key === 'F2') {
        e.preventDefault();
        skuInputRef.current?.focus();
      }
      // F4: Novo Produto
      if (e.key === 'F4') {
        e.preventDefault();
        openRegisterModal('');
      }
      // F8: Limpar Carrinho
      if (e.key === 'F8') {
        e.preventDefault();
        clearCart();
      }
      // F9: Finalizar Venda
      if (e.key === 'F9') {
        e.preventDefault();
        if (cart.length > 0) {
          openCheckout();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  // Compute Cart Calculations
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
  const changeDue = amountPaid && parseFloat(amountPaid) >= subtotal 
    ? parseFloat(amountPaid) - subtotal 
    : 0;

  // Search manual product result list
  const filteredSearch = searchQuery.trim() === '' 
    ? [] 
    : products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (p.sku && p.sku.includes(searchQuery))
      );

  // Barcode / SKU Submission
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sku = skuInput.trim();
    if (!sku) return;

    // Search for product with this SKU
    const foundProduct = products.find(p => p.sku === sku);

    if (foundProduct) {
      addToCart(foundProduct);
      setSkuInput('');
      playBeep();
    } else {
      // SKU not found, open register express modal
      openRegisterModal(sku);
    }
  };

  // Add product to shopping cart
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      } else {
        return [...prev, { product, quantity: 1 }];
      }
    });
    setSearchQuery('');
    setIsSearching(false);
  };

  // Modify cart quantity
  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Remove specific product from cart
  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  // Clear whole cart
  const clearCart = () => {
    setCart([]);
    setErrorMessage(null);
  };

  // Open register expressive modal
  const openRegisterModal = (skuValue: string) => {
    setRegSku(skuValue);
    setRegName('');
    setRegBrand('');
    setRegPrice('');
    setRegCostPrice('');
    setRegQuantity('10');
    setRegMinStock('2');
    setRegCategory('Outros');
    setRegNcm('');
    setRegOrigin('0');
    setIsRegisterOpen(true);
  };

  const handleRegisterProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) {
      setErrorMessage('O nome do produto é obrigatório.');
      return;
    }
    const priceNum = parseFloat(regPrice) || 0;
    const costPriceNum = parseFloat(regCostPrice) || 0;
    const qtyNum = parseInt(regQuantity) || 0;
    const minStockNum = parseInt(regMinStock) || 0;
    const skuCode = regSku.trim() || Math.floor(100000000000 + Math.random() * 900000000000).toString();

    // Base database fields (avoid sending missing columns ncm and origin to Supabase directly)
    const productData = {
      name: regName.trim(),
      category: regCategory,
      brand: regBrand.trim(),
      price: priceNum,
      cost_price: costPriceNum,
      quantity: qtyNum,
      min_stock: minStockNum,
      sku: skuCode
    };

    setIsLoading(true);
    try {
      let newProduct: Product;
      if (false && supabase) { const { data, error } = await (supabase as any).from(""); } else {
        const { data, error } = await mockSupabaseDb.addProduct({
          ...productData,
          ncm: regNcm.trim(),
          origin: regOrigin
        } as any);
        if (error || !data) throw error || new Error('Data is null');
        newProduct = data as Product;
      }

      // Always save NF-e tax metadata in local storage (mapping by product ID or SKU)
      const nfeMetadata = JSON.parse(localStorage.getItem('laviola_products_nfe_metadata') || '{}');
      nfeMetadata[newProduct.id] = {
        ncm: regNcm.trim(),
        origin: regOrigin
      };
      nfeMetadata[skuCode] = {
        ncm: regNcm.trim(),
        origin: regOrigin
      };
      localStorage.setItem('laviola_products_nfe_metadata', JSON.stringify(nfeMetadata));

      await logAction(
        currentUser.email || '',
        currentUser.name || 'Operador',
        'Cadastro Expresso PDV',
        `Produto cadastrado na hora da venda: "${newProduct.name}" (SKU: ${newProduct.sku}, Preço: R$ ${newProduct.price})`
      );

      // Reload products catalog (which merges local NF-e metadata)
      await loadProducts();

      // Add newly registered product directly to the cart
      addToCart({
        ...newProduct,
        ncm: regNcm.trim(),
        origin: regOrigin
      } as any);
      
      setIsRegisterOpen(false);
      setSkuInput('');
      playBeep();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao cadastrar produto.');
    } finally {
      setIsLoading(false);
    }
  };

  const openCheckout = () => {
    setAmountPaid('');
    setClientName('');
    setClientCPF('');
    setDeliveryType(null);
    setAddressStreet('');
    setAddressNumber('');
    setAddressNeighborhood('');
    setAddressReference('');
    setIsCheckoutOpen(true);
  };

  const handleFinalizeSale = async () => {
    if (cart.length === 0) return;
    setIsLoading(true);
    setErrorMessage(null);

    const saleItems = cart.map(item => ({
      product_id: item.product.id,
      name: item.product.name,
      sku: item.product.sku,
      price: item.product.price,
      quantity: item.quantity,
      subtotal: item.product.price * item.quantity,
      // NF-e elements
      ncm: (item.product as any).ncm || '',
      origin: (item.product as any).origin || '0'
    }));

    const salePayload = {
      timestamp: new Date().toISOString(),
      items: saleItems,
      total_items: totalItems,
      subtotal: subtotal,
      payment_method: paymentMethod,
      amount_paid: paymentMethod === 'Dinheiro' ? parseFloat(amountPaid) || subtotal : subtotal,
      change: paymentMethod === 'Dinheiro' ? changeDue : 0,
      client: {
        name: clientName.trim(),
        cpf_cnpj: clientCPF.replace(/\D/g, '') // remove non-digits
      },
      delivery: deliveryType === 'delivery' ? {
        street: addressStreet.trim(),
        number: addressNumber.trim(),
        neighborhood: addressNeighborhood.trim(),
        reference: addressReference.trim(),
        lat: addressLat,
        lng: addressLng,
        time: deliveryAsap ? 'O mais breve possível' : deliveryTime
      } : null,
      type: deliveryType,
      nfe_ready: true // Flag to state this sale has all necessary NF-e info prefilled
    };

    try {
      // Abate stock for each item sold
      for (const item of cart) {
        const currentQty = item.product.quantity;
        const newQty = Math.max(0, currentQty - item.quantity);

        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase
            .from('products')
            .update({ quantity: newQty })
            .eq('id', item.product.id);
          if (error) throw error;
        } else {
          await mockSupabaseDb.updateProduct(item.product.id, { quantity: newQty });
        }
      }

      // Record logs
      const itemsString = saleItems.map(i => `${i.quantity}x ${i.name}`).join(', ');
      const clientString = clientName ? ` (Cliente: ${clientName} - CPF: ${clientCPF})` : ' (Consumidor Não Identificado)';
      
      await logAction(
        currentUser.email || '',
        currentUser.name || 'Operador',
        'Venda Avulsa Finalizada',
        `PDV Caixa: Venda finalizada com ${paymentMethod}. Total: R$ ${subtotal.toFixed(2)}. Itens: [${itemsString}].${clientString}`
      );

      // Save sale transaction locally for NF-e reference
      const saleId = Math.random().toString(36).substring(2, 9);
      const localSales = JSON.parse(localStorage.getItem('laviola_pdv_sales') || '[]');
      localSales.push({ id: saleId, ...salePayload });
      localStorage.setItem('laviola_pdv_sales', JSON.stringify(localSales));

      // Create a DeliveryItem if it's a delivery
      if (deliveryType === 'delivery') {
        const fullAddress = `${addressStreet.trim()}, ${addressNumber.trim()} - ${addressNeighborhood.trim()}`;
        const scheduledTime = deliveryAsap ? 'O mais breve possível' : deliveryTime;
        
        const newDelivery = {
          id: `deliv-${saleId}`,
          client_id: clientCPF ? `cpf-${clientCPF}` : 'avulso',
          client_name: clientName.trim() || 'Consumidor Avulso',
          client_address: fullAddress,
          client_lat: addressLat || -22.9122, // fallback to petshop coord if missing
          client_lng: addressLng || -43.5606, // fallback
          driver_id: '',
          driver_name: '',
          driver_lat: -22.9122,
          driver_lng: -43.5606,
          status: 'agendada',
          items: itemsString,
          scheduled_time: scheduledTime,
          created_at: new Date().toISOString()
        };

        const localDeliveries = JSON.parse(localStorage.getItem('laviola_deliveries') || '[]');
        localDeliveries.push(newDelivery);
        localStorage.setItem('laviola_deliveries', JSON.stringify(localDeliveries));
      }

      setLastSaleSummary(salePayload);
      setCheckoutSuccess(true);
      setIsCheckoutOpen(false);
      clearCart();
      loadProducts();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar e baixar o estoque da venda.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={styles.contentSection} aria-labelledby="pos-heading">
      {/* Header */}
      <div style={styles.crudHeader}>
        <div>
          <h2 id="pos-heading" style={styles.sectionTitle}>
            <ShoppingCart size={20} style={{ display: 'inline', marginRight: '8px', color: styles.primary }} />
            Venda Avulsa (Caixa PDV)
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.8rem', color: styles.sidebarWidgetText?.color, marginTop: '4px' }}>
            Operador: <strong>{currentUser.name}</strong> ({currentUser.email})
          </p>
        </div>

        {/* Shortcut Quick Reference */}
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap', 
          backgroundColor: styles.isDark ? '#26293b' : '#eaecef',
          padding: '6px 12px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 600
        }}>
          <span style={{ color: styles.primary }}><kbd>F2</kbd> Leitor</span>
          <span style={{ color: styles.primary }}><kbd>F4</kbd> Cadastrar</span>
          <span style={{ color: styles.primary }}><kbd>F8</kbd> Limpar</span>
          <span style={{ color: styles.primary }}><kbd>F9</kbd> Fechar</span>
        </div>
      </div>

      {errorMessage && (
        <div style={{
          color: 'hsl(0,75%,55%)', fontSize: '0.85rem', margin: '10px 0', 
          padding: '8px 12px', backgroundColor: 'hsl(0,75%,55%,0.08)', 
          borderRadius: '6px', border: '1px solid hsl(0,75%,55%,0.25)'
        }}>
          {errorMessage}
        </div>
      )}

      {/* PDV Main Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: window.innerWidth >= 992 ? '2fr 1fr' : '1fr',
        gap: '20px',
        marginTop: '20px'
      }}>
        {/* Left column: Inputs & Cart list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* Barcode / Search Block */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '10px',
            padding: '16px', backgroundColor: styles.cardBackground || '#fff',
            borderRadius: '12px', border: `1px solid ${styles.borderColor}`,
            boxShadow: styles.shadow
          }}>
            {/* Barcode scanner reader input (Simulated) */}
            <form onSubmit={handleBarcodeSubmit} style={{ flex: '1 1 240px', position: 'relative' }}>
              <label htmlFor="barcode-reader" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: styles.textMain }}>
                <Barcode size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                Leitor Código de Barras (SKU) [F2]
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="barcode-reader"
                  ref={skuInputRef}
                  type="text"
                  placeholder="Escaneie ou digite o código de barras..."
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  style={{ 
                    ...styles.formInput, 
                    width: '100%', 
                    paddingLeft: '36px',
                    borderColor: skuInput ? styles.primary : styles.borderColor,
                    fontWeight: 600,
                    letterSpacing: '1px'
                  }}
                />
                <Barcode size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.primary }} />
              </div>
              <p style={{ fontSize: '0.68rem', color: styles.sidebarWidgetText?.color, marginTop: '4px' }}>
                Pressione <strong>Enter</strong> para simular a leitura do código de barras.
              </p>
            </form>

            {/* Manual Product Search */}
            <div style={{ flex: '1 1 240px', position: 'relative' }}>
              <label htmlFor="search-product" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: styles.textMain }}>
                <Search size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                Busca Manual por Nome
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="search-product"
                  type="text"
                  placeholder="Digite o nome do produto..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearching(e.target.value.trim() !== '');
                  }}
                  style={{ ...styles.formInput, width: '100%', paddingLeft: '34px' }}
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: styles.sidebarWidgetText?.color }} />
              </div>

              {/* Autocomplete / Search Results dropdown */}
              {isSearching && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  backgroundColor: styles.isDark ? '#26293b' : '#fff',
                  border: `1px solid ${styles.borderColor}`,
                  borderRadius: '0 0 10px 10px', zIndex: 10,
                  maxHeight: '220px', overflowY: 'auto',
                  boxShadow: styles.shadowLg, marginTop: '2px'
                }}>
                  {filteredSearch.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, textAlign: 'center' }}>
                      Nenhum produto correspondente.
                      <button 
                        onClick={() => openRegisterModal('')}
                        style={{
                          display: 'block', margin: '8px auto 0', padding: '6px 12px',
                          border: 'none', borderRadius: '6px', backgroundColor: styles.primary,
                          color: '#fff', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        Cadastrar na Hora
                      </button>
                    </div>
                  ) : (
                    filteredSearch.map(product => (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        style={{
                          width: '100%', padding: '10px 12px', border: 'none',
                          borderBottom: `1px solid ${styles.borderColor}`,
                          backgroundColor: 'transparent', color: styles.textMain,
                          textAlign: 'left', cursor: 'pointer', display: 'flex',
                          justifyContent: 'space-between', alignItems: 'center',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = styles.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{product.name}</div>
                          <span style={{ fontSize: '0.7rem', color: styles.sidebarWidgetText?.color }}>SKU: {product.sku || 'Sem SKU'}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ color: styles.primary, fontSize: '0.85rem' }}>R$ {product.price.toFixed(2)}</strong>
                          <div style={{ fontSize: '0.7rem', color: product.quantity === 0 ? 'red' : styles.sidebarWidgetText?.color }}>Estoque: {product.quantity}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cart Table Container */}
          <div style={{
            backgroundColor: styles.cardBackground || '#fff',
            borderRadius: '12px', border: `1px solid ${styles.borderColor}`,
            boxShadow: styles.shadow, padding: '16px', flexGrow: 1,
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: styles.textMain, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={16} />
              Lista de Compras do Cliente
              <span style={{
                fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px',
                borderRadius: '20px', backgroundColor: `${styles.primary}18`, color: styles.primary
              }}>
                {totalItems} item(ns)
              </span>
            </h3>

            {cart.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '50px 20px', flexGrow: 1,
                color: styles.sidebarWidgetText?.color, textAlign: 'center'
              }}>
                <ShoppingCart size={42} style={{ color: `${styles.primary}30`, marginBottom: '12px' }} />
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>O caixa está vazio.</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Utilize o leitor de código de barras ou pesquise acima para adicionar itens.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Scrollable list */}
                <div style={{ maxHeight: '350px', overflowY: 'auto', flexGrow: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${styles.borderColor}`, color: styles.sidebarWidgetText?.color }}>
                        <th style={{ padding: '8px 4px' }}>Item</th>
                        <th style={{ padding: '8px 4px' }}>Produto</th>
                        <th style={{ padding: '8px 4px' }}>Unitário</th>
                        <th style={{ padding: '8px 4px', textAlign: 'center' }}>Qtd</th>
                        <th style={{ padding: '8px 4px', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '8px 4px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, idx) => (
                        <tr key={item.product.id} style={{ borderBottom: `1px solid ${styles.borderColor}`, color: styles.textMain }}>
                          <td style={{ padding: '10px 4px', color: styles.sidebarWidgetText?.color, fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '10px 4px' }}>
                            <div style={{ fontWeight: 600 }}>{item.product.name}</div>
                            <span style={{ fontSize: '0.68rem', color: styles.sidebarWidgetText?.color }}>SKU: {item.product.sku}</span>
                          </td>
                          <td style={{ padding: '10px 4px', fontWeight: 600 }}>R$ {item.product.price.toFixed(2)}</td>
                          <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: styles.isDark ? '#26293b' : '#eaecef', borderRadius: '6px', padding: '2px 6px' }}>
                              <button 
                                onClick={() => updateQuantity(item.product.id, -1)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: styles.textMain, padding: '2px' }}
                              >
                                <Minus size={12} />
                              </button>
                              <strong style={{ minWidth: '16px', fontSize: '0.85rem' }}>{item.quantity}</strong>
                              <button 
                                onClick={() => updateQuantity(item.product.id, 1)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: styles.textMain, padding: '2px' }}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 700, color: styles.primary }}>
                            R$ {(item.product.price * item.quantity).toFixed(2)}
                          </td>
                          <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                            <button
                              onClick={() => removeFromCart(item.product.id)}
                              className="btn-action-icon btn-action-danger"
                              title="Remover do carrinho"
                              aria-label={`Remover ${item.product.name}`}
                              style={{ width: '26px', height: '26px', padding: '4px' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer buttons of cart */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${styles.borderColor}`, paddingTop: '12px', marginTop: '12px' }}>
                  <button
                    onClick={clearCart}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      backgroundColor: 'transparent', border: `1px solid ${styles.borderColor}`,
                      padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: 600, color: styles.textMain
                    }}
                  >
                    <Trash2 size={14} /> Cancelar Cupom [F8]
                  </button>

                  <button
                    onClick={() => openRegisterModal('')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      backgroundColor: styles.primary, border: 'none',
                      padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: 600, color: '#fff'
                    }}
                  >
                    <PlusCircle size={14} /> Novo Produto [F4]
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Subtotal receipt card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {/* Supermarket Receipt Display */}
          <div style={{
            backgroundColor: '#1e2130', color: '#fff',
            borderRadius: '12px', padding: '20px',
            boxShadow: styles.shadowLg, display: 'flex', flexDirection: 'column',
            justifyContent: 'space-between', minHeight: '380px'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '12px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>CUPOM FISCAL</span>
                <span style={{ fontSize: '0.72rem', color: styles.secondary }}>LA VIOLA PDV</span>
              </div>

              {/* Main screen total */}
              <div style={{ margin: '24px 0', textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', display: 'block', textTransform: 'uppercase' }}>SUBTOTAL</span>
                <h1 style={{ fontSize: '2.4rem', fontWeight: 900, color: styles.secondary, margin: 0, fontFamily: 'monospace' }}>
                  R$ {subtotal.toFixed(2)}
                </h1>
              </div>

              {/* Receipt details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Qtd de Itens:</span>
                  <strong style={{ fontFamily: 'monospace' }}>{totalItems}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Desconto:</span>
                  <strong style={{ color: '#ff5c5c', fontFamily: 'monospace' }}>R$ 0,00</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px', marginTop: '4px' }}>
                  <span style={{ fontWeight: 700 }}>VALOR A PAGAR:</span>
                  <strong style={{ color: styles.secondary, fontWeight: 800, fontFamily: 'monospace' }}>R$ {subtotal.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            {/* Complete sale button */}
            <button
              onClick={openCheckout}
              disabled={cart.length === 0}
              className="btn-save"
              style={{
                width: '100%', padding: '14px 20px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                fontSize: '0.95rem', fontWeight: 800, border: 'none', textTransform: 'uppercase',
                marginTop: '30px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
              }}
            >
              <DollarSign size={18} />
              Cobrar Cliente [F9]
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: CHECKOUT & COBRANÇA */}
      {isCheckoutOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: deliveryType === 'delivery' ? '900px' : '500px', transition: 'max-width 0.3s ease' }} role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <div style={styles.modalHeader}>
              <h2 id="checkout-title" style={styles.modalTitle}>
                <DollarSign size={20} style={{ display: 'inline', marginRight: '6px', color: styles.primary }} />
                Fechamento de Caixa
              </h2>
              <button onClick={() => setIsCheckoutOpen(false)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            <div style={styles.modalForm}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: styles.isDark ? '#26293b' : '#f0f3f7', borderRadius: '10px', marginBottom: '16px' }}>
                <span style={{ fontWeight: 600, color: styles.textMain }}>Total da Venda:</span>
                <strong style={{ fontSize: '1.2rem', color: styles.primary, fontFamily: 'monospace' }}>R$ {subtotal.toFixed(2)}</strong>
              </div>

              {/* Delivery or Store Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...styles.formLabel, display: 'block', marginBottom: '8px' }}>Tipo de Venda *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setDeliveryType('store')}
                    onMouseEnter={() => setHoveredType('store')}
                    onMouseLeave={() => setHoveredType(null)}
                    style={{
                      padding: '12px 10px', borderRadius: '8px', border: '2px solid',
                      borderColor: deliveryType === 'store' ? styles.primary : (hoveredType === 'store' ? styles.primary : styles.borderColor),
                      backgroundColor: deliveryType === 'store' ? (styles.isDark ? '#334155' : '#e2e8f0') : (hoveredType === 'store' ? (styles.isDark ? '#1e293b' : '#f8fafc') : 'transparent'),
                      color: deliveryType === 'store' ? styles.primary : styles.textMain,
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      fontSize: '0.9rem', fontWeight: deliveryType === 'store' ? 800 : (hoveredType === 'store' ? 700 : 600), transition: 'all 0.2s ease',
                      boxShadow: deliveryType === 'store' ? `0 0 0 1px ${styles.primary}` : 'none',
                      transform: deliveryType === 'store' ? 'scale(1.03)' : (hoveredType === 'store' ? 'scale(1.01)' : 'scale(1)')
                    }}
                  >
                    <Store size={24} />
                    Na loja (Retirada)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryType('delivery')}
                    onMouseEnter={() => setHoveredType('delivery')}
                    onMouseLeave={() => setHoveredType(null)}
                    style={{
                      padding: '12px 10px', borderRadius: '8px', border: '2px solid',
                      borderColor: deliveryType === 'delivery' ? styles.primary : (hoveredType === 'delivery' ? styles.primary : styles.borderColor),
                      backgroundColor: deliveryType === 'delivery' ? (styles.isDark ? '#334155' : '#e2e8f0') : (hoveredType === 'delivery' ? (styles.isDark ? '#1e293b' : '#f8fafc') : 'transparent'),
                      color: deliveryType === 'delivery' ? styles.primary : styles.textMain,
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      fontSize: '0.9rem', fontWeight: deliveryType === 'delivery' ? 800 : (hoveredType === 'delivery' ? 700 : 600), transition: 'all 0.2s ease',
                      boxShadow: deliveryType === 'delivery' ? `0 0 0 1px ${styles.primary}` : 'none',
                      transform: deliveryType === 'delivery' ? 'scale(1.03)' : (hoveredType === 'delivery' ? 'scale(1.01)' : 'scale(1)')
                    }}
                  >
                    <Truck size={24} />
                    Entrega (Delivery)
                  </button>
                </div>
              </div>

              {/* Delivery Address Fields & Map */}
              {deliveryType === 'delivery' && (
                <div style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
                  <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: styles.sidebarWidgetText?.color, marginBottom: '8px' }}>
                    Endereço de Entrega *
                  </span>
                  
                  <DeliveryMap 
                    onAddressSelect={handleMapAddressSelect} 
                    leftContent={
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginTop: '4px' }}>
                          <input
                            type="text"
                            placeholder="Rua/Avenida *"
                            value={addressStreet}
                            readOnly
                            style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0, backgroundColor: styles.isDark ? '#334155' : '#f1f5f9', cursor: 'not-allowed', color: styles.isDark ? '#94a3b8' : '#64748b' }}
                          />
                          <input
                            type="text"
                            placeholder="Número *"
                            value={addressNumber}
                            readOnly
                            style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0, backgroundColor: styles.isDark ? '#334155' : '#f1f5f9', cursor: 'not-allowed', color: styles.isDark ? '#94a3b8' : '#64748b' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                          <input
                            type="text"
                            placeholder="Bairro *"
                            value={addressNeighborhood}
                            readOnly
                            style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0, backgroundColor: styles.isDark ? '#334155' : '#f1f5f9', cursor: 'not-allowed', color: styles.isDark ? '#94a3b8' : '#64748b' }}
                          />
                          <input
                            type="text"
                            placeholder="Ponto de Referência"
                            value={addressReference}
                            onChange={(e) => setAddressReference(e.target.value)}
                            style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px', marginBottom: 0 }}
                          />
                        </div>

                        {/* Delivery Time Selection */}
                        <div style={{ marginTop: '16px', borderTop: `1px dashed ${styles.borderColor}`, paddingTop: '12px' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: styles.textMain }}>
                            Qual horário?
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={deliveryAsap}
                                onChange={(e) => {
                                  setDeliveryAsap(e.target.checked);
                                  if (e.target.checked) setDeliveryTime('');
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                              O mais breve possível
                            </label>
                            <input
                              type="time"
                              value={deliveryTime}
                              onChange={(e) => {
                                setDeliveryTime(e.target.value);
                                if (e.target.value) setDeliveryAsap(false);
                              }}
                              style={{ ...styles.formInput, width: 'auto', fontSize: '0.8rem', padding: '4px 8px', marginBottom: 0 }}
                            />
                          </div>
                        </div>
                      </>
                    }
                  />
                </div>
              )}

              {/* Client Info Section (NF-e Ready) */}
              <div style={{ border: `1px solid ${styles.borderColor}`, borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: styles.sidebarWidgetText?.color, marginBottom: '8px' }}>
                  <User size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Dados do Cliente (Opcional - Necessário p/ NF-e)
                </span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 150px' }}>
                    <input
                      type="text"
                      placeholder="Nome do Cliente"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
                    />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <input
                      type="text"
                      placeholder="CPF ou CNPJ"
                      value={clientCPF}
                      onChange={(e) => setClientCPF(e.target.value)}
                      style={{ ...styles.formInput, width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method Select */}
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Forma de Pagamento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  {[
                    { id: 'Dinheiro', icon: <DollarSign size={15} />, label: 'Dinheiro' },
                    { id: 'Pix', icon: <Hash size={15} />, label: 'PIX' },
                    { id: 'Cartão de Crédito', icon: <CreditCard size={15} />, label: 'Crédito' },
                    { id: 'Cartão de Débito', icon: <CreditCard size={15} />, label: 'Débito' }
                  ].map(method => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      style={{
                        padding: '10px', borderRadius: '8px', border: '1px solid',
                        borderColor: paymentMethod === method.id ? styles.primary : styles.borderColor,
                        backgroundColor: paymentMethod === method.id ? (styles.isDark ? '#334155' : '#e2e8f0') : 'transparent',
                        color: paymentMethod === method.id ? styles.primary : styles.textMain,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        fontSize: '0.85rem', fontWeight: paymentMethod === method.id ? 700 : 600, transition: 'all 0.15s',
                        boxShadow: paymentMethod === method.id ? `0 0 0 1px ${styles.primary}` : 'none'
                      }}
                    >
                      {method.icon}
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* If Payment is Cash, input amount received to compute change */}
              {paymentMethod === 'Dinheiro' && (
                <div style={styles.formGroup}>
                  <label htmlFor="cash-received" style={styles.formLabel}>Valor Recebido (R$)</label>
                  <input
                    id="cash-received"
                    type="number"
                    step="0.01"
                    placeholder="Digite o valor pago pelo cliente..."
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    style={styles.formInput}
                    autoFocus
                  />
                  {amountPaid && parseFloat(amountPaid) < subtotal && (
                    <span style={{ display: 'block', color: 'hsl(0,75%,55%)', fontSize: '0.72rem', marginTop: '4px' }}>
                      O valor recebido é menor do que o total da venda.
                    </span>
                  )}
                  {amountPaid && parseFloat(amountPaid) >= subtotal && (
                    <div style={{
                      marginTop: '8px', padding: '10px', borderRadius: '6px',
                      backgroundColor: 'hsl(142,60%,45%,0.08)', border: '1px solid hsl(142,60%,45%,0.2)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Troco a Devolver:</span>
                      <strong style={{ fontSize: '1rem', color: 'hsl(142,60%,45%)', fontFamily: 'monospace' }}>
                        R$ {changeDue.toFixed(2)}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* Complete Action Buttons */}
              <div style={{ ...styles.modalActions, marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  style={{
                    padding: '10px 16px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`,
                    background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.85rem'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeSale}
                  disabled={
                    isLoading || 
                    !deliveryType || 
                    (deliveryType === 'delivery' && (!addressStreet.trim() || !addressNumber.trim() || !addressNeighborhood.trim())) ||
                    (paymentMethod === 'Dinheiro' && amountPaid !== '' && parseFloat(amountPaid) < subtotal)
                  }
                  className="btn-save"
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: 'none',
                    fontSize: '0.85rem', fontWeight: 700
                  }}
                >
                  {isLoading ? 'Finalizando...' : 'Finalizar e Emitir Log'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CADASTRO EXPRESSO DE PRODUTO */}
      {isRegisterOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '500px' }} role="dialog" aria-modal="true" aria-labelledby="reg-title">
            <div style={styles.modalHeader}>
              <h2 id="reg-title" style={styles.modalTitle}>
                <PlusCircle size={20} style={{ display: 'inline', marginRight: '6px', color: styles.primary }} />
                Cadastrar Produto Expresso (Na Hora)
              </h2>
              <button onClick={() => setIsRegisterOpen(false)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={handleRegisterProduct} style={styles.modalForm}>
              <div style={{
                fontSize: '0.75rem', color: 'hsl(36, 95%, 45%)', padding: '8px 12px',
                backgroundColor: 'hsl(36, 95%, 45%, 0.08)', borderRadius: '6px',
                border: '1px solid hsl(36, 95%, 45%, 0.2)', marginBottom: '14px',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <AlertTriangle size={14} />
                <span>O produto pesquisado/escaneado não foi localizado. Cadastre-o abaixo para adicioná-lo ao carrinho.</span>
              </div>

              {/* SKU Code (Barcode) */}
              <div style={styles.formGroup}>
                <label htmlFor="reg-sku" style={styles.formLabel}>Código SKU / Barras</label>
                <input
                  id="reg-sku"
                  type="text"
                  value={regSku}
                  onChange={(e) => setRegSku(e.target.value)}
                  style={styles.formInput}
                  placeholder="Código identificador do produto..."
                />
              </div>

              {/* Name */}
              <div style={styles.formGroup}>
                <label htmlFor="reg-name" style={styles.formLabel}>Nome do Produto *</label>
                <input
                  id="reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Ex: Ração Golden Especial Cães 15kg"
                  style={styles.formInput}
                  required
                  autoFocus={!regSku}
                />
              </div>

              {/* Category & Brand */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="reg-cat" style={styles.formLabel}>Categoria</label>
                  <select
                    id="reg-cat"
                    value={regCategory}
                    onChange={(e) => setRegCategory(e.target.value)}
                    style={styles.formInput}
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="reg-brand" style={styles.formLabel}>Marca</label>
                  <input
                    id="reg-brand"
                    type="text"
                    value={regBrand}
                    onChange={(e) => setRegBrand(e.target.value)}
                    placeholder="Ex: Premier"
                    style={styles.formInput}
                  />
                </div>
              </div>

              {/* Price & Cost Price */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="reg-price" style={styles.formLabel}>Preço de Venda (R$) *</label>
                  <input
                    id="reg-price"
                    type="number"
                    step="0.01"
                    value={regPrice}
                    onChange={(e) => setRegPrice(e.target.value)}
                    placeholder="0.00"
                    style={styles.formInput}
                    required
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="reg-cost" style={styles.formLabel}>Preço de Custo (R$)</label>
                  <input
                    id="reg-cost"
                    type="number"
                    step="0.01"
                    value={regCostPrice}
                    onChange={(e) => setRegCostPrice(e.target.value)}
                    placeholder="0.00"
                    style={styles.formInput}
                  />
                </div>
              </div>

              {/* Stock Qty & Min Stock */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="reg-qty" style={styles.formLabel}>Estoque Inicial</label>
                  <input
                    id="reg-qty"
                    type="number"
                    value={regQuantity}
                    onChange={(e) => setRegQuantity(e.target.value)}
                    style={styles.formInput}
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                  <label htmlFor="reg-min" style={styles.formLabel}>Estoque Mínimo</label>
                  <input
                    id="reg-min"
                    type="number"
                    value={regMinStock}
                    onChange={(e) => setRegMinStock(e.target.value)}
                    style={styles.formInput}
                  />
                </div>
              </div>

              {/* Fiscal/Tax Info Prep for NF-e */}
              <div style={{
                borderTop: `1px solid ${styles.borderColor}`, marginTop: '10px', paddingTop: '10px'
              }}>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: styles.sidebarWidgetText?.color, marginBottom: '8px' }}>
                  Dados Fiscais (Importante p/ Emissão de NF-e posterior)
                </span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                    <label htmlFor="reg-ncm" style={styles.formLabel}>Código NCM (8 dígitos)</label>
                    <input
                      id="reg-ncm"
                      type="text"
                      maxLength={8}
                      placeholder="Ex: 23091000"
                      value={regNcm}
                      onChange={(e) => setRegNcm(e.target.value)}
                      style={styles.formInput}
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: '1 1 50%' }}>
                    <label htmlFor="reg-origin" style={styles.formLabel}>Origem do Produto</label>
                    <select
                      id="reg-origin"
                      value={regOrigin}
                      onChange={(e) => setRegOrigin(e.target.value)}
                      style={styles.formInput}
                    >
                      <option value="0">0 - Nacional</option>
                      <option value="1">1 - Estrangeira (Importação Direta)</option>
                      <option value="2">2 - Estrangeira (Adquirida no Mercado Interno)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Save buttons */}
              <div style={{ ...styles.modalActions, marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  style={{
                    padding: '10px 16px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`,
                    background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.85rem'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-save"
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: 'none',
                    fontSize: '0.85rem', fontWeight: 700
                  }}
                >
                  {isLoading ? 'Cadastrando...' : 'Cadastrar e Add Carrinho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUCCESS CHECKOUT DETAILED SUMMARY */}
      {checkoutSuccess && lastSaleSummary && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '460px', textAlign: 'center', padding: '24px' }} role="dialog" aria-modal="true" aria-labelledby="success-title">
            <CheckCircle size={56} style={{ color: 'hsl(142,60%,45%)', margin: '10px auto' }} />
            
            <h2 id="success-title" style={{ ...styles.modalTitle, margin: '12px 0 6px', fontSize: '1.4rem' }}>
              Venda Finalizada!
            </h2>
            <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, marginBottom: '20px' }}>
              Os produtos foram baixados do estoque e a transação foi registrada.
            </p>

            {/* Recibo simples */}
            <div style={{
              textAlign: 'left', padding: '16px', borderRadius: '10px',
              backgroundColor: styles.isDark ? '#26293b' : '#f0f3f7',
              fontSize: '0.82rem', fontFamily: 'monospace', marginBottom: '20px',
              border: `1px dashed ${styles.borderColor}`
            }}>
              <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: '10px' }}>RESUMO DO COMPROVANTE</div>
              {lastSaleSummary.client.name && (
                <div style={{ marginBottom: '8px' }}>
                  <div>CLIENTE: {lastSaleSummary.client.name}</div>
                  <div>CPF/CNPJ: {lastSaleSummary.client.cpf_cnpj}</div>
                </div>
              )}
              <div style={{ borderBottom: '1px dashed #ccc', margin: '8px 0' }}></div>
              {lastSaleSummary.items.map((item: any) => (
                <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.quantity}x {item.name.substring(0, 24)}</span>
                  <span>R$ {item.subtotal.toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderBottom: '1px dashed #ccc', margin: '8px 0' }}></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>TOTAL A PAGAR:</span>
                <span>R$ {lastSaleSummary.subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>FORMA PGTO:</span>
                <span>{lastSaleSummary.payment_method.toUpperCase()}</span>
              </div>
              {lastSaleSummary.payment_method === 'Dinheiro' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>PAGO:</span>
                    <span>R$ {lastSaleSummary.amount_paid.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'hsl(142,60%,45%)', fontWeight: 700 }}>
                    <span>TROCO:</span>
                    <span>R$ {lastSaleSummary.change.toFixed(2)}</span>
                  </div>
                </>
              )}
              
              {/* Ready for NF-e note */}
              <div style={{
                marginTop: '15px', padding: '8px', borderRadius: '6px',
                backgroundColor: 'hsl(210, 85%, 45%, 0.1)', color: styles.primary,
                fontSize: '0.72rem', textAlign: 'center', fontWeight: 600, border: '1px solid hsl(210, 85%, 45%, 0.2)'
              }}>
                ✓ DADOS PRONTOS PARA EMISSÃO DE NF-e
              </div>
            </div>

            <button
              onClick={() => setCheckoutSuccess(false)}
              className="btn-save"
              style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', fontWeight: 700, width: '100%' }}
            >
              Ok, Nova Venda (F2)
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
