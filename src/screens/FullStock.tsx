import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminShell } from '@/components/AdminShell';
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
import { theme } from '@/constants/theme';

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
          <View style={stockStyles.compactSummary}>
            <View style={stockStyles.compactMetric}>
              <Text style={stockStyles.metricLabel}>PRODUTOS</Text>
              <Text style={stockStyles.metricValue}>{data.summary?.products || 0}</Text>
              <Text style={stockStyles.metricNote}>itens cadastrados</Text>
            </View>

            <View style={[stockStyles.compactMetric, stockStyles.warningMetric]}>
              <Text style={stockStyles.metricLabel}>ALERTAS</Text>
              <Text style={stockStyles.metricValue}>{data.summary?.alerts || 0}</Text>
              <Text style={stockStyles.metricNote}>no mínimo ou abaixo</Text>
            </View>

            <View style={[
              stockStyles.compactMetric,
              Number(data.summary?.negative || 0) > 0 && stockStyles.dangerMetric,
            ]}>
              <Text style={stockStyles.metricLabel}>NEGATIVOS</Text>
              <Text style={[
                stockStyles.metricValue,
                Number(data.summary?.negative || 0) > 0 && stockStyles.dangerText,
              ]}>
                {data.summary?.negative || 0}
              </Text>
              <Text style={stockStyles.metricNote}>exigem conferência</Text>
            </View>
          </View>

          <View style={stockStyles.searchPanel}>
            <View style={stockStyles.sectionHeading}>
              <View>
                <Text style={stockStyles.sectionTitle}>Produtos em estoque</Text>
                <Text style={stockStyles.sectionSubtitle}>
                  Busque por nome ou código para consultar e movimentar
                </Text>
              </View>
              <Text style={stockStyles.resultCount}>
                {filteredRows.length} de {data.summary?.products || 0}
              </Text>
            </View>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar produto por nome ou código"
            />
          </View>

          <View style={stockStyles.listCard}>
            {filteredRows.length > 0 ? filteredRows.map(
              (row: any, index: number) => (
                <View
                  key={String(row.id)}
                  style={[
                    stockStyles.productRow,
                    index === 0 && stockStyles.firstProductRow,
                  ]}
                >
                  <View style={stockStyles.productMain}>
                    <Text style={stockStyles.productName}>{row.name}</Text>
                    <Text style={stockStyles.productMeta}>
                      {row.code || 'Sem código'} • {row.category || 'Sem categoria'} • mínimo {row.minimum} {row.unit}
                    </Text>
                  </View>

                  <View style={stockStyles.balanceColumn}>
                    <Text style={stockStyles.balanceValue}>{row.stock} {row.unit}</Text>
                    <Text style={[
                      stockStyles.statusBadge,
                      row.status !== 'OK' && stockStyles.statusDanger,
                    ]}>
                      {row.status}
                    </Text>
                  </View>

                  <Pressable
                    style={stockStyles.miniAction}
                    onPress={() => start('STOCK_ENTRY', row)}
                  >
                    <Text style={stockStyles.miniActionText}>Movimentar</Text>
                  </Pressable>
                </View>
              )
            ) : (
              <Text style={stockStyles.emptyText}>
                {search
                  ? 'Nenhum produto encontrado para essa busca.'
                  : 'Nenhum produto cadastrado.'}
              </Text>
            )}
          </View>

          {(data.purchase_suggestions || []).length > 0 && (
            <View style={stockStyles.secondaryCard}>
              <Text style={stockStyles.secondaryTitle}>
                Sugestão de compra
              </Text>

              {data.purchase_suggestions.map((sug: any) => (
                <View
                  key={sug.code}
                  style={stockStyles.compactRow}
                >
                  <View style={stockStyles.productMain}>
                    <Text style={stockStyles.compactName}>
                      {sug.name}
                    </Text>

                    <Text style={stockStyles.compactMeta}>
                      {sug.code} • estoque {sug.stock} {sug.unit} •
                      máximo {sug.max_stock} {sug.unit}
                    </Text>
                  </View>

                  <View style={stockStyles.compactRight}>
                    <Text style={stockStyles.compactAmount}>
                      +{sug.suggested_qty} {sug.unit}
                    </Text>

                    {sug.below_minimum && (
                      <Text style={[stockStyles.statusBadge, stockStyles.statusDanger]}>
                        Abaixo do mínimo
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={stockStyles.secondaryCard}>
            <Text style={stockStyles.secondaryTitle}>
              Movimentações recentes
            </Text>

            {(data.movements || [])
              .slice(0, 50)
              .map((movement: any) => (
                <View
                  key={String(movement.id)}
                  style={stockStyles.compactRow}
                >
                  <View style={stockStyles.productMain}>
                    <Text style={stockStyles.compactName}>
                      {movement.product}
                    </Text>

                    <Text style={stockStyles.compactMeta}>
                      {formatDateBR(movement.date)}{' '}
                      {movement.time} •{' '}
                      {movement.type} •{' '}
                      {movement.reason}
                    </Text>
                  </View>

                  <Text style={stockStyles.compactAmount}>
                    {movement.delta > 0
                      ? '+'
                      : ''}
                    {movement.delta}
                  </Text>
                </View>
              ))}
          </View>

          <View style={stockStyles.valuationCard}>
            <View style={stockStyles.valuationHeading}>
              <Text style={stockStyles.valuationEyebrow}>VALORIZAÇÃO DO ESTOQUE</Text>
              <Text style={stockStyles.valuationDescription}>
                Totais calculados com os saldos e preços atuais
              </Text>
            </View>
            <View style={stockStyles.valuationValues}>
              <View style={stockStyles.valuationItem}>
                <Text style={stockStyles.valuationLabel}>Custo estocado</Text>
                <Text style={stockStyles.valuationValue}>
                  {money(data.summary?.cost_value || 0)}
                </Text>
              </View>
              <View style={stockStyles.valuationDivider} />
              <View style={stockStyles.valuationItem}>
                <Text style={stockStyles.valuationLabel}>Valor de venda estocado</Text>
                <Text style={stockStyles.valuationValue}>
                  {money(data.summary?.sale_value || 0)}
                </Text>
              </View>
            </View>
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

const stockStyles = StyleSheet.create({
  compactSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  compactMetric: {
    flex: 1,
    minWidth: 150,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  warningMetric: {
    backgroundColor: '#FFFCF3',
  },
  dangerMetric: {
    backgroundColor: '#FFF8F8',
    borderColor: '#F1CDCD',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: theme.colors.muted,
  },
  metricValue: {
    marginTop: 2,
    fontSize: 21,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },
  dangerText: {
    color: theme.colors.danger,
  },
  metricNote: {
    marginTop: 1,
    fontSize: 10,
    color: theme.colors.muted,
  },
  searchPanel: {
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  sectionHeading: {
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.muted,
  },
  resultCount: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.muted,
  },
  listCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  productRow: {
    minHeight: 58,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  firstProductRow: {
    borderTopWidth: 0,
  },
  productMain: {
    flex: 1,
    minWidth: 220,
  },
  productName: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
  },
  productMeta: {
    marginTop: 2,
    fontSize: 10,
    color: theme.colors.muted,
  },
  balanceColumn: {
    minWidth: 100,
    alignItems: 'flex-end',
  },
  balanceValue: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
  },
  statusBadge: {
    marginTop: 3,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 10,
    overflow: 'hidden',
    fontSize: 9,
    fontWeight: '900',
    color: theme.colors.success,
    backgroundColor: '#EAF7EF',
  },
  statusDanger: {
    color: theme.colors.danger,
    backgroundColor: '#FDECEC',
  },
  miniAction: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  miniActionText: {
    fontSize: 10,
    fontWeight: '900',
    color: theme.colors.text,
  },
  emptyText: {
    padding: 20,
    textAlign: 'center',
    fontSize: 12,
    color: theme.colors.muted,
  },
  secondaryCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  secondaryTitle: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },
  compactRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  compactName: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.colors.text,
  },
  compactMeta: {
    marginTop: 2,
    fontSize: 10,
    color: theme.colors.muted,
  },
  compactRight: {
    alignItems: 'flex-end',
  },
  compactAmount: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.colors.text,
  },
  valuationCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#DED7C7',
    borderRadius: 14,
    backgroundColor: '#F8F5ED',
  },
  valuationHeading: {
    marginBottom: 12,
  },
  valuationEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: theme.colors.muted,
  },
  valuationDescription: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.muted,
  },
  valuationValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 14,
  },
  valuationItem: {
    flex: 1,
    minWidth: 220,
  },
  valuationDivider: {
    width: 1,
    minHeight: 44,
    backgroundColor: '#DED7C7',
  },
  valuationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.muted,
  },
  valuationValue: {
    marginTop: 4,
    fontSize: 20,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },
});
