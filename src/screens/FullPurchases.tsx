import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import {
  ActionButton,
  Choice,
  Field,
  FormModal,
  Notice,
  formStyles as s,
} from '@/components/FormKit';
import {
  commandMessage,
  enqueue,
  getFull,
} from '@/services/fullApi';
import { useToast } from '@/components/Toast';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const today = () =>
  new Date().toISOString().slice(0, 10);

export default function FullPurchases() {
  const [data, setData] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const term = search.trim().toLocaleLowerCase('pt-BR');

    if (!term) {
      return rows;
    }

    return rows.filter((row: any) =>
      [row.supplier, row.document]
        .filter(Boolean)
        .some((field) =>
          String(field).toLocaleLowerCase('pt-BR').includes(term)
        )
    );
  }, [data, search]);

  const [form, setForm] = useState({
    supplierId: '',
    document: '',
    date: today(),
    dueDate: today(),
    notes: '',
    generatePayable: 'true',
  });

  const [line, setLine] = useState({
    productId: '',
    qty: '1',
    cost: '0,00',
  });

  const [lines, setLines] = useState<any[]>([]);

  async function load() {
    try {
      setLoading(true);
      setError('');

      const purchaseData = await getFull('purchases');

      // Fornecedores e produtos só são usados para montar um novo
      // recebimento. Perfis sem acesso a esses módulos ainda
      // conseguem consultar as compras normalmente.
      const [supplierData, productData] = await Promise.all([
        getFull('suppliers').catch(() => null),
        getFull('products').catch(() => null),
      ]);

      setData(purchaseData);
      setSuppliers(supplierData?.rows || []);
      setProducts(productData?.rows || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar compras.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const start = () => {
    const activeSupplier = suppliers.find(
      (supplier) => supplier.active
    );

    const firstProduct = products[0];

    setForm({
      supplierId: String(activeSupplier?.id || ''),
      document: '',
      date: today(),
      dueDate: today(),
      notes: '',
      generatePayable: 'true',
    });

    setLine({
      productId: String(firstProduct?.id || ''),
      qty: '1',
      cost: String(
        firstProduct?.cost || 0
      ).replace('.', ','),
    });

    setLines([]);
    setOpen(true);
  };

  const set = (
    key: string,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const changeProduct = (
    id: string
  ) => {
    const product = products.find(
      (item) => String(item.id) === id
    );

    setLine((current) => ({
      ...current,
      productId: id,
      cost: String(
        product?.cost || 0
      ).replace('.', ','),
    }));
  };

  const addLine = () => {
    const qty = Number(
      String(line.qty || '0').replace(',', '.')
    );

    const cost = Number(
      String(line.cost || '0').replace(',', '.')
    );

    if (
      !line.productId ||
      qty <= 0 ||
      cost < 0
    ) {
      setError(
        'Confira produto, quantidade e custo.'
      );
      return;
    }

    setError('');

    setLines((current) => {
      const existing = current.find(
        (item) =>
          String(item.productId) ===
          String(line.productId)
      );

      if (existing) {
        return current.map((item) =>
          item === existing
            ? {
                ...item,
                qty: item.qty + qty,
                cost,
              }
            : item
        );
      }

      return [
        ...current,
        {
          productId: line.productId,
          qty,
          cost,
        },
      ];
    });
  };

  async function save() {
    try {
      setBusy(true);
      setError('');

      if (!form.supplierId) {
        setError('Selecione o fornecedor.');
        return;
      }

      if (lines.length === 0) {
        setError(
          'Adicione pelo menos um produto ao recebimento.'
        );
        return;
      }

      await enqueue(
        'purchases',
        'PURCHASE_CREATE',
        {
          purchase: {
            supplierId: form.supplierId,
            document: form.document,
            date: form.date,
            dueDate: form.dueDate,
            notes: form.notes,
            generatePayable:
              form.generatePayable === 'true',
            items: lines,
          },
        }
      );

      setOpen(false);
      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao enviar recebimento.'
      );
    } finally {
      setBusy(false);
    }
  }

  const total = lines.reduce(
    (sum, item) =>
      sum + item.qty * item.cost,
    0
  );

  return (
    <AdminShell
      title="Compras / Recebimentos"
      subtitle="Mercadorias, estoque e conta a pagar em uma operação"
      syncText={
        data?.last_sync_at
          ? `Atualizado em ${new Date(
              data.last_sync_at
            ).toLocaleString('pt-BR')}`
          : 'Aguardando sincronização'
      }
      refreshing={loading}
      onRefresh={load}
      syncNote
      headerActions={
        <ActionButton
          label="+ Novo recebimento"
          tone="gold"
          onPress={start}
        />
      }
    >
      {!!error && (
        <Notice
          text={error}
          tone="error"
        />
      )}

      {!!data && (
        <>
          <View style={s.grid}>
            <MetricCard
              label="Recebimentos"
              value={String(
                data.summary?.receipts || 0
              )}
            />

            <MetricCard
              label="Comprado no mês"
              value={money(
                data.summary?.month_total || 0
              )}
            />

            <MetricCard
              label="Total histórico"
              value={money(
                data.summary?.historic_total || 0
              )}
            />

            <MetricCard
              label="Fornecedores ativos"
              value={String(
                data.summary?.active_suppliers || 0
              )}
            />
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por fornecedor ou documento"
          />

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Histórico
            </Text>

            {filteredRows.length > 0 ? (
              filteredRows.map(
                (row: any) => (
                  <View
                    key={String(row.id)}
                    style={s.row}
                  >
                    <View style={s.main}>
                      <Text style={s.name}>
                        {row.supplier}
                      </Text>

                      <Text style={s.meta}>
                        {row.date} •{' '}
                        {row.document ||
                          'Sem documento'}{' '}
                        • {row.items}{' '}
                        item(ns) • vence{' '}
                        {row.due_date}
                      </Text>
                    </View>

                    <View style={s.right}>
                      <Text style={s.amount}>
                        {money(row.total)}
                      </Text>

                      <Text style={s.badge}>
                        {row.payable_status}
                      </Text>
                    </View>
                  </View>
                )
              )
            ) : (
              <Text style={s.empty}>
                {search
                  ? 'Nenhum recebimento encontrado para essa busca.'
                  : 'Nenhum recebimento registrado.'}
              </Text>
            )}
          </View>
        </>
      )}

      <FormModal
        visible={open}
        title="Novo recebimento"
        onCancel={() => setOpen(false)}
        onSave={save}
        saveLabel="Confirmar recebimento"
        busy={busy}
        wide
      >
        <Choice
          label="Fornecedor *"
          value={form.supplierId}
          onChange={(value) =>
            set('supplierId', value)
          }
          options={suppliers
            .filter(
              (supplier) =>
                supplier.active
            )
            .map((supplier) => ({
              label: supplier.name,
              value: String(
                supplier.id
              ),
            }))}
        />

        <Field
          label="NF / Documento"
          value={form.document}
          onChangeText={(value) =>
            set('document', value)
          }
        />

        <Field
          label="Data do recebimento *"
          value={form.date}
          onChangeText={(value) =>
            set('date', value)
          }
          placeholder="AAAA-MM-DD"
        />

        <Field
          label="Vencimento"
          value={form.dueDate}
          onChangeText={(value) =>
            set('dueDate', value)
          }
          placeholder="AAAA-MM-DD"
        />

        <Choice
          label="Gerar conta a pagar"
          value={form.generatePayable}
          onChange={(value) =>
            set(
              'generatePayable',
              value
            )
          }
          options={[
            {
              label: 'Sim',
              value: 'true',
            },
            {
              label: 'Não',
              value: 'false',
            },
          ]}
        />

        <Text style={s.cardTitle}>
          Adicionar produto
        </Text>

        <Choice
          label="Produto"
          value={line.productId}
          onChange={changeProduct}
          options={products.map(
            (product) => ({
              label: product.name,
              value: String(product.id),
            })
          )}
        />

        <Field
          label="Quantidade"
          value={line.qty}
          onChangeText={(value) =>
            setLine((current) => ({
              ...current,
              qty: value,
            }))
          }
          keyboardType="decimal-pad"
        />

        <Field
          label="Custo unitário"
          value={line.cost}
          onChangeText={(value) =>
            setLine((current) => ({
              ...current,
              cost: value,
            }))
          }
          keyboardType="decimal-pad"
        />

        <ActionButton
          label="Adicionar item"
          tone="dark"
          onPress={addLine}
        />

        {lines.map((item, index) => {
          const product = products.find(
            (candidate) =>
              String(candidate.id) ===
              String(item.productId)
          );

          return (
            <View
              key={`${item.productId}-${index}`}
              style={s.row}
            >
              <View style={s.main}>
                <Text style={s.name}>
                  {product?.name ||
                    item.productId}
                </Text>

                <Text style={s.meta}>
                  {item.qty} ×{' '}
                  {money(item.cost)}
                </Text>
              </View>

              <ActionButton
                label="Remover"
                tone="danger"
                onPress={() =>
                  setLines((current) =>
                    current.filter(
                      (
                        _,
                        itemIndex
                      ) =>
                        itemIndex !==
                        index
                    )
                  )
                }
              />
            </View>
          );
        })}

        <Text style={s.amount}>
          Total: {money(total)}
        </Text>

        <Field
          label="Observações"
          value={form.notes}
          onChangeText={(value) =>
            set('notes', value)
          }
          multiline
        />
      </FormModal>
    </AdminShell>
  );
}