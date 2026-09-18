import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import {
  ActionButton,
  Choice,
  Field,
  FormModal,
  Notice,
  SearchablePicker,
  formStyles as s,
} from '@/components/FormKit';
import {
  commandMessage,
  enqueue,
  getFull,
} from '@/services/fullApi';
import { useToast } from '@/components/Toast';
import { theme } from '@/constants/theme';
import { formatDateBR } from '@/utils/date';
import { formatPeriodLabel, PeriodCalendar, type PeriodPreset } from '@/components/PeriodCalendar';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

function todayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function FullSales() {
  const [data, setData] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('edit');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});
  const [items, setItems] = useState<any[]>([]);
  const [addProduct, setAddProduct] = useState('');
  const today = todayDateString();
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [, setPeriodPreset] = useState<PeriodPreset>('today');
  const [search, setSearch] = useState('');
  const [actionSaleId, setActionSaleId] = useState<string | null>(null);

  const range = useMemo(() => ({ start: periodStart, end: periodEnd }), [periodStart, periodEnd]);
  const periodLabel = formatPeriodLabel(periodStart, periodEnd);

  const periodRows = useMemo(() => {
    const rows = data?.rows || [];
    return rows.filter((row: any) => row.date >= range.start && row.date <= range.end);
  }, [data, range]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return periodRows
      .filter((row: any) => {
        if (!term) return true;
        return [row.number, row.customer, row.summary, row.payment, row.status]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase('pt-BR').includes(term)
          );
      })
      .sort((a: any, b: any) =>
        `${b.date || ''} ${b.time || ''}`.localeCompare(
          `${a.date || ''} ${a.time || ''}`
        )
      );
  }, [periodRows, search]);

  const visibleSummary = useMemo(() => {
    const valid = visibleRows.filter((row: any) => row.status === 'Concluída');
    const total = valid.reduce((sum: number, row: any) => sum + (row.total || 0), 0);
    const paymentTotals: Record<string, number> = {};
    valid.forEach((row: any) => {
      const method = row.payment || 'Outros';
      paymentTotals[method] = (paymentTotals[method] || 0) + (row.total || 0);
    });
    return {
      total,
      valid_sales: valid.length,
      ticket: valid.length ? total / valid.length : 0,
      excluded_sales: visibleRows.length - valid.length,
      payment_totals: paymentTotals,
    };
  }, [visibleRows]);

  async function load() {
    try {
      setLoading(true);
      setError('');

      const salesData = await getFull('sales');

      // Produtos e clientes só são usados para montar/corrigir uma
      // venda. Perfis sem acesso a esses módulos (ex.: Caixa) ainda
      // conseguem consultar a lista de vendas normalmente.
      const [productsData, customersData] = await Promise.all([
        getFull('products').catch(() => null),
        getFull('customers').catch(() => null),
      ]);

      setData(salesData);
      setProducts(productsData?.rows || []);
      setCustomers(customersData?.rows || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar vendas.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const set = (key: string, value: string) => {
    setForm((current: any) => ({
      ...current,
      [key]: value,
    }));
  };

  const edit = (row: any) => {
    setModalError('');
    setMode('edit');

    setForm({
      id: row.id,
      number: row.number,
      discount: String(row.discount || 0).replace('.', ','),
      payment: row.payment || 'Outros',
      customerId: String(row.customer_id || ''),
      reason: '',
    });

    const saleItems = (row.items_detail || []).map(
      (item: any) => ({
        ...item,
        qty: String(item.qty).replace('.', ','),
        price: String(item.price).replace('.', ','),
      })
    );

    setItems(saleItems);
    setAddProduct(String(products[0]?.id || ''));
    setOpen(true);
  };

  const cancel = (row: any) => {
    setModalError('');
    setMode('cancel');

    setForm({
      id: row.id,
      number: row.number,
      reason: '',
    });

    setOpen(true);
  };

  const updateItem = (
    index: number,
    key: string,
    value: string
  ) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item
      )
    );
  };

  const addItem = () => {
    const product = products.find(
      (item) => String(item.id) === addProduct
    );

    if (!product) {
      return;
    }

    setItems((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          String(item.id) === String(product.id)
      );

      if (existingIndex >= 0) {
        return current.map((item, index) => {
          if (index !== existingIndex) {
            return item;
          }

          const currentQty = Number(
            String(item.qty).replace(',', '.')
          );

          return {
            ...item,
            qty: String(currentQty + 1),
          };
        });
      }

      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          code: product.code,
          qty: '1',
          price: String(product.price).replace('.', ','),
        },
      ];
    });
  };

  async function save() {
    try {
      setBusy(true);
      setError('');
      setModalError('');

      const reason = String(form.reason || '').trim();
      if (reason.length < 3) {
        setModalError('Informe o motivo com pelo menos 3 caracteres.');
        return;
      }

      if (mode !== 'cancel') {
        if (!items.length) {
          setModalError('A venda precisa ter pelo menos um item.');
          return;
        }
        const invalidItem = items.some((item) => {
          const qty = Number(String(item.qty).replace(',', '.'));
          const price = Number(String(item.price).replace(',', '.'));
          return !item.id || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0;
        });
        if (invalidItem) {
          setModalError('Revise produto, quantidade e preço dos itens.');
          return;
        }
      }

      if (mode === 'cancel') {
        await enqueue(
          'sales',
          'SALE_CANCEL',
          {
            id: form.id,
            reason,
          }
        );
      } else {
        await enqueue(
          'sales',
          'SALE_UPDATE',
          {
            id: form.id,
            items: items.map((item) => ({
              id: item.id,
              qty: Number(
                String(item.qty).replace(',', '.')
              ),
              price: Number(
                String(item.price).replace(',', '.')
              ),
            })),
            discount: Number(
              String(form.discount || '0').replace(',', '.')
            ),
            payment: form.payment,
            customerId: form.customerId || null,
            reason,
          }
        );
      }

      setOpen(false);
      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      const message = e instanceof Error
        ? e.message
        : 'Falha ao enviar alteração da venda.';
      setModalError(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Vendas"
      subtitle="Desempenho comercial, pagamentos e histórico de vendas"
      syncText={
        data?.last_sync_at
          ? `Atualizado em ${new Date(
              data.last_sync_at
            ).toLocaleString('pt-BR')}`
          : 'Aguardando sincronização'
      }
      refreshing={loading}
      onRefresh={load}
      headerActions={null}
      syncNote
    >
      {!!error && (
        <Notice
          text={error}
          tone="error"
        />
      )}

      {!!data && (
        <>
          <View style={s.card}>
            <View style={salesStyles.filterHeader}>
              <View>
                <Text style={salesStyles.eyebrow}>ANÁLISE DE VENDAS</Text>
                <Text style={salesStyles.filterTitle}>Visão do período</Text>
              </View>
              <Text style={salesStyles.filterHint}>
                Os indicadores acompanham os filtros abaixo
              </Text>
            </View>
            <View style={salesStyles.periodRow}>
              <PeriodCalendar
                start={periodStart}
                end={periodEnd}
                maxDate={today}
                compact
                label="Período das vendas"
                onApply={(start, end, preset) => {
                  setPeriodStart(start);
                  setPeriodEnd(end);
                  setPeriodPreset(preset);
                }}
              />
              <Text style={salesStyles.periodSummary}>Resultados de {periodLabel}</Text>
            </View>
            <View style={salesStyles.searchWrap}>
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por venda, cliente, produto ou pagamento"
              />
            </View>
          </View>

          <View style={s.grid}>
            <MetricCard
              label="Faturamento"
              value={money(visibleSummary.total)}
              note="Somente vendas concluídas"
              icon="dollar-sign"
              color="#25835A"
              background="#EAF7F0"
            />

            <MetricCard
              label="Vendas válidas"
              value={String(visibleSummary.valid_sales)}
              note="Operações concluídas"
              icon="shopping-bag"
              color="#3568B8"
              background="#EEF4FC"
            />

            <MetricCard
              label="Ticket médio"
              value={money(visibleSummary.ticket)}
              note="Valor médio por venda"
              icon="trending-up"
              color="#256D6B"
              background="#E9F5F4"
            />

            <MetricCard
              label="Canceladas"
              value={String(visibleSummary.excluded_sales)}
              note="Operações não concluídas"
              icon="x-circle"
              color="#C84E4E"
              background="#FFF3F3"
            />
          </View>

          {Object.keys(visibleSummary.payment_totals).length > 0 && (
            <View style={s.card}>
              <View style={paymentChartStyles.header}>
                <View style={paymentChartStyles.headerMain}>
                  <View style={paymentChartStyles.icon}>
                    <Feather name="credit-card" size={17} color="#3568B8" />
                  </View>
                  <View>
                    <Text style={paymentChartStyles.title}>Formas de pagamento</Text>
                    <Text style={paymentChartStyles.subtitle}>Participação no faturamento de {periodLabel}</Text>
                  </View>
                </View>
                <View style={paymentChartStyles.totalBlock}>
                  <Text style={paymentChartStyles.totalLabel}>TOTAL RECEBIDO</Text>
                  <Text style={paymentChartStyles.totalValue}>{money(visibleSummary.total)}</Text>
                </View>
              </View>

              {Object.entries(visibleSummary.payment_totals)
                .sort(([, a]: any, [, b]: any) => b - a)
                .map(([method, value]: any, index) => {
                  const palette = ['#3568B8', '#256D6B', '#25835A', '#6A70A8', '#66717D'];
                  const color = palette[index % palette.length];
                  const percent = visibleSummary.total > 0 ? (value / visibleSummary.total) * 100 : 0;
                  return (
                  <View
                    key={method}
                    style={paymentChartStyles.row}
                  >
                    <View style={paymentChartStyles.labelRow}>
                      <Text style={paymentChartStyles.label}>
                        <Text style={[paymentChartStyles.dot, { color }]}>● </Text>{method}
                      </Text>
                      <Text style={paymentChartStyles.value}>
                        {percent.toFixed(1).replace('.', ',')}%  ·  {money(value)}
                      </Text>
                    </View>

                    <View style={paymentChartStyles.track}>
                      <View
                        style={[
                          paymentChartStyles.bar,
                          {
                            width: `${Math.round(percent)}%`,
                            backgroundColor: color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );})}
            </View>
          )}

          <View style={s.card}>
            <View style={salesStyles.listHeading}>
              <View>
                <Text style={salesStyles.listTitle}>Histórico de vendas</Text>
                <Text style={salesStyles.listSubtitle}>
                  {visibleRows.length} resultado(s) — {periodLabel}
                </Text>
              </View>
            </View>

            {visibleRows.length > 0 && (
              <View style={salesStyles.tableHeader}>
                <Text style={[salesStyles.tableHeaderText, salesStyles.saleColumn]}>VENDA / DATA</Text>
                <Text style={[salesStyles.tableHeaderText, salesStyles.detailColumn]}>CLIENTE / PAGAMENTO</Text>
                <Text style={[salesStyles.tableHeaderText, salesStyles.totalColumn]}>TOTAL / STATUS</Text>
              </View>
            )}

            {visibleRows.length === 0 && (
              <Text style={s.empty}>
                Nenhuma venda no período.
              </Text>
            )}

            {visibleRows.map((row: any) => (
              <View
                key={String(row.id)}
                style={s.row}
              >
                <View style={s.main}>
                  <Text style={s.name}>Venda #{row.number}</Text>

                  <Text style={s.meta}>
                    {formatDateBR(row.date)} às {row.time} • {row.summary}
                  </Text>
                  <Text style={salesStyles.customerMeta}>
                    {row.customer || 'Cliente não identificado'} • {row.payment}
                  </Text>
                </View>

                <View style={s.right}>
                  <Text style={s.amount}>
                    {money(row.total)}
                  </Text>

                  <Text
                    style={[
                      s.badge,
                      row.status !== 'Concluída' &&
                        s.badBadge,
                    ]}
                  >
                    {row.status}
                  </Text>

                  {row.status === 'Concluída' && (
                    <View style={salesStyles.actionWrap}>
                      <Pressable style={salesStyles.actionTrigger} onPress={() => setActionSaleId((current) => current === String(row.id) ? null : String(row.id))}>
                        <Feather name="more-horizontal" size={18} color={theme.colors.text} />
                        <Text style={salesStyles.actionTriggerText}>Ações</Text>
                      </Pressable>
                      {actionSaleId === String(row.id) && (
                        <View style={salesStyles.actionMenu}>
                          <Pressable style={salesStyles.actionItem} onPress={() => { setActionSaleId(null); edit(row); }}><Feather name="edit-2" size={14} color={theme.colors.text} /><Text style={salesStyles.actionItemText}>Editar venda</Text></Pressable>
                          <Pressable style={salesStyles.actionItem} onPress={() => { setActionSaleId(null); cancel(row); }}><Feather name="x-circle" size={14} color={theme.colors.danger} /><Text style={salesStyles.actionDangerText}>Cancelar venda</Text></Pressable>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <FormModal
        visible={open}
        title={
          mode === 'cancel'
            ? `Cancelar venda #${form.number}`
            : `Editar venda #${form.number}`
        }
        onCancel={() => setOpen(false)}
        onSave={save}
        saveLabel={
          mode === 'cancel'
            ? 'Confirmar cancelamento'
            : 'Salvar venda'
        }
        busy={busy}
        wide
      >
        {!!modalError && (
          <Notice text={modalError} tone="error" />
        )}

        {mode === 'cancel' ? (
          <Field
            label="Motivo do cancelamento *"
            value={form.reason || ''}
            onChangeText={(value) =>
              set('reason', value)
            }
            multiline
          />
        ) : (
          <>
            <Text style={s.cardTitle}>
              Itens
            </Text>

            {items.map((item, index) => (
              <View
                key={`${item.id}-${index}`}
                style={s.row}
              >
                <View style={s.main}>
                  <Text style={s.name}>
                    {item.name}
                  </Text>

                  <Field
                    label="Quantidade"
                    value={String(item.qty)}
                    onChangeText={(value) =>
                      updateItem(
                        index,
                        'qty',
                        value
                      )
                    }
                    keyboardType="decimal-pad"
                  />

                  <Field
                    label="Preço"
                    value={String(item.price)}
                    onChangeText={(value) =>
                      updateItem(
                        index,
                        'price',
                        value
                      )
                    }
                    keyboardType="decimal-pad"
                  />
                </View>

                <ActionButton
                  label="Remover"
                  tone="danger"
                  onPress={() =>
                    setItems((current) =>
                      current.filter(
                        (_, itemIndex) =>
                          itemIndex !== index
                      )
                    )
                  }
                />
              </View>
            ))}

            <SearchablePicker
              label="Adicionar produto"
              value={addProduct}
              onChange={setAddProduct}
              options={products.map((product) => ({
                label: product.name,
                value: String(product.id),
                description: `${product.code || 'Sem código'} • ${money(product.price)}`,
              }))}
              placeholder="Selecione o produto"
              searchPlaceholder="Buscar por nome ou código"
            />

            <ActionButton
              label="Adicionar item"
              tone="dark"
              onPress={addItem}
            />

            <Field
              label="Desconto"
              value={String(form.discount || '')}
              onChangeText={(value) =>
                set('discount', value)
              }
              keyboardType="decimal-pad"
            />

            <Choice
              label="Pagamento"
              value={form.payment || 'Outros'}
              onChange={(value) =>
                set('payment', value)
              }
              options={[
                'Dinheiro',
                'Pix',
                'Débito',
                'Crédito',
                'Outros',
                'Misto',
              ].map((value) => ({
                label: value,
                value,
              }))}
            />

            <SearchablePicker
              label="Cliente"
              value={form.customerId || ''}
              onChange={(value) =>
                set('customerId', value)
              }
              options={[
                {
                  label: 'Não identificado',
                  value: '',
                  description: 'Venda sem cliente vinculado',
                },
                ...customers
                  .filter(
                    (customer) =>
                      customer.active
                  )
                  .map((customer) => ({
                    label: customer.name,
                    value: String(customer.id),
                    description: customer.document || customer.phone || 'Cliente ativo',
                  })),
              ]}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente"
            />

            <Field
              label="Motivo da edição *"
              value={form.reason || ''}
              onChangeText={(value) =>
                set('reason', value)
              }
              multiline
            />
          </>
        )}
      </FormModal>
    </AdminShell>
  );
}

const paymentChartStyles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    padding: 15,
  },
  headerMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: '#EDF3FC',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  title: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 17,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: theme.colors.muted,
  },
  totalBlock: {
    alignItems: 'flex-end',
  },
  totalLabel: {
    color: theme.colors.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.45,
  },
  totalValue: {
    color: theme.colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    marginTop: 2,
  },
  row: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderBottomColor: '#F1F2F3',
    borderBottomWidth: 1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  dot: { fontSize: 12 },
  value: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F0EFEA',
    overflow: 'hidden',
  },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3568B8',
  },
});

const salesStyles = StyleSheet.create({
  periodRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  periodSummary: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    color: theme.colors.muted,
  },
  filterHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: theme.colors.muted,
  },
  filterTitle: {
    marginTop: 3,
    fontSize: 18,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },
  filterHint: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  listHeading: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listTitle: {
    fontSize: 18,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },
  listSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: theme.colors.muted,
  },
  tableHeader: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#F7F6F2',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tableHeaderText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: theme.colors.muted,
  },
  saleColumn: { flex: 1.4 },
  detailColumn: { flex: 1.2 },
  totalColumn: { width: 150, textAlign: 'right' },
  customerMeta: {
    marginTop: 5,
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.text,
  },
  actionWrap: { marginTop: 7, zIndex: 5, alignItems: 'flex-end' },
  actionTrigger: { minHeight: 34, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionTriggerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.colors.text },
  actionMenu: { width: 175, marginTop: 6, zIndex: 20, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, backgroundColor: '#FFF', overflow: 'hidden' },
  actionItem: { minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#F0EFEA' },
  actionItemText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.text },
  actionDangerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.danger },
});
