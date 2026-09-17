import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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

function addDaysISO(iso: string, amount: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type PeriodKey = 'today' | '7days' | '30days' | 'all';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'hoje',
  '7days': 'últimos 7 dias',
  '30days': 'últimos 30 dias',
  all: 'todo o período',
};

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
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [search, setSearch] = useState('');

  const range = useMemo(() => {
    const today = todayDateString();
    if (period === 'today') return { start: today, end: today };
    if (period === '7days') return { start: addDaysISO(today, -6), end: today };
    if (period === '30days') return { start: addDaysISO(today, -29), end: today };
    return null;
  }, [period]);

  const periodRows = useMemo(() => {
    const rows = data?.rows || [];
    if (!range) return rows;
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
            <Choice
              label="Período"
              value={period}
              onChange={(value) => setPeriod(value as PeriodKey)}
              options={[
                { label: 'Hoje', value: 'today' },
                { label: '7 dias', value: '7days' },
                { label: '30 dias', value: '30days' },
                { label: 'Tudo', value: 'all' },
              ]}
            />
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
              label={`Faturamento — ${PERIOD_LABELS[period]}`}
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
              color="#B8862F"
              background="#FBF3E0"
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
              <Text style={s.cardTitle}>
                Formas de pagamento — {PERIOD_LABELS[period]}
              </Text>

              {Object.entries(visibleSummary.payment_totals)
                .sort(([, a]: any, [, b]: any) => b - a)
                .map(([method, value]: any) => (
                  <View
                    key={method}
                    style={paymentChartStyles.row}
                  >
                    <View style={paymentChartStyles.labelRow}>
                      <Text style={paymentChartStyles.label}>
                        {method}
                      </Text>
                      <Text style={paymentChartStyles.value}>
                        {money(value)}
                      </Text>
                    </View>

                    <View style={paymentChartStyles.track}>
                      <View
                        style={[
                          paymentChartStyles.bar,
                          {
                            width: `${
                              visibleSummary.total > 0
                                ? Math.round(
                                    (value / visibleSummary.total) * 100
                                  )
                                : 0
                            }%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
            </View>
          )}

          <View style={s.card}>
            <View style={salesStyles.listHeading}>
              <View>
                <Text style={salesStyles.listTitle}>Histórico de vendas</Text>
                <Text style={salesStyles.listSubtitle}>
                  {visibleRows.length} resultado(s) — {PERIOD_LABELS[period]}
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
                    <View style={s.toolbar}>
                      <ActionButton
                        label="Editar"
                        tone="plain"
                        onPress={() => edit(row)}
                      />

                      <ActionButton
                        label="Cancelar"
                        tone="danger"
                        onPress={() => cancel(row)}
                      />
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
  row: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  value: {
    fontSize: 13,
    fontWeight: '900',
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
    backgroundColor: theme.colors.text,
  },
});

const salesStyles = StyleSheet.create({
  filterHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: theme.colors.muted,
  },
  filterTitle: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontSize: 10,
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
    fontWeight: '700',
    color: theme.colors.text,
  },
});
