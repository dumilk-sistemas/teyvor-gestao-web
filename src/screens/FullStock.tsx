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
      setError('');

      const payload: any = {
        productId: form.productId,
        reason: form.reason,
      };

      if (form.type === 'STOCK_ADJUST') {
        payload.newStock = Number(
          String(form.newStock || '0').replace(
            ',',
            '.'
          )
        );
      } else {
        payload.qty = Number(
          String(form.qty || '0').replace(
            ',',
            '.'
          )
        );

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
      setError(
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
        <>
          <ActionButton
            label="+ Entrada"
            tone="gold"
            onPress={() =>
              start('STOCK_ENTRY')
            }
          />

          <ActionButton
            label="− Saída"
            tone="dark"
            onPress={() =>
              start('STOCK_EXIT')
            }
          />

          <ActionButton
            label="Ajustar saldo"
            tone="danger"
            onPress={() =>
              start('STOCK_ADJUST')
            }
          />
        </>
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
        title={
          form.type === 'STOCK_ENTRY'
            ? 'Entrada de estoque'
            : form.type === 'STOCK_EXIT'
              ? 'Saída de estoque'
              : 'Ajuste de inventário'
        }
        onCancel={() =>
          setOpen(false)
        }
        onSave={save}
        busy={busy}
      >
        <Choice
          label="Produto"
          value={form.productId}
          onChange={(value) =>
            set('productId', value)
          }
          options={(data?.rows || []).map(
            (row: any) => ({
              label: `${row.name} (${row.stock})`,
              value: String(row.id),
            })
          )}
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
