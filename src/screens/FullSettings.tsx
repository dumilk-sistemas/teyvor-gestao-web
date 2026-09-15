import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import {
  ActionButton,
  Choice,
  Field,
  Notice,
  formStyles as s,
} from '@/components/FormKit';
import {
  commandMessage,
  enqueue,
  getFull,
} from '@/services/fullApi';
import { useToast } from '@/components/Toast';

export default function FullSettings() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});

  async function load() {
    try {
      setLoading(true);
      setError('');

      const result = await getFull('settings');

      setData(result);

      const scaleConfig =
        result.scale_config || {};

      const printSettings =
        result.print_settings || {};

      const paymentSettings =
        result.payment_settings || {};

      setForm({
        scaleEnabled: String(
          scaleConfig.enabled !== false
        ),
        prefix: String(
          scaleConfig.prefix || '2'
        ),
        pluLength: String(
          scaleConfig.pluLength || 5
        ),
        payloadLength: String(
          scaleConfig.payloadLength || 5
        ),
        weightDivisor: String(
          scaleConfig.weightDivisor || 1000
        ),
        priceDivisor: String(
          scaleConfig.priceDivisor || 100
        ),

        receiptPaper: String(
          printSettings.receiptPaper ||
            '80mm'
        ),
        receiptCopies: String(
          printSettings.receiptCopies || 1
        ),
        autoPrintReceipt: String(
          Boolean(
            printSettings.autoPrintReceipt
          )
        ),
        reportOrientation: String(
          printSettings.reportOrientation ||
            'portrait'
        ),

        debitBusinessDays: String(
          paymentSettings.debitBusinessDays ||
            1
        ),
        creditOffsets: (
          paymentSettings.creditOffsets || [
            30,
            60,
            90,
          ]
        ).join(','),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar configurações.'
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

  async function save() {
    try {
      setBusy(true);
      setError('');

      const offsets = String(
        form.creditOffsets || '30,60,90'
      )
        .split(',')
        .map((value: string) =>
          Number(value.trim())
        )
        .filter(
          (value: number) =>
            Number.isFinite(value) &&
            value > 0
        );

      await enqueue(
        'settings',
        'CONFIG_UPDATE',
        {
          scaleConfig: {
            enabled:
              form.scaleEnabled === 'true',
            prefix: form.prefix,
            pluLength: Number(
              form.pluLength
            ),
            payloadLength: Number(
              form.payloadLength
            ),
            weightDivisor: Number(
              form.weightDivisor
            ),
            priceDivisor: Number(
              form.priceDivisor
            ),
          },

          printSettings: {
            receiptPaper:
              form.receiptPaper,
            receiptCopies: Number(
              form.receiptCopies
            ),
            autoPrintReceipt:
              form.autoPrintReceipt ===
              'true',
            reportOrientation:
              form.reportOrientation,
          },

          paymentSettings: {
            debitBusinessDays: Number(
              form.debitBusinessDays
            ),
            creditOffsets: offsets,
          },
        }
      );

      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao salvar configurações.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Configurações"
      subtitle="Balança, impressão e prazos de cartões"
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
    >
      {!!error && (
        <Notice
          text={error}
          tone="error"
        />
      )}

      <View style={s.toolbar}>
        <ActionButton
          label={
            busy
              ? 'Enviando...'
              : 'Salvar configurações'
          }
          tone="gold"
          onPress={save}
          disabled={busy}
        />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>
          Balança
        </Text>

        <View
          style={{
            padding: 16,
            gap: 12,
          }}
        >
          <Choice
            label="Ativa"
            value={
              form.scaleEnabled || 'true'
            }
            onChange={(value) =>
              set(
                'scaleEnabled',
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

          <Field
            label="Prefixo"
            value={form.prefix || ''}
            onChangeText={(value) =>
              set('prefix', value)
            }
          />

          <Field
            label="Tamanho do PLU"
            value={form.pluLength || ''}
            onChangeText={(value) =>
              set(
                'pluLength',
                value
              )
            }
            keyboardType="number-pad"
          />

          <Field
            label="Tamanho do valor"
            value={
              form.payloadLength || ''
            }
            onChangeText={(value) =>
              set(
                'payloadLength',
                value
              )
            }
            keyboardType="number-pad"
          />

          <Field
            label="Divisor de peso"
            value={
              form.weightDivisor || ''
            }
            onChangeText={(value) =>
              set(
                'weightDivisor',
                value
              )
            }
            keyboardType="number-pad"
          />

          <Field
            label="Divisor de preço"
            value={
              form.priceDivisor || ''
            }
            onChangeText={(value) =>
              set(
                'priceDivisor',
                value
              )
            }
            keyboardType="number-pad"
          />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>
          Impressão
        </Text>

        <View
          style={{
            padding: 16,
            gap: 12,
          }}
        >
          <Choice
            label="Papel do comprovante"
            value={
              form.receiptPaper ||
              '80mm'
            }
            onChange={(value) =>
              set(
                'receiptPaper',
                value
              )
            }
            options={[
              {
                label: '58 mm',
                value: '58mm',
              },
              {
                label: '80 mm',
                value: '80mm',
              },
            ]}
          />

          <Field
            label="Cópias"
            value={
              form.receiptCopies || '1'
            }
            onChangeText={(value) =>
              set(
                'receiptCopies',
                value
              )
            }
            keyboardType="number-pad"
          />

          <Choice
            label="Imprimir automaticamente"
            value={
              form.autoPrintReceipt ||
              'false'
            }
            onChange={(value) =>
              set(
                'autoPrintReceipt',
                value
              )
            }
            options={[
              {
                label: 'Não',
                value: 'false',
              },
              {
                label: 'Sim',
                value: 'true',
              },
            ]}
          />

          <Choice
            label="Relatório A4"
            value={
              form.reportOrientation ||
              'portrait'
            }
            onChange={(value) =>
              set(
                'reportOrientation',
                value
              )
            }
            options={[
              {
                label: 'Retrato',
                value: 'portrait',
              },
              {
                label: 'Paisagem',
                value: 'landscape',
              },
            ]}
          />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>
          Cartões
        </Text>

        <View
          style={{
            padding: 16,
            gap: 12,
          }}
        >
          <Field
            label="Débito: dias úteis"
            value={
              form.debitBusinessDays ||
              '1'
            }
            onChangeText={(value) =>
              set(
                'debitBusinessDays',
                value
              )
            }
            keyboardType="number-pad"
          />

          <Field
            label="Crédito: dias das parcelas (separados por vírgula)"
            value={
              form.creditOffsets ||
              '30,60,90'
            }
            onChangeText={(value) =>
              set(
                'creditOffsets',
                value
              )
            }
            placeholder="30,60,90"
          />
        </View>
      </View>
    </AdminShell>
  );
}