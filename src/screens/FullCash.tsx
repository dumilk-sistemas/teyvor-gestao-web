import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import {
  ActionButton,
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

const methods = [
  'Dinheiro',
  'Pix',
  'Débito',
  'Crédito',
  'Outros',
];

export default function FullCash() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('open');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedClosing, setSelectedClosing] = useState<any>(null);
  const [search, setSearch] = useState('');

  const filteredClosings = useMemo(() => {
    const closings = data?.closings || [];
    const term = search.trim().toLocaleLowerCase('pt-BR');

    if (!term) {
      return closings;
    }

    return closings.filter((closing: any) =>
      [closing.code, closing.operator]
        .filter(Boolean)
        .some((field) =>
          String(field).toLocaleLowerCase('pt-BR').includes(term)
        )
    );
  }, [data, search]);

  async function load() {
    try {
      setLoading(true);
      setError('');

      const result = await getFull('cash');
      setData(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar caixa.'
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
    setForm((current: any) => ({
      ...current,
      [key]: value,
    }));
  };

  const startOpen = () => {
    setMode('open');

    setForm({
      openingFloat: '',
      note: '',
    });

    setOpen(true);
  };

  const startMove = (
    type: string
  ) => {
    setMode('movement');

    setForm({
      type,
      amount: '',
      reason: '',
    });

    setOpen(true);
  };

  const startClose = () => {
    setMode('close');

    const counted: any = {
      note: '',
    };

    methods.forEach((method) => {
      counted[method] = String(
        data?.current?.expected?.[method] ?? ''
      ).replace('.', ',');
    });

    setForm(counted);
    setOpen(true);
  };

  const showClosingDetails = (closing: any) => {
    setSelectedClosing(closing);
    setDetailsOpen(true);
  };

  const closeClosingDetails = () => {
    setDetailsOpen(false);
    setSelectedClosing(null);
  };

  async function save() {
    try {
      setBusy(true);
      setError('');

      if (mode === 'open') {
        const openingFloat = Number(
          String(
            form.openingFloat || '0'
          ).replace(',', '.')
        );

        if (
          !Number.isFinite(openingFloat) ||
          openingFloat < 0
        ) {
          setError(
            'Informe um valor válido para o fundo de abertura.'
          );
          return;
        }

        await enqueue(
          'cash',
          'CASH_OPEN',
          {
            openingFloat,
            note: form.note || '',
          }
        );
      } else if (
        mode === 'movement'
      ) {
        const amount = Number(
          String(
            form.amount || '0'
          ).replace(',', '.')
        );

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          setError(
            'Informe um valor maior que zero.'
          );
          return;
        }

        if (
          !String(
            form.reason || ''
          ).trim()
        ) {
          setError(
            'Informe o motivo da movimentação.'
          );
          return;
        }

        await enqueue(
          'cash',
          'CASH_MOVEMENT',
          {
            type: form.type,
            amount,
            reason: form.reason,
          }
        );
      } else {
        const counted: any = {};

        methods.forEach((method) => {
          counted[method] = Number(
            String(
              form[method] || '0'
            ).replace(',', '.')
          );
        });

        await enqueue(
          'cash',
          'CASH_CLOSE',
          {
            counted,
            note: form.note || '',
          }
        );
      }

      setOpen(false);
      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao enviar operação do caixa.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Caixa"
      subtitle="Abertura, sangria, suprimento e fechamento remoto"
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
      headerActions={null}
    >
      {!!error && (
        <Notice
          text={error}
          tone="error"
        />
      )}

{!!data && (
        <>
          {data.current ? (
            <>
              <View style={s.card}>
                <Text style={s.cardTitle}>
                  CAIXA ABERTO •{' '}
                  {data.current.code}
                </Text>

                <View
                  style={
                    cashStyles.sessionInfo
                  }
                >
                  <Text style={s.meta}>
                    Aberto por{' '}
                    {data.current.operator} •{' '}
                    {data.current.date}
                  </Text>
                </View>

                <View
                  style={
                    cashStyles.actions
                  }
                >
                  <View
                    style={
                      cashStyles.actionItem
                    }
                  >
                    <ActionButton
                      label="Suprimento"
                      tone="gold"
                      onPress={() =>
                        startMove(
                          'SUPRIMENTO'
                        )
                      }
                    />
                  </View>

                  <View
                    style={
                      cashStyles.actionItem
                    }
                  >
                    <ActionButton
                      label="Sangria"
                      tone="danger"
                      onPress={() =>
                        startMove(
                          'SANGRIA'
                        )
                      }
                    />
                  </View>

                  <View
                    style={
                      cashStyles.actionItem
                    }
                  >
                    <ActionButton
                      label="Fechar caixa"
                      tone="dark"
                      onPress={startClose}
                    />
                  </View>
                </View>
              </View>

              <View style={s.grid}>
                <MetricCard
                  label="Fundo inicial"
                  value={money(
                    data.current
                      .opening_float
                  )}
                />

                <MetricCard
                  label="Vendas da sessão"
                  value={String(
                    data.current.sales || 0
                  )}
                  note={money(
                    data.current
                      .total_sales
                  )}
                />

                <MetricCard
                  label="Dinheiro esperado"
                  value={money(
                    data.current
                      .expected_cash
                  )}
                />

                <MetricCard
                  label="Sangrias"
                  value={money(
                    data.current
                      .withdrawals
                  )}
                />
              </View>

              {Math.abs(
                data.current.opening_difference || 0
              ) > 0.009 && (
                <Notice
                  text={`Abertura divergente: esperado x informado teve diferença de ${money(
                    data.current.opening_difference
                  )}${
                    data.current.opening_divergence_reason
                      ? ` • Motivo: ${data.current.opening_divergence_reason}`
                      : ''
                  }`}
                  tone="error"
                />
              )}

              {(data.current.movements || []).length > 0 && (
                <View style={s.card}>
                  <Text style={s.cardTitle}>
                    Movimentações de hoje
                  </Text>

                  {data.current.movements.map(
                    (m: any) => (
                      <View
                        key={String(m.id)}
                        style={s.row}
                      >
                        <View style={s.main}>
                          <Text style={s.name}>
                            {m.type}
                          </Text>

                          <Text style={s.meta}>
                            {m.time} •{' '}
                            {m.operator || 'Operador'}
                            {m.reason
                              ? ` • ${m.reason}`
                              : ''}
                          </Text>
                        </View>

                        <View style={s.right}>
                          <Text style={s.amount}>
                            {money(m.amount)}
                          </Text>
                        </View>
                      </View>
                    )
                  )}
                </View>
              )}
            </>
          ) : (
            <View style={s.card}>
              <Text style={s.cardTitle}>
                CAIXA FECHADO
              </Text>

              <View
                style={
                  cashStyles.closedArea
                }
              >
                <Text style={s.meta}>
                  Nenhuma sessão aberta.
                </Text>

                <View
                  style={
                    cashStyles.openButton
                  }
                >
                  <ActionButton
                    label="Abrir caixa"
                    tone="gold"
                    onPress={startOpen}
                  />
                </View>
              </View>
            </View>
          )}

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por código ou operador"
          />

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Fechamentos
            </Text>

            {filteredClosings
              .length > 0 ? (
              filteredClosings.map(
                (closing: any) => (
                  <View
                    key={String(
                      closing.id
                    )}
                    style={s.row}
                  >
                    <View style={s.main}>
                      <Text style={s.name}>
                        {closing.code}
                      </Text>

                      <Text style={s.meta}>
                        {closing.date} •{' '}
                        {closing.sales}{' '}
                        venda(s) •{' '}
                        {closing.operator}
                      </Text>

                      <View
                        style={
                          cashStyles.detailButton
                        }
                      >
                        <ActionButton
                          label="Ver detalhes"
                          tone="plain"
                          onPress={() =>
                            showClosingDetails(
                              closing
                            )
                          }
                        />
                      </View>
                    </View>

                    <View style={s.right}>
                      <Text
                        style={s.amount}
                      >
                        {money(
                          closing.total_sales
                        )}
                      </Text>

                      <Text
                        style={[
                          s.badge,
                          Math.abs(
                            closing.difference ||
                              0
                          ) > 0.009 &&
                            s.badBadge,
                        ]}
                      >
                        Dif.{' '}
                        {money(
                          closing.difference
                        )}
                      </Text>
                    </View>
                  </View>
                )
              )
            ) : (
              <Text style={s.empty}>
                {search
                  ? 'Nenhum fechamento encontrado para essa busca.'
                  : 'Nenhum fechamento.'}
              </Text>
            )}
          </View>
        </>
      )}

      <FormModal
        visible={open}
        title={
          mode === 'open'
            ? 'Abrir caixa'
            : mode === 'movement'
              ? form.type ===
                'SANGRIA'
                ? 'Sangria'
                : 'Suprimento'
              : 'Fechar caixa'
        }
        onCancel={() =>
          setOpen(false)
        }
        onSave={save}
        saveLabel={
          mode === 'close'
            ? 'Confirmar fechamento'
            : 'Confirmar'
        }
        busy={busy}
      >
        {mode === 'open' ? (
          <>
            <Field
              label="Fundo de abertura"
              value={String(
                form.openingFloat ?? ''
              )}
              onChangeText={(value) =>
                set(
                  'openingFloat',
                  value
                )
              }
              placeholder="0,00"
              keyboardType="decimal-pad"
            />

            <Field
              label="Observação"
              value={String(
                form.note ?? ''
              )}
              onChangeText={(value) =>
                set('note', value)
              }
            />
          </>
        ) : mode ===
          'movement' ? (
          <>
            <Field
              label="Valor"
              value={String(
                form.amount ?? ''
              )}
              onChangeText={(value) =>
                set('amount', value)
              }
              placeholder="0,00"
              keyboardType="decimal-pad"
            />

            <Field
              label="Motivo *"
              value={String(
                form.reason ?? ''
              )}
              onChangeText={(value) =>
                set('reason', value)
              }
              multiline
            />
          </>
        ) : (
          <>
            {methods.map(
              (method) => (
                <Field
                  key={method}
                  label={`${method} contado • esperado ${money(
                    data?.current
                      ?.expected?.[
                      method
                    ] || 0
                  )}`}
                  value={String(
                    form[method] ?? ''
                  )}
                  onChangeText={(
                    value
                  ) =>
                    set(
                      method,
                      value
                    )
                  }
                  keyboardType="decimal-pad"
                />
              )
            )}

            <Field
              label="Observação"
              value={String(
                form.note ?? ''
              )}
              onChangeText={(value) =>
                set('note', value)
              }
              multiline
            />
          </>
        )}
      </FormModal>

      <Modal
        visible={detailsOpen}
        transparent
        animationType="fade"
        onRequestClose={
          closeClosingDetails
        }
      >
        <View
          style={
            cashStyles.detailBackdrop
          }
        >
          <View
            style={
              cashStyles.detailModal
            }
          >
            <View
              style={
                cashStyles.detailHeader
              }
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={
                    cashStyles.detailTitle
                  }
                >
                  Detalhes do fechamento
                </Text>

                <Text
                  style={
                    cashStyles.detailSubtitle
                  }
                >
                  {selectedClosing?.code ||
                    ''}
                </Text>
              </View>

              <Pressable
                onPress={
                  closeClosingDetails
                }
              >
                <Text
                  style={
                    cashStyles.closeButton
                  }
                >
                  ×
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={cashStyles.detailScroll}
              contentContainerStyle={
                cashStyles.detailBody
              }
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {!!selectedClosing && (
                <>
                  <DetailSection title="Sessão">
                    <DetailRow
                      label="Data"
                      value={
                        selectedClosing.date ||
                        '-'
                      }
                    />
                    <DetailRow
                      label="Abertura"
                      value={
                        selectedClosing.opened_at ||
                        selectedClosing.opened_time ||
                        '-'
                      }
                    />
                    <DetailRow
                      label="Fechamento"
                      value={
                        selectedClosing.closed_at ||
                        selectedClosing.closed_time ||
                        '-'
                      }
                    />
                    <DetailRow
                      label="Operador"
                      value={
                        selectedClosing.operator ||
                        '-'
                      }
                    />
                  </DetailSection>

                  <DetailSection title="Movimento do caixa">
                    <DetailRow
                      label="Fundo inicial"
                      value={money(
                        selectedClosing.opening_float
                      )}
                    />
                    {Math.abs(
                      selectedClosing.opening_difference || 0
                    ) > 0.009 && (
                      <DetailRow
                        label="Divergência na abertura"
                        value={`${money(
                          selectedClosing.opening_difference
                        )}${
                          selectedClosing.opening_divergence_reason
                            ? ` • ${selectedClosing.opening_divergence_reason}`
                            : ''
                        }`}
                        danger
                      />
                    )}
                    <DetailRow
                      label="Suprimentos"
                      value={money(
                        selectedClosing.supplies
                      )}
                    />
                    <DetailRow
                      label="Sangrias"
                      value={money(
                        selectedClosing.withdrawals
                      )}
                    />
                    <DetailRow
                      label="Quantidade de vendas"
                      value={String(
                        selectedClosing.sales ||
                          0
                      )}
                    />
                    <DetailRow
                      label="Total vendido"
                      value={money(
                        selectedClosing.total_sales
                      )}
                    />

                    {(selectedClosing.movements || []).length > 0 ? (
                      <View style={cashStyles.movementsList}>
                        <Text style={cashStyles.movementsTitle}>
                          Sangrias e suprimentos
                        </Text>

                        {(selectedClosing.movements || []).map(
                          (movement: any, index: number) => (
                            <View
                              key={String(
                                movement.id ||
                                  `${movement.type}-${movement.time}-${index}`
                              )}
                              style={cashStyles.movementItem}
                            >
                              <View style={cashStyles.movementTop}>
                                <Text style={cashStyles.movementType}>
                                  {movement.type === 'SANGRIA'
                                    ? 'Sangria'
                                    : 'Suprimento'}
                                </Text>

                                <Text
                                  style={[
                                    cashStyles.movementAmount,
                                    movement.type === 'SANGRIA' &&
                                      cashStyles.detailDanger,
                                  ]}
                                >
                                  {money(movement.amount)}
                                </Text>
                              </View>

                              <Text style={cashStyles.movementMeta}>
                                {movement.date || '-'} • {movement.time || '-'}
                              </Text>

                              <Text style={cashStyles.movementReason}>
                                {movement.reason || 'Sem motivo informado.'}
                              </Text>

                              {!!movement.operator && (
                                <Text style={cashStyles.movementMeta}>
                                  Operador: {movement.operator}
                                </Text>
                              )}
                            </View>
                          )
                        )}
                      </View>
                    ) : (
                      <Text style={cashStyles.noMovements}>
                        Nenhuma sangria ou suprimento registrado nesta sessão.
                      </Text>
                    )}
                  </DetailSection>

                  <DetailSection title="Conferência por forma de pagamento">
                    {methods.map(
                      (method) => (
                        <View
                          key={method}
                          style={
                            cashStyles.paymentBlock
                          }
                        >
                          <Text
                            style={
                              cashStyles.paymentTitle
                            }
                          >
                            {method}
                          </Text>

                          <DetailRow
                            label="Esperado"
                            value={money(
                              selectedClosing
                                .expected?.[
                                method
                              ] || 0
                            )}
                          />

                          <DetailRow
                            label="Contado"
                            value={money(
                              selectedClosing
                                .counted?.[
                                method
                              ] || 0
                            )}
                          />

                          <DetailRow
                            label="Diferença"
                            value={money(
                              selectedClosing
                                .differences?.[
                                method
                              ] || 0
                            )}
                            danger={
                              Math.abs(
                                selectedClosing
                                  .differences?.[
                                  method
                                ] || 0
                              ) > 0.009
                            }
                          />
                        </View>
                      )
                    )}
                  </DetailSection>

                  <DetailSection title="Totais do fechamento">
                    <DetailRow
                      label="Total esperado"
                      value={money(
                        selectedClosing.expected_total
                      )}
                    />
                    <DetailRow
                      label="Total contado"
                      value={money(
                        selectedClosing.counted_total
                      )}
                    />
                    <DetailRow
                      label="Diferença final"
                      value={money(
                        selectedClosing.difference
                      )}
                      danger={
                        Math.abs(
                          selectedClosing.difference ||
                            0
                        ) > 0.009
                      }
                    />
                  </DetailSection>

                  <DetailSection title="Observação">
                    <Text
                      style={
                        cashStyles.observation
                      }
                    >
                      {selectedClosing.observation ||
                        'Sem observação.'}
                    </Text>
                  </DetailSection>
                </>
              )}
            </ScrollView>

            <View
              style={
                cashStyles.detailFooter
              }
            >
              <ActionButton
                label="Fechar"
                tone="dark"
                onPress={
                  closeClosingDetails
                }
              />
            </View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View
      style={
        cashStyles.detailSection
      }
    >
      <Text
        style={
          cashStyles.sectionTitle
        }
      >
        {title}
      </Text>

      {children}
    </View>
  );
}

function DetailRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View
      style={
        cashStyles.detailRow
      }
    >
      <Text
        style={
          cashStyles.detailLabel
        }
      >
        {label}
      </Text>

      <Text
        style={[
          cashStyles.detailValue,
          danger &&
            cashStyles.detailDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const cashStyles = StyleSheet.create({
  sessionInfo: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },

  actionItem: {
    minWidth: 110,
    flexGrow: 1,
  },

  closedArea: {
    padding: 16,
    gap: 12,
  },

  openButton: {
    alignSelf: 'flex-start',
    minWidth: 140,
  },

  detailButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },

  detailBackdrop: {
    flex: 1,
    backgroundColor:
      'rgba(0,0,0,.55)',
    justifyContent: 'center',
    padding: 18,
  },

  detailModal: {
    width: '100%',
    maxWidth: 700,
    height: '90%',
    maxHeight: 760,
    alignSelf: 'center',
    backgroundColor: '#FFF',
    borderRadius: 18,
    overflow: 'hidden',
  },

  detailScroll: {
    flex: 1,
  },

  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E3E0D8',
  },

  detailTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#171717',
  },

  detailSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#6B6B6B',
    fontWeight: '700',
  },

  closeButton: {
    fontSize: 30,
    lineHeight: 32,
    color: '#6B6B6B',
  },

  detailBody: {
    padding: 16,
    gap: 14,
  },

  detailSection: {
    borderWidth: 1,
    borderColor: '#E3E0D8',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFF',
  },

  sectionTitle: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '900',
    color: '#171717',
    backgroundColor: '#F6F5F2',
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEECE7',
  },

  detailLabel: {
    flex: 1,
    fontSize: 13,
    color: '#6B6B6B',
    fontWeight: '700',
  },

  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    color: '#171717',
    fontWeight: '900',
  },

  detailDanger: {
    color: '#A63D40',
  },

  paymentBlock: {
    borderTopWidth: 1,
    borderTopColor: '#EEECE7',
  },

  paymentTitle: {
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 4,
    fontSize: 14,
    fontWeight: '900',
    color: '#171717',
  },

  movementsList: {
    borderTopWidth: 1,
    borderTopColor: '#EEECE7',
    padding: 12,
    gap: 10,
  },

  movementsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#171717',
  },

  movementItem: {
    borderWidth: 1,
    borderColor: '#E3E0D8',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    backgroundColor: '#FAFAF8',
  },

  movementTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  movementType: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: '#171717',
  },

  movementAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#171717',
  },

  movementMeta: {
    fontSize: 12,
    color: '#6B6B6B',
    fontWeight: '700',
  },

  movementReason: {
    fontSize: 13,
    lineHeight: 18,
    color: '#171717',
  },

  noMovements: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEECE7',
    fontSize: 13,
    color: '#6B6B6B',
  },

  observation: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEECE7',
    fontSize: 14,
    lineHeight: 20,
    color: '#171717',
  },

  detailFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E3E0D8',
    alignItems: 'flex-end',
  },
});
