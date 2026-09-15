import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  Text,
  View,
} from 'react-native';

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

const blank = {
  id: null as any,
  name: '',
  trade_name: '',
  document: '',
  phone: '',
  email: '',
  contact: '',
  city: '',
  address: '',
  notes: '',
  active: 'true',
};

export default function FullSuppliers() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    ...blank,
  });
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const term = search.trim().toLocaleLowerCase('pt-BR');

    if (!term) {
      return rows;
    }

    return rows.filter((row: any) =>
      [row.name, row.trade_name, row.document, row.city]
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

      const result = await getFull(
        'suppliers'
      );

      setData(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar fornecedores.'
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

  const edit = (row?: any) => {
    if (row) {
      setForm({
        ...blank,
        ...row,
        active: String(row.active),
      });
    } else {
      setForm({
        ...blank,
      });
    }

    setOpen(true);
  };

  async function save() {
    try {
      setBusy(true);
      setError('');

      await enqueue(
        'suppliers',
        'SUPPLIER_UPSERT',
        {
          supplier: {
            id: form.id || undefined,
            name: form.name,
            tradeName: form.trade_name,
            document: form.document,
            phone: form.phone,
            email: form.email,
            contact: form.contact,
            city: form.city,
            address: form.address,
            notes: form.notes,
            active:
              form.active === 'true',
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
          : 'Falha ao enviar fornecedor.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Fornecedores"
      subtitle="Cadastro, contatos e histórico financeiro"
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
          label="+ Novo fornecedor"
          tone="gold"
          onPress={() => edit()}
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
              label="Fornecedores"
              value={String(
                data.summary?.suppliers ||
                  0
              )}
            />

            <MetricCard
              label="Ativos"
              value={String(
                data.summary?.active || 0
              )}
            />

            <MetricCard
              label="Total comprado"
              value={money(
                data.summary
                  ?.total_purchased || 0
              )}
            />

            <MetricCard
              label="A pagar"
              value={money(
                data.summary
                  ?.open_payables || 0
              )}
            />
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, documento ou cidade"
          />

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Cadastro
            </Text>

            {filteredRows.length >
            0 ? (
              filteredRows.map(
                (row: any) => (
                  <View
                    key={String(row.id)}
                    style={s.row}
                  >
                    <View
                      style={s.main}
                    >
                      <Text
                        style={s.name}
                      >
                        {row.name}
                      </Text>

                      <Text
                        style={s.meta}
                      >
                        {row.trade_name ||
                          ''}
                        {row.document
                          ? ` • ${row.document}`
                          : ''}
                        {' • '}
                        {row.phone ||
                          row.email ||
                          'Sem contato'}
                      </Text>

                      <Text
                        style={s.meta}
                      >
                        {row.purchases ||
                          0}{' '}
                        compra(s) • total{' '}
                        {money(
                          row.total || 0
                        )}{' '}
                        • a pagar{' '}
                        {money(
                          row.open_payables ||
                            0
                        )}
                      </Text>
                    </View>

                    <View
                      style={s.right}
                    >
                      <Text
                        style={[
                          s.badge,
                          !row.active &&
                            s.badBadge,
                        ]}
                      >
                        {row.active
                          ? 'Ativo'
                          : 'Inativo'}
                      </Text>

                      <Pressable
                        onPress={() =>
                          edit(row)
                        }
                      >
                        <Text
                          style={s.badge}
                        >
                          Editar
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )
              )
            ) : (
              <Text style={s.empty}>
                {search
                  ? 'Nenhum fornecedor encontrado para essa busca.'
                  : 'Nenhum fornecedor cadastrado.'}
              </Text>
            )}
          </View>
        </>
      )}

      <FormModal
        visible={open}
        title={
          form.id
            ? 'Editar fornecedor'
            : 'Novo fornecedor'
        }
        onCancel={() =>
          setOpen(false)
        }
        onSave={save}
        busy={busy}
        wide
      >
        <Field
          label="Razão social / Nome *"
          value={form.name}
          onChangeText={(value) =>
            set('name', value)
          }
        />

        <Field
          label="Nome fantasia"
          value={form.trade_name}
          onChangeText={(value) =>
            set(
              'trade_name',
              value
            )
          }
        />

        <Field
          label="CNPJ / CPF"
          value={form.document}
          onChangeText={(value) =>
            set(
              'document',
              value
            )
          }
        />

        <Field
          label="Telefone / WhatsApp"
          value={form.phone}
          onChangeText={(value) =>
            set('phone', value)
          }
        />

        <Field
          label="E-mail"
          value={form.email}
          onChangeText={(value) =>
            set('email', value)
          }
        />

        <Field
          label="Contato"
          value={form.contact}
          onChangeText={(value) =>
            set('contact', value)
          }
        />

        <Field
          label="Cidade"
          value={form.city}
          onChangeText={(value) =>
            set('city', value)
          }
        />

        <Field
          label="Endereço"
          value={form.address}
          onChangeText={(value) =>
            set('address', value)
          }
        />

        <Field
          label="Observações"
          value={form.notes}
          onChangeText={(value) =>
            set('notes', value)
          }
          multiline
        />

        {!!form.id && (
          <Choice
            label="Status"
            value={form.active}
            onChange={(value) =>
              set('active', value)
            }
            options={[
              {
                label: 'Ativo',
                value: 'true',
              },
              {
                label: 'Inativo',
                value: 'false',
              },
            ]}
          />
        )}
      </FormModal>
    </AdminShell>
  );
}