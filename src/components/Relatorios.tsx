import React, { useState, useEffect } from 'react';
import { BarChart3, PawPrint, CalendarDays, Wallet, Package, CreditCard, PieChart } from 'lucide-react';
import { supabase, mockSupabaseDb, isSupabaseConfigured } from '../supabaseClient';
import type { Product } from '../supabaseClient';

interface RelatoriosProps {
  styles: any;
}

export const Relatorios: React.FC<RelatoriosProps> = ({ styles }) => {
  const [petsCount, setPetsCount] = useState<number>(0);
  const [appointmentsCount, setAppointmentsCount] = useState<number>(0);
  const [receitaMes, setReceitaMes] = useState<number>(0);
  const [stockTotal, setStockTotal] = useState<number>(0);
  
  // Chart states
  const [paymentStats, setPaymentStats] = useState<Record<string, number>>({});
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      // 1. Get Pets Count
      let totalPets = 0;
      if (isSupabaseConfigured && supabase) {
        const { count, error } = await supabase.from('pets').select('*', { count: 'exact', head: true });
        if (!error && count !== null) totalPets = count;
      } else {
        const { data } = await mockSupabaseDb.getAllPets();
        totalPets = data?.length || 0;
      }
      setPetsCount(totalPets);

      // 2. Get Appointments for Current Month
      let totalAppts = 0;
      const now = new Date();
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('appointments').select('date');
        if (!error && data) {
          totalAppts = data.filter((a: any) => {
            const d = new Date(a.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length;
        }
      } else {
        const { data } = await mockSupabaseDb.getAppointments('', true);
        if (data) {
          totalAppts = data.filter((a: any) => {
            const d = new Date(a.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length;
        }
      }
      setAppointmentsCount(totalAppts);

      // 3. Get Products Stock Count
      let totalStockItems = 0;
      let loadedProducts: Product[] = [];
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('products').select('*');
        if (!error && data) loadedProducts = data;
      } else {
        const { data } = await mockSupabaseDb.getProducts();
        if (data) loadedProducts = data;
      }
      totalStockItems = loadedProducts.reduce((acc, p) => acc + (p.quantity || 0), 0);
      setStockTotal(totalStockItems);

      // 4. Calculate Revenue & Payment/Category Stats from Sales
      const pdvSales = JSON.parse(localStorage.getItem('laviola_pdv_sales') || '[]');
      const customTrans = JSON.parse(localStorage.getItem('laviola_custom_transactions') || '[]');

      // Compute total monthly revenue
      let currentMonthRevenue = 0;
      const pmStats: Record<string, number> = { 'Dinheiro': 0, 'Pix': 0, 'Cartão de Crédito': 0, 'Cartão de Débito': 0 };
      const catStats: Record<string, number> = {};

      // Analyze PDV sales
      pdvSales.forEach((sale: any) => {
        const d = new Date(sale.timestamp || new Date());
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          currentMonthRevenue += sale.subtotal;
          
          // Payment stats
          const method = sale.payment_method || 'Dinheiro';
          pmStats[method] = (pmStats[method] || 0) + sale.subtotal;

          // Category stats based on items
          if (sale.items) {
            sale.items.forEach((item: any) => {
              // We need to look up category from our products list or default to 'Outros'
              const productRef = loadedProducts.find(p => p.id === item.product_id || p.sku === item.sku);
              const cat = productRef?.category || 'Outros';
              catStats[cat] = (catStats[cat] || 0) + item.subtotal;
            });
          }
        }
      });

      // Analyze manual entries
      customTrans.forEach((tx: any) => {
        const d = new Date(tx.date || new Date());
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && tx.type === 'entrada') {
          const val = parseFloat(tx.value) || 0;
          currentMonthRevenue += val;
          const method = tx.payment_method || 'Dinheiro';
          pmStats[method] = (pmStats[method] || 0) + val;
          
          catStats['Serviços / Diversos'] = (catStats['Serviços / Diversos'] || 0) + val;
        }
      });

      setReceitaMes(currentMonthRevenue);
      setPaymentStats(pmStats);
      setCategoryStats(catStats);

    } catch (e) {
      console.error('Error loading report stats:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, []);

  const kpis = [
    { label: 'Pets Cadastrados', value: isLoading ? '...' : petsCount, icon: <PawPrint size={22} />, color: styles.primary },
    { label: 'Agendamentos no Mês', value: isLoading ? '...' : appointmentsCount, icon: <CalendarDays size={22} />, color: 'hsl(210, 85%, 45%)' },
    { label: 'Receita do Mês', value: isLoading ? '...' : `R$ ${receitaMes.toFixed(2)}`, icon: <Wallet size={22} />, color: 'hsl(142, 60%, 45%)' },
    { label: 'Produtos no Estoque', value: isLoading ? '...' : stockTotal, icon: <Package size={22} />, color: 'hsl(36, 95%, 50%)' },
  ];

  // Colors for CSS progress charts
  const chartColors = [
    'hsl(210, 85%, 45%)',
    'hsl(142, 60%, 45%)',
    'hsl(36, 95%, 50%)',
    'hsl(280, 70%, 55%)',
    'hsl(0, 70%, 50%)',
    'hsl(180, 70%, 40%)'
  ];

  return (
    <section style={styles.contentSection} aria-labelledby="relatorios-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="relatorios-heading" style={styles.sectionTitle}>
            <BarChart3 size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Relatórios Gerais
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Visão geral em tempo real das métricas do petshop.
          </p>
        </div>
      </div>

      {/* KPIs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '24px' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{ ...styles.petCard, textAlign: 'center', gap: '12px', boxShadow: styles.shadow }}>
            <div style={{ color: kpi.color, margin: '0 auto' }}>{kpi.icon}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Distribution Charts using pure CSS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: window.innerWidth >= 768 ? '1fr 1fr' : '1fr',
        gap: '20px',
        marginTop: '30px'
      }}>
        {/* Payment Methods Chart */}
        <div style={{
          padding: '20px', backgroundColor: styles.cardBackground || '#fff',
          borderRadius: '12px', border: `1px solid ${styles.borderColor}`, boxShadow: styles.shadow
        }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: styles.textMain, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CreditCard size={16} style={{ color: styles.primary }} />
            Faturamento por Método de Pagamento (Mês Atual)
          </h3>

          {receitaMes === 0 ? (
            <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, textAlign: 'center', padding: '40px 0' }}>
              Nenhum faturamento registrado para gerar estatísticas.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Object.entries(paymentStats)
                .sort((a, b) => b[1] - a[1])
                .map(([method, val], idx) => {
                  const percentage = receitaMes > 0 ? (val / receitaMes) * 100 : 0;
                  if (val === 0) return null;
                  return (
                    <div key={method}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px', fontWeight: 600 }}>
                        <span style={{ color: styles.textMain }}>{method}</span>
                        <span style={{ color: styles.primary }}>R$ {val.toFixed(2)} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: styles.isDark ? '#26293b' : '#eaecef', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${percentage}%`, height: '100%',
                          backgroundColor: chartColors[idx % chartColors.length],
                          borderRadius: '4px', transition: 'width 0.5s ease'
                        }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Categories revenue Distribution */}
        <div style={{
          padding: '20px', backgroundColor: styles.cardBackground || '#fff',
          borderRadius: '12px', border: `1px solid ${styles.borderColor}`, boxShadow: styles.shadow
        }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: styles.textMain, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PieChart size={16} style={{ color: styles.primary }} />
            Vendas por Categoria de Produto (Mês Atual)
          </h3>

          {receitaMes === 0 ? (
            <p style={{ fontSize: '0.82rem', color: styles.sidebarWidgetText?.color, textAlign: 'center', padding: '40px 0' }}>
              Nenhuma venda registrada para gerar estatísticas de categoria.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Object.entries(categoryStats)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, val], idx) => {
                  const percentage = receitaMes > 0 ? (val / receitaMes) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px', fontWeight: 600 }}>
                        <span style={{ color: styles.textMain }}>{cat}</span>
                        <span style={{ color: styles.primary }}>R$ {val.toFixed(2)} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: styles.isDark ? '#26293b' : '#eaecef', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${percentage}%`, height: '100%',
                          backgroundColor: chartColors[(idx + 2) % chartColors.length],
                          borderRadius: '4px', transition: 'width 0.5s ease'
                        }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
