import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { Skeleton } from '@/components/Skeleton';
import {
  getDashboard,
  getNotifications,
  getSyncStatus,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationEvent,
} from '@/services/api';
import type { DashboardSummary } from '@/types/api';
import { theme, useThemeColors } from '@/constants/theme';
import { getFull } from '@/services/fullApi';
import { formatDateBR } from '@/utils/date';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

// Compara com o mesmo indicador de ontem. Retorna null quando não há
// base de comparação (ex.: ontem foi zero), para não mostrar um
// percentual sem sentido como "+infinito%".
function trendVsYesterday(today: number, yesterday: number) {
  if (!yesterday) return null;
  const diff = ((today - yesterday) / yesterday) * 100;
  return Math.round(diff);
}

type Filter = 'all' | 'sales' | 'cash';

function eventCategory(eventType: string): Filter {
  const type = String(eventType || '').toUpperCase();

  if (type.includes('SALE') || type.includes('VENDA')) {
    return 'sales';
  }

  if (
    type.includes('CASH') ||
    type.includes('CAIXA') ||
    type.includes('SANGRIA') ||
    type.includes('SUPRIMENTO')
  ) {
    return 'cash';
  }

  return 'all';
}

function eventIcon(eventType: string) {
  const type = String(eventType || '').toUpperCase();

  if (type.includes('SALE') || type.includes('VENDA')) {
    return '$';
  }

  if (type.includes('SANGRIA')) {
    return '↓';
  }

  if (type.includes('SUPRIMENTO')) {
    return '↑';
  }

  if (type.includes('CLOSED') || type.includes('FECH')) {
    return '✓';
  }

  if (type.includes('OPEN') || type.includes('ABERT')) {
    return '◉';
  }

  return '•';
}

function eventLabel(eventType: string) {
  const type = String(eventType || '').toUpperCase();

  if (type.includes('SALE') || type.includes('VENDA')) {
    return 'Venda';
  }

  if (type.includes('SANGRIA')) {
    return 'Sangria';
  }

  if (type.includes('SUPRIMENTO')) {
    return 'Suprimento';
  }

  if (type.includes('CLOSED') || type.includes('FECH')) {
    return 'Fechamento de caixa';
  }

  if (type.includes('OPEN') || type.includes('ABERT')) {
    return 'Abertura de caixa';
  }

  return 'Evento';
}

function weekdayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const label = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function todayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function isToday(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Data não informada';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
}


function firstPayloadValue(
  payload: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  if (!payload) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      return value;
    }
  }

  return undefined;
}

function textValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  return String(value);
}

function moneyPayload(value: unknown) {
  const number = Number(value);

  if (Number.isFinite(number)) {
    return money(number);
  }

  return textValue(value);
}

function detailRows(event: NotificationEvent) {
  const payload = event.payload || {};
  const category = eventCategory(event.event_type);

  if (category === 'sales') {
    return [
      {
        label: 'Venda',
        value: textValue(
          firstPayloadValue(payload, [
            'sale_number',
            'saleNumber',
            'number',
            'sale_id',
            'saleId',
            'id',
          ])
        ),
      },
      {
        label: 'Valor',
        value: moneyPayload(
          firstPayloadValue(payload, [
            'total',
            'amount',
            'sale_total',
            'saleTotal',
          ])
        ),
      },
      {
        label: 'Pagamento',
        value: textValue(
          firstPayloadValue(payload, [
            'payment_method',
            'paymentMethod',
            'payment',
            'method',
          ])
        ),
      },
      {
        label: 'Cliente',
        value: textValue(
          firstPayloadValue(payload, [
            'customer_name',
            'customerName',
            'customer',
          ])
        ),
      },
      {
        label: 'Operador',
        value: textValue(
          firstPayloadValue(payload, [
            'operator',
            'operator_name',
            'operatorName',
            'user',
          ])
        ),
      },
      {
        label: 'Horário',
        value: textValue(
          firstPayloadValue(payload, [
            'time',
            'sale_time',
            'saleTime',
          ])
        ),
      },
    ].filter((row) => row.value !== '—');
  }

  if (category === 'cash') {
    return [
      {
        label: 'Sessão',
        value: textValue(
          firstPayloadValue(payload, [
            'sessionCode',
            'session_code',
            'code',
            'sessionId',
            'session_id',
          ])
        ),
      },
      {
        label: 'Valor',
        value: moneyPayload(
          firstPayloadValue(payload, [
            'amount',
            'value',
            'total',
          ])
        ),
      },
      {
        label: 'Motivo',
        value: textValue(
          firstPayloadValue(payload, [
            'reason',
            'observation',
            'note',
          ])
        ),
      },
      {
        label: 'Operador',
        value: textValue(
          firstPayloadValue(payload, [
            'operator',
            'operator_name',
            'operatorName',
          ])
        ),
      },
      {
        label: 'Vendas',
        value: textValue(
          firstPayloadValue(payload, [
            'saleCount',
            'sale_count',
            'sales',
          ])
        ),
      },
      {
        label: 'Total de vendas',
        value: moneyPayload(
          firstPayloadValue(payload, [
            'totalSales',
            'total_sales',
          ])
        ),
      },
      {
        label: 'Esperado',
        value: moneyPayload(
          firstPayloadValue(payload, [
            'expectedTotal',
            'expected_total',
          ])
        ),
      },
      {
        label: 'Contado',
        value: moneyPayload(
          firstPayloadValue(payload, [
            'totalCounted',
            'counted_total',
          ])
        ),
      },
      {
        label: 'Diferença',
        value: moneyPayload(
          firstPayloadValue(payload, [
            'totalDifference',
            'difference',
          ])
        ),
      },
      {
        label: 'Horário',
        value: textValue(
          firstPayloadValue(payload, [
            'time',
            'closedTime',
            'openedTime',
          ])
        ),
      },
    ].filter((row) => row.value !== '—');
  }

  return [];
}


function normalizeDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function saleNumberFromEvent(event: NotificationEvent) {
  const payload = event.payload || {};

  const direct = firstPayloadValue(payload, [
    'sale_number',
    'saleNumber',
    'number',
  ]);

  if (direct !== undefined) {
    return normalizeDigits(direct);
  }

  const joined = `${event.title || ''} ${event.message || ''}`;
  const match = joined.match(/Venda\s*#\s*(\d+)/i);

  return match ? normalizeDigits(match[1]) : '';
}

function findSaleForEvent(
  event: NotificationEvent,
  salesRows: any[]
) {
  const payload = event.payload || {};

  const payloadId = firstPayloadValue(payload, [
    'sale_id',
    'saleId',
    'id',
  ]);

  if (payloadId !== undefined) {
    const byId = salesRows.find(
      (row) => String(row.id) === String(payloadId)
    );

    if (byId) {
      return byId;
    }
  }

  const number = saleNumberFromEvent(event);

  if (number) {
    const byNumber = salesRows.find(
      (row) => normalizeDigits(row.number) === number
    );

    if (byNumber) {
      return byNumber;
    }
  }

  const total = Number(
    firstPayloadValue(payload, [
      'total',
      'amount',
      'sale_total',
      'saleTotal',
    ])
  );

  if (Number.isFinite(total) && total > 0) {
    const candidates = salesRows.filter(
      (row) => Math.abs(Number(row.total || 0) - total) < 0.001
    );

    if (candidates.length === 1) {
      return candidates[0];
    }
  }

  return null;
}

function qtyText(value: unknown) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value ?? '');
  }

  return Number.isInteger(number)
    ? String(number)
    : new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 3,
      }).format(number);
}

function DashboardSkeleton({ styles }: { styles: any }) {
  return (
    <>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Skeleton width={110} height={11} radius={4} />
          <Skeleton width={140} height={26} radius={6} style={{ marginTop: 10 }} />
          <Skeleton width={160} height={11} radius={4} style={{ marginTop: 8 }} />
        </View>

        <View style={styles.summaryCard}>
          <Skeleton width={50} height={11} radius={4} />
          <Skeleton width={90} height={22} radius={6} style={{ marginTop: 10 }} />
          <Skeleton width={110} height={11} radius={4} style={{ marginTop: 8 }} />
        </View>
      </View>

      <View style={styles.chartCard}>
        <Skeleton width={190} height={11} radius={4} />

        <View style={[styles.chartRow, { marginTop: 16 }]}>
          {[0.35, 0.5, 0.4, 0.7, 0.55, 0.9, 0.6].map((h, index) => (
            <View key={index} style={styles.chartBarColumn}>
              <View style={styles.chartBarTrack}>
                <Skeleton width="100%" height={Math.round(90 * h)} radius={6} />
              </View>
              <Skeleton width={20} height={9} radius={4} style={{ marginTop: 7 }} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.timeline}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={[styles.eventRow, { alignItems: 'center' }]}>
            <Skeleton width={32} height={32} radius={16} />

            <View style={{ flex: 1, marginLeft: 12, paddingBottom: 14 }}>
              <Skeleton width="55%" height={13} radius={4} />
              <Skeleton width="35%" height={11} radius={4} style={{ marginTop: 8 }} />
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

export default function Dashboard() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [salesRows, setSalesRows] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [syncText, setSyncText] = useState(
    'Verificando sincronização...'
  );
  const [selectedEvent, setSelectedEvent] =
    useState<NotificationEvent | null>(null);
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(silent = false) {
    try {
      if (!silent) {
        setLoading(true);
      }

      setError('');

      const [dashboard, sync, notifications] =
        await Promise.all([
          getDashboard(),
          getSyncStatus(),
          getNotifications(false, 100),
        ]);

      // Vendas detalhadas só enriquecem os cartões de notificação;
      // perfis sem acesso a Vendas (ex.: Caixa) continuam vendo o
      // dashboard normalmente, só sem esse detalhe extra.
      const salesData = await getFull('sales').catch(() => null);

      setData(dashboard);
      setEvents(notifications.notifications || []);
      setSalesRows(salesData?.rows || []);
      setUnreadCount(Number(notifications.unread_count || 0));

      setSyncText(
        sync.last_sync_at
          ? `Sincronizado com ${
              sync.terminal_name || 'PDV'
            } • ${new Date(sync.last_sync_at).toLocaleString('pt-BR')}`
          : sync.message
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar os eventos.'
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();

    const timer = setInterval(() => {
      load(true);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  const todaySalesRows = useMemo(() => {
    const today = todayDateString();
    return salesRows.filter(
      (row: any) => row.date === today && row.status === 'Concluída'
    );
  }, [salesRows]);

  const recentSales = useMemo(
    () => todaySalesRows.slice(0, 8),
    [todaySalesRows]
  );

  const topProductsToday = useMemo(() => {
    const byProduct: Record<string, { name: string; qty: number }> = {};

    todaySalesRows.forEach((sale: any) => {
      (sale.items_detail || []).forEach((item: any) => {
        const key = String(item.code || item.name || '');
        if (!key) return;
        if (!byProduct[key]) {
          byProduct[key] = { name: item.name || 'Produto', qty: 0 };
        }
        byProduct[key].qty += Number(item.qty || 0);
      });
    });

    return Object.values(byProduct)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [todaySalesRows]);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => isToday(event.created_at))
      .sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
      );
  }, [events]);

  async function readEvent(event: NotificationEvent) {
    if (event.read) {
      return;
    }

    try {
      await markNotificationRead(event.id);

      setEvents((current) =>
        current.map((item) =>
          item.id === event.id
            ? {
                ...item,
                read: true,
                read_at: new Date().toISOString(),
              }
            : item
        )
      );

      setUnreadCount((current) => Math.max(0, current - 1));
    } catch {
      // A falha de leitura não deve impedir o uso da tela.
    }
  }

  async function readAll() {
    try {
      await markAllNotificationsRead();

      setEvents((current) =>
        current.map((item) => ({
          ...item,
          read: true,
          read_at: item.read_at || new Date().toISOString(),
        }))
      );

      setUnreadCount(0);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível marcar os eventos como lidos.'
      );
    }
  }


  function openEvent(event: NotificationEvent) {
    readEvent(event);

    if (eventCategory(event.event_type) === 'sales') {
      const sale = findSaleForEvent(event, salesRows);

      if (sale) {
        setSelectedSale(sale);
        setSelectedEvent(null);
        return;
      }
    }

    setSelectedSale(null);
    setSelectedEvent(event);
  }

  return (
    <AdminShell
      title="Eventos"
      subtitle="Acompanhe as movimentações da loja em tempo real"
      syncText={syncText}
      refreshing={loading}
      onRefresh={() => load()}
      headerActions={
        unreadCount > 0 ? (
          <Pressable style={styles.readAllButton} onPress={readAll}>
            <Text style={styles.readAllText}>Marcar todos como lidos</Text>
          </Pressable>
        ) : null
      }
    >
      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading && !data ? (
        <DashboardSkeleton styles={styles} />
      ) : (
        <>
      {data && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryLabelRow}>
              <Text style={styles.summaryLabel}>Faturamento hoje</Text>

              {(() => {
                const trend = trendVsYesterday(
                  data.revenue_today,
                  data.revenue_yesterday
                );
                if (trend === null) return null;
                const positive = trend >= 0;
                return (
                  <View
                    style={[
                      styles.trendPill,
                      positive ? styles.trendPillUp : styles.trendPillDown,
                    ]}
                  >
                    <Text
                      style={[
                        styles.trendText,
                        positive ? styles.trendTextUp : styles.trendTextDown,
                      ]}
                    >
                      {positive ? '↑' : '↓'} {Math.abs(trend)}%
                    </Text>
                  </View>
                );
              })()}
            </View>

            <Text style={styles.summaryValue}>
              {money(data.revenue_today)}
            </Text>
            <Text style={styles.summaryNote}>
              {data.sales_today} venda(s) • ontem {money(data.revenue_yesterday)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Caixa</Text>
            <Text style={styles.summaryValueSmall}>
              {data.cash_status || '—'}
            </Text>
            <Text style={styles.summaryNote}>
              {data.cash_session
                ? `Sessão ${data.cash_session}`
                : 'Sem sessão ativa'}
            </Text>
          </View>
        </View>
      )}

      {data && data.revenue_last_7d && data.revenue_last_7d.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Faturamento — últimos 7 dias</Text>

          <View style={styles.chartRow}>
            {(() => {
              const max = Math.max(
                ...data.revenue_last_7d.map((day) => day.revenue),
                1
              );

              return data.revenue_last_7d.map((day, index) => {
                const isLast = index === data.revenue_last_7d.length - 1;
                const pct = Math.max(
                  Math.round((day.revenue / max) * 100),
                  day.revenue > 0 ? 4 : 1
                );

                return (
                  <View key={day.date} style={styles.chartBarColumn}>
                    <Text style={styles.chartBarValue} numberOfLines={1}>
                      {day.revenue > 0 ? money(day.revenue) : ''}
                    </Text>

                    <View style={styles.chartBarTrack}>
                      <View
                        style={[
                          styles.chartBar,
                          { height: `${pct}%` as any },
                          isLast && styles.chartBarActive,
                        ]}
                      />
                    </View>

                    <Text
                      style={[
                        styles.chartBarLabel,
                        isLast && styles.chartBarLabelActive,
                      ]}
                    >
                      {weekdayLabel(day.date)}
                    </Text>
                  </View>
                );
              });
            })()}
          </View>
        </View>
      )}

      {data && (
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sectionTitle}>Resumo do mês</Text>
            <Text style={styles.sectionSubtitle}>
              Indicadores adicionais de gestão
            </Text>
          </View>
        </View>
      )}

      {data && (
        <View style={styles.summaryRow}>
          <MetricCard
            label="Ticket médio"
            value={money(data.ticket_average)}
            note="Média por venda no mês"
          />

          <MetricCard
            label="Resultado bruto"
            value={money(data.gross_result_estimated)}
            note="Faturamento do mês menos custo"
          />

          <MetricCard
            label="A receber (30 dias)"
            value={money(data.receivables_next_30d)}
            note="Cartão e contas a receber"
          />

          <MetricCard
            label="A pagar (30 dias)"
            value={money(data.payables_next_30d)}
            note="Contas a pagar em aberto"
          />

          <MetricCard
            label="Alertas de estoque"
            value={String(data.stock_alerts)}
            note={
              data.stock_alerts > 0
                ? 'Produto(s) no mínimo ou abaixo'
                : 'Tudo certo'
            }
            tone={data.stock_alerts > 0 ? 'warning' : 'default'}
          />
        </View>
      )}

      {recentSales.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Vendas recentes de hoje</Text>

          {recentSales.map((sale: any) => (
            <View key={String(sale.id)} style={styles.recentSaleRow}>
              <View style={styles.recentSaleMain}>
                <Text style={styles.recentSaleTitle}>
                  #{sale.number} •{' '}
                  {sale.items_detail?.[0]?.name || sale.summary || 'Venda'}
                  {(sale.items_detail?.length || 0) > 1
                    ? ` +${sale.items_detail.length - 1} item(ns)`
                    : ''}
                </Text>
                <Text style={styles.recentSaleMeta}>{sale.time}</Text>
              </View>

              <Text style={styles.recentSaleAmount}>
                {money(sale.total)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {topProductsToday.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Produtos em destaque hoje</Text>

          {(() => {
            const max = Math.max(
              ...topProductsToday.map((p) => p.qty),
              1
            );

            return topProductsToday.map((product) => (
              <View key={product.name} style={styles.topProductRow}>
                <View style={styles.topProductLabelRow}>
                  <Text style={styles.topProductName} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <Text style={styles.topProductQty}>
                    {product.qty % 1 === 0
                      ? product.qty
                      : product.qty.toFixed(3)}{' '}
                    un.
                  </Text>
                </View>

                <View style={styles.topProductTrack}>
                  <View
                    style={[
                      styles.topProductBar,
                      { width: `${Math.round((product.qty / max) * 100)}%` as any },
                    ]}
                  />
                </View>
              </View>
            ));
          })()}
        </View>
      )}

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Eventos de hoje</Text>
          <Text style={styles.sectionSubtitle}>
            {unreadCount > 0
              ? `${unreadCount} não lido(s)`
              : 'Todos os eventos estão lidos'}
          </Text>
        </View>
      </View>

      {filteredEvents.length > 0 ? (
        <View style={styles.timeline}>
          {filteredEvents.map((event, index) => {
            const category = eventCategory(event.event_type);

            return (
              <Pressable
                key={event.id}
                style={[
                  styles.eventRow,
                  !event.read && styles.eventRowUnread,
                ]}
                onPress={() => openEvent(event)}
              >
                <View style={styles.timelineColumn}>
                  <View
                    style={[
                      styles.iconCircle,
                      category === 'sales' && styles.iconSales,
                      category === 'cash' && styles.iconCash,
                    ]}
                  >
                    <Text style={styles.iconText}>
                      {eventIcon(event.event_type)}
                    </Text>
                  </View>

                  {index < filteredEvents.length - 1 && (
                    <View style={styles.timelineLine} />
                  )}
                </View>

                <View style={styles.eventContent}>
                  <View style={styles.eventTop}>
                    <View style={styles.eventTitleArea}>
                      <Text style={styles.eventType}>
                        {eventLabel(event.event_type)}
                      </Text>

                      {!event.read && <View style={styles.unreadDot} />}
                    </View>

                    <Text style={styles.eventDate}>
                      {formatDateTime(event.created_at)}
                    </Text>
                  </View>

                  <Text style={styles.eventTitle}>
                    {event.title || eventLabel(event.event_type)}
                  </Text>

                  {!!event.message && (
                    <Text style={styles.eventMessage}>
                      {event.message}
                    </Text>
                  )}

                  {!!event.terminal_id && (
                    <Text style={styles.eventTerminal}>
                      Terminal: {event.terminal_id}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            Nenhum evento neste filtro
          </Text>
          <Text style={styles.emptyText}>
            As novas vendas e movimentações do caixa aparecerão aqui.
          </Text>
        </View>
      )}
        </>
      )}

      <Modal
        visible={Boolean(selectedSale)}
        animationType="slide"
        onRequestClose={() => setSelectedSale(null)}
      >
        {selectedSale && (
          <View style={styles.saleScreen}>
            <View style={styles.saleHeader}>
              <View style={styles.saleHeaderTop}>
                <Pressable
                  style={styles.saleBackButton}
                  onPress={() => setSelectedSale(null)}
                >
                  <Text style={styles.saleBackText}>‹</Text>
                </Pressable>

                <Text style={styles.saleHeaderTime}>
                  {selectedSale.time || '—'}
                </Text>
              </View>

              <View style={styles.saleOperatorRow}>
                <View style={styles.saleOperatorIcon}>
                  <Text style={styles.saleOperatorIconText}>$</Text>
                </View>

                <View style={styles.saleOperatorText}>
                  <Text style={styles.saleOperatorName}>
                    {selectedSale.operator || 'Administrador'}
                  </Text>

                  <Text style={styles.saleOperatorMeta}>
                    Venda #{selectedSale.number || selectedSale.id || '—'}
                    {' • '}
                    {selectedSale.items_detail?.length ||
                      selectedSale.items ||
                      0}{' '}
                    item(ns)
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.saleScroll}
              contentContainerStyle={styles.saleScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.saleTotalSection}>
                <Text style={styles.saleSectionLabel}>
                  VALOR DA VENDA
                </Text>

                <Text style={styles.saleGrandTotal}>
                  {money(selectedSale.total || 0)}
                </Text>
              </View>

              <View style={styles.saleDivider} />

              <View style={styles.saleSection}>
                <Text style={styles.saleSectionLabel}>ITENS</Text>

                {(selectedSale.items_detail || []).length > 0 ? (
                  (selectedSale.items_detail || []).map(
                    (item: any, index: number) => {
                      const qty = Number(item.qty || 0);
                      const price = Number(item.price || 0);
                      const lineTotal =
                        Number.isFinite(qty) && Number.isFinite(price)
                          ? qty * price
                          : Number(item.total || 0);

                      return (
                        <View
                          key={`${item.id || item.code || index}-${index}`}
                          style={styles.saleItemRow}
                        >
                          <View style={styles.saleItemMain}>
                            <Text style={styles.saleItemName}>
                              {qtyText(item.qty)}x{' '}
                              {item.name || item.product || 'Produto'}
                            </Text>

                            {!!item.code && (
                              <Text style={styles.saleItemCode}>
                                Código: {item.code}
                              </Text>
                            )}
                          </View>

                          <Text style={styles.saleItemAmount}>
                            {money(lineTotal)}
                          </Text>
                        </View>
                      );
                    }
                  )
                ) : (
                  <Text style={styles.saleEmptyText}>
                    Os itens detalhados não estão disponíveis para esta
                    venda.
                  </Text>
                )}

                <View style={styles.saleTotalRow}>
                  <Text style={styles.saleTotalLabel}>TOTAL</Text>
                  <Text style={styles.saleTotalValue}>
                    {money(selectedSale.total || 0)}
                  </Text>
                </View>

                {Number(selectedSale.discount || 0) > 0 && (
                  <View style={styles.saleInfoRow}>
                    <Text style={styles.saleInfoLabel}>Desconto</Text>
                    <Text style={styles.saleInfoValue}>
                      {money(selectedSale.discount || 0)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.saleDivider} />

              <View style={styles.saleSection}>
                <Text style={styles.saleSectionLabel}>
                  FORMA DE PAGAMENTO
                </Text>

                <View style={styles.salePaymentRow}>
                  <View style={styles.salePaymentIcon}>
                    <Text style={styles.salePaymentIconText}>▣</Text>
                  </View>

                  <View style={styles.salePaymentMain}>
                    <Text style={styles.salePaymentName}>
                      {selectedSale.payment || 'Não informado'}
                    </Text>

                    {selectedSale.cash_session && (
                      <Text style={styles.salePaymentMeta}>
                        Caixa: {selectedSale.cash_session}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.salePaymentAmount}>
                    {money(selectedSale.total || 0)}
                  </Text>
                </View>
              </View>

              {(selectedSale.customer ||
                selectedSale.date ||
                selectedSale.status) && (
                <>
                  <View style={styles.saleDivider} />

                  <View style={styles.saleSection}>
                    <Text style={styles.saleSectionLabel}>
                      DETALHES DA VENDA
                    </Text>

                    {!!selectedSale.customer && (
                      <View style={styles.saleInfoRow}>
                        <Text style={styles.saleInfoLabel}>Cliente</Text>
                        <Text style={styles.saleInfoValue}>
                          {selectedSale.customer}
                        </Text>
                      </View>
                    )}

                    {!!selectedSale.date && (
                      <View style={styles.saleInfoRow}>
                        <Text style={styles.saleInfoLabel}>Data</Text>
                        <Text style={styles.saleInfoValue}>
                          {formatDateBR(selectedSale.date)}
                          {selectedSale.time
                            ? ` • ${selectedSale.time}`
                            : ''}
                        </Text>
                      </View>
                    )}

                    {!!selectedSale.status && (
                      <View style={styles.saleInfoRow}>
                        <Text style={styles.saleInfoLabel}>Status</Text>
                        <Text style={styles.saleInfoValue}>
                          {selectedSale.status}
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>

      <Modal
        visible={Boolean(selectedEvent)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedEvent && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalEyebrow}>
                      {eventLabel(selectedEvent.event_type)}
                    </Text>

                    <Text style={styles.modalTitle}>
                      {selectedEvent.title ||
                        eventLabel(selectedEvent.event_type)}
                    </Text>
                  </View>

                  <Pressable
                    style={styles.modalClose}
                    onPress={() => setSelectedEvent(null)}
                  >
                    <Text style={styles.modalCloseText}>×</Text>
                  </Pressable>
                </View>

                <Text style={styles.modalDate}>
                  {formatDateTime(selectedEvent.created_at)}
                </Text>

                {!!selectedEvent.message && (
                  <View style={styles.modalMessageBox}>
                    <Text style={styles.modalMessage}>
                      {selectedEvent.message}
                    </Text>
                  </View>
                )}

                {detailRows(selectedEvent).length > 0 && (
                  <View style={styles.detailsBox}>
                    <Text style={styles.detailsTitle}>
                      Detalhes
                    </Text>

                    {detailRows(selectedEvent).map((row) => (
                      <View
                        key={`${selectedEvent.id}-${row.label}`}
                        style={styles.detailRow}
                      >
                        <Text style={styles.detailLabel}>
                          {row.label}
                        </Text>
                        <Text style={styles.detailValue}>
                          {row.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {!!selectedEvent.terminal_id && (
                  <View style={styles.terminalBox}>
                    <Text style={styles.terminalLabel}>Terminal</Text>
                    <Text style={styles.terminalValue}>
                      {selectedEvent.terminal_id}
                    </Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => setSelectedEvent(null)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Fechar
                    </Text>
                  </Pressable>

                  {eventCategory(selectedEvent.event_type) ===
                    'sales' && (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => {
                        setSelectedEvent(null);
                        router.push('/sales' as never);
                      }}
                    >
                      <Text style={styles.primaryButtonText}>
                        Abrir Vendas
                      </Text>
                    </Pressable>
                  )}

                  {eventCategory(selectedEvent.event_type) ===
                    'cash' && (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => {
                        setSelectedEvent(null);
                        router.push('/cash' as never);
                      }}
                    >
                      <Text style={styles.primaryButtonText}>
                        Abrir Caixa
                      </Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  error: {
    color: theme.colors.danger,
    backgroundColor: '#FFF0F0',
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    fontWeight: '700',
  },

  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  summaryCard: {
    minWidth: 155,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.lg,
    padding: 18,
    shadowColor: '#0D1117',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  summaryLabel: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.muted,
  },

  trendPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },

  trendPillUp: {
    backgroundColor: '#E8F6EE',
  },

  trendPillDown: {
    backgroundColor: '#FBEAEA',
  },

  trendText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },

  trendTextUp: {
    color: theme.colors.success,
  },

  trendTextDown: {
    color: theme.colors.danger,
  },

  summaryValue: {
    marginTop: 5,
    fontSize: 22,
    fontFamily: 'Sora_800ExtraBold',
    color: theme.colors.text,
  },

  summaryValueSmall: {
    marginTop: 5,
    fontSize: 18,
    fontFamily: 'Sora_800ExtraBold',
    color: theme.colors.text,
  },

  summaryNote: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.muted,
  },

  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.lg,
    padding: 18,
    shadowColor: '#0D1117',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  chartTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  chartRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },

  chartBarColumn: {
    flex: 1,
    alignItems: 'center',
  },

  chartBarValue: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.muted,
    marginBottom: 4,
  },

  chartBarTrack: {
    width: '100%',
    maxWidth: 26,
    height: 90,
    justifyContent: 'flex-end',
    backgroundColor: '#F3F1EC',
    borderRadius: 6,
    overflow: 'hidden',
  },

  chartBar: {
    width: '100%',
    backgroundColor: `${theme.colors.text}33`,
    borderRadius: 6,
  },

  chartBarActive: {
    backgroundColor: c.gold,
  },

  chartBarLabel: {
    marginTop: 7,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.muted,
  },

  chartBarLabelActive: {
    color: c.gold,
  },

  recentSaleRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  recentSaleMain: {
    flex: 1,
  },

  recentSaleTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },

  recentSaleMeta: {
    marginTop: 3,
    fontSize: 11,
    color: theme.colors.muted,
  },

  recentSaleAmount: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },

  topProductRow: {
    marginTop: 14,
  },

  topProductLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },

  topProductName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.text,
  },

  topProductQty: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: theme.colors.muted,
  },

  topProductTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F3F1EC',
    overflow: 'hidden',
  },

  topProductBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.gold,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Sora_700Bold',
    color: theme.colors.text,
  },

  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: theme.colors.muted,
  },

  readAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
  },

  readAllText: {
    fontSize: 11,
    fontWeight: '900',
    color: theme.colors.text,
  },

  filters: {
    flexDirection: 'row',
    gap: 7,
  },

  filterButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
  },

  filterButtonActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },

  filterText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.muted,
  },

  filterTextActive: {
    color: '#FFFFFF',
  },

  timeline: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    shadowColor: '#0D1117',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  eventRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 14,
    backgroundColor: '#FFFFFF',
  },

  eventRowUnread: {
    backgroundColor: '#FCFAF5',
  },

  timelineColumn: {
    width: 42,
    alignItems: 'center',
  },

  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECECEC',
    zIndex: 2,
  },

  iconSales: {
    backgroundColor: '#EAF6ED',
  },

  iconCash: {
    backgroundColor: '#F5EFE0',
  },

  iconText: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },

  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 50,
    backgroundColor: theme.colors.border,
    marginTop: 2,
  },

  eventContent: {
    flex: 1,
    paddingLeft: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  eventTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },

  eventTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },

  eventType: {
    fontSize: 10,
    fontWeight: '900',
    color: c.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    backgroundColor: `${c.gold}1A`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },

  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.danger,
  },

  eventDate: {
    fontSize: 10,
    color: theme.colors.muted,
    textAlign: 'right',
  },

  eventTitle: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: '900',
    color: theme.colors.text,
  },

  eventMessage: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.muted,
  },

  eventTerminal: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.muted,
  },

  empty: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },

  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: theme.colors.muted,
  },

  saleScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  saleHeader: {
    backgroundColor: theme.colors.black,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 24,
  },

  saleHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  saleBackButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#272727',
  },

  saleBackText: {
    color: '#FFFFFF',
    fontSize: 36,
    lineHeight: 38,
    marginTop: -3,
  },

  saleHeaderTime: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    backgroundColor: '#272727',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },

  saleOperatorRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  saleOperatorIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  saleOperatorIconText: {
    color: c.gold,
    fontSize: 25,
    fontWeight: '900',
  },

  saleOperatorText: {
    flex: 1,
  },

  saleOperatorName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  saleOperatorMeta: {
    marginTop: 3,
    color: '#D5D5D5',
    fontSize: 13,
  },

  saleScroll: {
    flex: 1,
  },

  saleScrollContent: {
    paddingBottom: 34,
  },

  saleTotalSection: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },

  saleSection: {
    paddingHorizontal: 24,
    paddingVertical: 22,
  },

  saleSectionLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.muted,
    letterSpacing: 0.4,
  },

  saleGrandTotal: {
    flexShrink: 1,
    fontSize: 34,
    fontWeight: '900',
    color: c.gold,
    textAlign: 'right',
  },

  saleDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },

  saleItemRow: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },

  saleItemMain: {
    flex: 1,
  },

  saleItemName: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },

  saleItemCode: {
    marginTop: 3,
    fontSize: 11,
    color: theme.colors.muted,
  },

  saleItemAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },

  saleEmptyText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.muted,
  },

  saleTotalRow: {
    marginTop: 16,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  saleTotalLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.muted,
  },

  saleTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: c.gold,
  },

  salePaymentRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  salePaymentIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F1EC',
  },

  salePaymentIconText: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },

  salePaymentMain: {
    flex: 1,
  },

  salePaymentName: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },

  salePaymentMeta: {
    marginTop: 3,
    fontSize: 11,
    color: theme.colors.muted,
  },

  salePaymentAmount: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.colors.text,
  },

  saleInfoRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },

  saleInfoLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.muted,
  },

  saleInfoValue: {
    flex: 1.5,
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'right',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },

  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  modalHeaderText: {
    flex: 1,
  },

  modalEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: c.gold,
    textTransform: 'uppercase',
  },

  modalTitle: {
    marginTop: 4,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: theme.colors.text,
  },

  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F1EC',
  },

  modalCloseText: {
    fontSize: 26,
    lineHeight: 28,
    color: theme.colors.text,
  },

  modalDate: {
    marginTop: 8,
    fontSize: 12,
    color: theme.colors.muted,
  },

  modalMessageBox: {
    marginTop: 14,
    padding: 13,
    borderRadius: 12,
    backgroundColor: '#F7F5F0',
  },

  modalMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text,
  },

  detailsBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },

  detailsTitle: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.text,
    backgroundColor: '#FAFAF8',
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  detailLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.muted,
  },

  detailValue: {
    flex: 1.4,
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'right',
  },

  terminalBox: {
    marginTop: 12,
  },

  terminalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.muted,
  },

  terminalValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
  },

  modalActions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
  },

  secondaryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.text,
  },

  primaryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
