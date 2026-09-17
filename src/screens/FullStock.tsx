import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import {
  ActionButton,
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
import { formatDateBR } from '@/utils/date';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

export default function FullStock() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
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
      [row.name, row.code]
        .filter(Boolean)
        .some((field) =>
          String(field).toLocaleLowerCase('pt-BR').includes(term)
        )
    );
  }, [data, search]);

  const [form, setForm] = useState({
    type: 'STOCK_ENTRY',
    productId: '',
    qty: '1',
    newStock: '0',
    cost: '',
    reason: '',
  });

  const selectedProduct = useMemo(
    () =>
      (data?.rows || []).find(
        (row: any) => String(row.id) === form.productId
      ),
    [data, form.productId]
  );

  async function load() {
    try {
      setLoading(true);
      setError('');

      const result = await getFull('stock');
      setData(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar estoque.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const set = (
    key: string,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const start = (
    type: string,
    row?: any
  ) => {
    setModalError('');
    setForm({
      type,
      productId: String(
        row?.id ||
          data?.rows?.[0]?.id ||
          ''
      ),
      qty: '1',
      newStock: String(
        row?.stock || 0
      ),
      cost: '',
      reason: '',
    });

    setOpen(true);
  };

  async function save() {
    try {
      setBusy(true);
      setModalError('');

      if (!form.productId) {
        setModalError('Selecione o produto.');
        return;
      }

      const parsedQty = Number(String(form.qty || '').replace(',', '.'));
      const parsedStock = Number(String(form.newStock || '').replace(',', '.'));

      if (form.type === 'STOCK_ADJUST' && !Number.isFinite(parsedStock)) {
        setModalError('Informe um saldo físico válido.');
        return;
      }

      if (form.type !== 'STOCK_ADJUST' && (!Number.isFinite(parsedQty) || parsedQty <= 0)) {
        setModalError('A quantidade deve ser maior que zero.');
        return;
      }

      if (form.reason.trim().length < 3) {
        setModalError('Informe o motivo ou a referência da movimentação.');
        return;
      }

      const payload: any = {
        productId: form.productId,
        reason: form.reason,
      };

      if (form.type === 'STOCK_ADJUST') {
        payload.newStock = parsedStock;
      } else {
        payload.qty = parsedQty;

        if (form.cost) {
          payload.cost = Number(
            String(form.cost).replace(
              ',',
              '.'
            )
          );
        }
      }

      await enqueue(
        'stock',
        form.type,
        payload
      );

      setOpen(false);
      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setModalError(
        e instanceof Error
          ? e.message
          : 'Falha ao enviar movimento.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Estoque"
      subtitle="Entradas, saídas, ajustes e histórico"
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
          label="+ Nova movimentação"
          tone="gold"
          onPress={() => start('STOCK_ENTRY')}
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
              label="Produtos"
              value={String(
                data.summary?.products || 0
              )}
            />

            <MetricCard
              label="Alertas"
              value={String(
                data.summary?.alerts || 0
              )}
            />

            <MetricCard
              label="Negativos"
              value={String(
                data.summary?.negative || 0
              )}
            />

            <MetricCard
              label="Custo estocado"
              value={money(
                data.summary?.cost_value || 0
              )}
            />
          </View>

          {(data.purchase_suggestions || []).length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>
                Sugestão de compra
              </Text>

              {data.purchase_suggestions.map((sug: any) => (
                <View
                  key={sug.code}
                  style={s.row}
                >
                  <View style={s.main}>
                    <Text style={s.name}>
                      {sug.name}
                    </Text>

                    <Text style={s.meta}>
                      {sug.code} • estoque {sug.stock} {sug.unit} •
                      máximo {sug.max_stock} {sug.unit}
                    </Text>
                  </View>

                  <View style={s.right}>
                    <Text style={s.amount}>
                      +{sug.suggested_qty} {sug.unit}
                    </Text>

                    {sug.below_minimum && (
                      <Text style={[s.badge, s.badBadge]}>
                        Abaixo do mínimo
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por código ou nome"
          />

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Saldos
            </Text>

            {filteredRows.length > 0 ? filteredRows.map(
              (row: any) => (
                <View
                  key={String(row.id)}
                  style={s.row}
                >
                  <View style={s.main}>
                    <Text style={s.name}>
                      {row.name}
                    </Text>

                    <Text style={s.meta}>
                      {row.code} • mínimo{' '}
                      {row.minimum} {row.unit}
                    </Text>
                  </View>

                  <View style={s.right}>
                    <Text style={s.amount}>
                      {row.stock} {row.unit}
                    </Text>

                    <Text
                      style={[
                        s.badge,
                        row.status !== 'OK' &&
                          s.badBadge,
                      ]}
                    >
                      {row.status}
                    </Text>

                    <ActionButton
                      label="Movimentar"
                      tone="plain"
                      onPress={() => start('STOCK_ENTRY', row)}
                    />
                  </View>
                </View>
              )
            ) : (
              <Text style={s.empty}>
                {search
                  ? 'Nenhum produto encontrado para essa busca.'
                  : 'Nenhum produto cadastrado.'}
              </Text>
            )}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Movimentações recentes
            </Text>

            {(data.movements || [])
              .slice(0, 50)
              .map((movement: any) => (
                <View
                  key={String(movement.id)}
                  style={s.row}
                >
                  <View style={s.main}>
                    <Text style={s.name}>
                      {movement.product}
                    </Text>

                    <Text style={s.meta}>
                      {formatDateBR(movement.date)}{' '}
                      {movement.time} •{' '}
                      {movement.type} •{' '}
                      {movement.reason}
                    </Text>
                  </View>

                  <Text style={s.amount}>
                    {movement.delta > 0
                      ? '+'
                      : ''}
                    {movement.delta}
                  </Text>
                </View>
              ))}
          </View>
        </>
      )}

      <FormModal
        visible={open}
        title="Movimentação de estoque"
        onCancel={() =>
          setOpen(false)
        }
        onSave={save}
        busy={busy}
        errorText={modalError}
      >
        <SearchablePicker
          label="Produto *"
          value={form.productId}
          onChange={(value) =>
            set('productId', value)
          }
          options={(data?.rows || []).map(
            (row: any) => ({
              label: row.name,
              value: String(row.id),
              description: `${row.code || 'Sem código'} • saldo ${row.stock} ${row.unit}`,
            })
          )}
          placeholder="Busque o produto"
          searchPlaceholder="Buscar por nome ou código"
        />

        {!!selectedProduct && (
          <Notice
            text={`Saldo atual: ${selectedProduct.stock} ${selectedProduct.unit} • mínimo: ${selectedProduct.minimum} ${selectedProduct.unit}`}
          />
        )}

        <SearchablePicker
          label="Tipo de movimentação *"
          value={form.type}
          onChange={(value) => set('type', value)}
          options={[
            {
              label: 'Entrada',
              value: 'STOCK_ENTRY',
              description: 'Soma a quantidade ao saldo atual',
            },
            {
              label: 'Saída',
              value: 'STOCK_EXIT',
              description: 'Subtrai a quantidade do saldo atual',
            },
            {
              label: 'Balanço / inventário',
              value: 'STOCK_ADJUST',
              description: 'Define o saldo físico exato contado',
            },
          ]}
          searchPlaceholder="Buscar tipo de movimentação"
        />

        {form.type ===
        'STOCK_ADJUST' ? (
          <Field
            label="Novo saldo físico *"
            value={form.newStock}
            onChangeText={(value) =>
              set(
                'newStock',
                value
              )
            }
            keyboardType="decimal-pad"
          />
        ) : (
          <Field
            label="Quantidade *"
            value={form.qty}
            onChangeText={(value) =>
              set('qty', value)
            }
            keyboardType="decimal-pad"
          />
        )}

        {form.type ===
          'STOCK_ENTRY' && (
          <Field
            label="Novo custo unitário (opcional)"
            value={form.cost}
            onChangeText={(value) =>
              set('cost', value)
            }
            keyboardType="decimal-pad"
          />
        )}

        <Field
          label="Motivo / referência *"
          value={form.reason}
          onChangeText={(value) =>
            set('reason', value)
          }
          multiline
        />
      </FormModal>
    </AdminShell>
  );
}
