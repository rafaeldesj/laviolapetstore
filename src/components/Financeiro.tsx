import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PlusCircle, Trash2, Calendar, CreditCard } from 'lucide-react';
import { logAction } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';

interface FinanceiroProps {
  styles: any;
}

interface Transaction {
  id: string;
  date: string;
  type: 'entrada' | 'saida';
  description: string;
  value: number;
  payment_method: string;
}

export const Financeiro: React.FC<FinanceiroProps> = ({ styles }) => {
  const { user: currentUser } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New transaction state
  const [description, setDescription] = useState<string>('');
  const [type, setType] = useState<'entrada' | 'saida'>('entrada');
  const [value, setValue] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Dinheiro');

  const loadFinancialData = () => {
    // 1. Get POS Sales
    const pdvSales = JSON.parse(localStorage.getItem('laviola_pdv_sales') || '[]');
    const pdvTransactions: Transaction[] = pdvSales.map((sale: any) => ({
      id: sale.id || Math.random().toString(36).substring(2, 9),
      date: sale.timestamp || new Date().toISOString(),
      type: 'entrada' as const,
      description: `Venda PDV (Itens: ${sale.total_items})${sale.client?.name ? ` - Cliente: ${sale.client.name}` : ''}`,
      value: sale.subtotal,
      payment_method: sale.payment_method
    }));

    // 2. Get Custom Transactions
    const customTrans = JSON.parse(localStorage.getItem('laviola_custom_transactions') || '[]');
    const customTransactions: Transaction[] = customTrans.map((t: any) => ({
      ...t,
      value: parseFloat(t.value) || 0
    }));

    // Combine and sort by date descending
    const combined = [...pdvTransactions, ...customTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    setTransactions(combined);
  };

  useEffect(() => {
    loadFinancialData();
  }, []);

  // Compute current month totals
  const now = new Date();
  const currentMonthTrans = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const entradasMes = currentMonthTrans
    .filter(t => t.type === 'entrada')
    .reduce((acc, t) => acc + t.value, 0);

  const saidasMes = currentMonthTrans
    .filter(t => t.type === 'saida')
    .reduce((acc, t) => acc + t.value, 0);

  const saldoAtual = entradasMes - saidasMes;

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const valNum = parseFloat(value);
    if (!description.trim() || isNaN(valNum) || valNum <= 0) {
      setErrorMessage('Por favor, informe uma descrição válida e um valor maior que zero.');
      return;
    }

    const newTx: Transaction = {
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString(),
      type,
      description: description.trim(),
      value: valNum,
      payment_method: paymentMethod
    };

    try {
      const customTrans = JSON.parse(localStorage.getItem('laviola_custom_transactions') || '[]');
      customTrans.push(newTx);
      localStorage.setItem('laviola_custom_transactions', JSON.stringify(customTrans));

      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Operador',
        'Lançamento Financeiro',
        `Lançamento manual de ${type === 'entrada' ? 'Receita' : 'Despesa'}: "${newTx.description}" no valor de R$ ${newTx.value.toFixed(2)} (${newTx.payment_method})`
      );

      setDescription('');
      setValue('');
      setIsFormOpen(false);
      loadFinancialData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar o lançamento.');
    }
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    // Can only delete custom transactions, not POS sales direct records
    const customTrans = JSON.parse(localStorage.getItem('laviola_custom_transactions') || '[]');
    const isCustom = customTrans.some((t: any) => t.id === tx.id);

    if (!isCustom) {
      alert('Registros de Vendas do PDV não podem ser excluídos diretamente para manter a integridade fiscal.');
      return;
    }

    if (!confirm('Deseja realmente remover este lançamento financeiro?')) return;

    try {
      const filtered = customTrans.filter((t: any) => t.id !== tx.id);
      localStorage.setItem('laviola_custom_transactions', JSON.stringify(filtered));

      await logAction(
        currentUser?.email || '',
        currentUser?.name || 'Operador',
        'Lançamento Financeiro Excluído',
        `Lançamento manual removido: "${tx.description}" de R$ ${tx.value.toFixed(2)}`
      );

      loadFinancialData();
    } catch (err: any) {
      alert('Erro ao excluir transação.');
    }
  };

  const cards = [
    { label: 'Entradas do Mês', value: `R$ ${entradasMes.toFixed(2)}`, icon: <TrendingUp size={20} />, color: 'hsl(142, 60%, 45%)' },
    { label: 'Saídas do Mês',   value: `R$ ${saidasMes.toFixed(2)}`, icon: <TrendingDown size={20} />, color: 'hsl(0, 70%, 50%)' },
    { label: 'Saldo Atual',     value: `R$ ${saldoAtual.toFixed(2)}`, icon: <DollarSign size={20} />, color: saldoAtual >= 0 ? 'hsl(210, 85%, 45%)' : 'hsl(0, 70%, 50%)' },
  ];

  return (
    <section style={styles.contentSection} aria-labelledby="financeiro-heading">
      <div style={styles.crudHeader}>
        <div>
          <h2 id="financeiro-heading" style={styles.sectionTitle}>
            <Wallet size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle', color: styles.primary }} />
            Financeiro / Caixa
            <div style={styles.sectionTitleBar}></div>
          </h2>
          <p style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color, marginTop: '5px' }}>
            Entradas, saídas e controle financeiro consolidado do petshop.
          </p>
        </div>

        <button
          onClick={() => setIsFormOpen(true)}
          style={styles.btnAcc(false)}
        >
          <PlusCircle size={16} /> Novo Lançamento
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
        {cards.map(card => (
          <div key={card.label} style={{ ...styles.petCard, gap: '8px', boxShadow: styles.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ color: card.color }}>{card.icon}</div>
              <span style={{ fontSize: '0.85rem', color: styles.sidebarWidgetText?.color }}>{card.label}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Transactions List */}
      <div style={{
        marginTop: '30px', padding: '16px', backgroundColor: styles.cardBackground || '#fff',
        borderRadius: '12px', border: `1px solid ${styles.borderColor}`, boxShadow: styles.shadow
      }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: styles.textMain, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} style={{ color: styles.primary }} />
          Histórico Recente de Transações
        </h3>

        {transactions.length === 0 ? (
          <p style={{ textAlign: 'center', color: styles.sidebarWidgetText?.color, padding: '30px' }}>
            Nenhuma movimentação financeira registrada no momento.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${styles.borderColor}`, color: styles.sidebarWidgetText?.color }}>
                  <th style={{ padding: '10px 8px' }}>Data</th>
                  <th style={{ padding: '10px 8px' }}>Tipo</th>
                  <th style={{ padding: '10px 8px' }}>Descrição</th>
                  <th style={{ padding: '10px 8px' }}>Pagamento</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Valor</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => {
                  const isEntrada = tx.type === 'entrada';
                  const txDate = new Date(tx.date);
                  const formattedDate = txDate.toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  });
                  const isPdv = tx.description.startsWith('Venda PDV');

                  return (
                    <tr key={tx.id} style={{ borderBottom: `1px solid ${styles.borderColor}`, color: styles.textMain }}>
                      <td style={{ padding: '12px 8px', color: styles.sidebarWidgetText?.color, whiteSpace: 'nowrap' }}>{formattedDate}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px',
                          backgroundColor: isEntrada ? 'hsl(142,60%,45%,0.1)' : 'hsl(0,70%,50%,0.1)',
                          color: isEntrada ? 'hsl(142,60%,45%)' : 'hsl(0,70%,50%)',
                          textTransform: 'uppercase'
                        }}>
                          {tx.type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 500 }}>{tx.description}</td>
                      <td style={{ padding: '12px 8px', display: 'flex', alignItems: 'center', gap: '4px', border: 'none', height: '100%' }}>
                        <CreditCard size={12} style={{ color: styles.sidebarWidgetText?.color }} />
                        {tx.payment_method}
                      </td>
                      <td style={{
                        padding: '12px 8px', textAlign: 'right', fontWeight: 700,
                        color: isEntrada ? 'hsl(142,60%,45%)' : 'hsl(0,70%,50%)'
                      }}>
                        {isEntrada ? '+' : '-'} R$ {tx.value.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        {!isPdv && (
                          <button
                            onClick={() => handleDeleteTransaction(tx)}
                            className="btn-action-icon btn-action-danger"
                            title="Remover lançamento"
                            style={{ width: '26px', height: '26px', padding: '4px' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: NOVO LANÇAMENTO */}
      {isFormOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '450px' }} role="dialog" aria-modal="true" aria-labelledby="form-title">
            <div style={styles.modalHeader}>
              <h2 id="form-title" style={styles.modalTitle}>Novo Lançamento de Caixa</h2>
              <button onClick={() => setIsFormOpen(false)} style={styles.modalCloseBtn(false)} aria-label="Fechar">✕</button>
            </div>

            {errorMessage && (
              <div style={{ color: 'red', fontSize: '0.8rem', marginBottom: '12px' }}>{errorMessage}</div>
            )}

            <form onSubmit={handleAddTransaction} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label htmlFor="tx-type" style={styles.formLabel}>Tipo de Lançamento</label>
                <select
                  id="tx-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as 'entrada' | 'saida')}
                  style={styles.formInput}
                >
                  <option value="entrada">Entrada (Receita / Aporte)</option>
                  <option value="saida">Saída (Despesa / Retirada)</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="tx-desc" style={styles.formLabel}>Descrição *</label>
                <input
                  id="tx-desc"
                  type="text"
                  placeholder="Ex: Pagamento conta de energia"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={styles.formInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="tx-val" style={styles.formLabel}>Valor (R$) *</label>
                <input
                  id="tx-val"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  style={styles.formInput}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="tx-method" style={styles.formLabel}>Forma de Movimentação</label>
                <select
                  id="tx-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={styles.formInput}
                >
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Pix">PIX</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                </select>
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  style={{
                    padding: '10px 16px', borderRadius: '8px', border: `1px solid ${styles.borderColor}`,
                    background: 'none', color: styles.textMain, cursor: 'pointer', fontSize: '0.85rem'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-save"
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: 'none',
                    fontSize: '0.85rem', fontWeight: 700
                  }}
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
