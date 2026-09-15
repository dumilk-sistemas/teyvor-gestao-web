import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import { theme } from '@/constants/theme';
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
  setProductImage,
  setProductStockMax,
} from '@/services/fullApi';
import { useToast } from '@/components/Toast';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const blank = {
  id: null as any,
  code: '',
  name: '',
  category: '',
  unit: 'un',
  sale_mode: 'unit',
  price: '0,00',
  cost: '0,00',
  minimum: '0',
  favorite: 'false',
  scale_enabled: 'false',
  scale_plu: '',
  scale_mode: 'weight',
  active: 'true',
  initial_stock: '0',
  image_url: '',
  max_stock: '',
};

export default function FullProducts() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const term = search.trim().toLocaleLowerCase('pt-BR');

    if (!term) {
      return rows;
    }

    return rows.filter((row: any) =>
      [row.name, row.code, row.category]
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

      const result = await getFull('products');
      setData(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar produtos.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const edit = (row?: any) => {
    if (row) {
      setForm({
        ...blank,
        ...row,
        price: String(row.price).replace('.', ','),
        cost: String(row.cost).replace('.', ','),
        minimum: String(row.minimum),
        favorite: String(row.favorite),
        scale_enabled: String(row.scale_enabled),
        active: String(row.active),
        image_url: row.image_url || '',
        max_stock:
          row.max_stock === null || row.max_stock === undefined
            ? ''
            : String(row.max_stock).replace('.', ','),
      });
    } else {
      setForm({ ...blank });
    }

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

  async function save() {
    try {
      setBusy(true);
      setError('');

      const imageUrl = form.image_url.trim();
      if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
        setError('URL da foto deve começar com http:// ou https://.');
        setBusy(false);
        return;
      }

      const maxStockText = form.max_stock.trim();
      const maxStock = maxStockText
        ? Number(maxStockText.replace(',', '.'))
        : null;
      if (maxStockText && (Number.isNaN(maxStock) || (maxStock as number) < 0)) {
        setError('Estoque máximo inválido.');
        setBusy(false);
        return;
      }

      const product = {
        id: form.id || undefined,
        code: form.code,
        name: form.name,
        category: form.category,
        unit:
          form.sale_mode === 'weight'
            ? 'kg'
            : form.unit,
        saleMode: form.sale_mode,
        price: Number(
          String(form.price || '0').replace(',', '.')
        ),
        cost: Number(
          String(form.cost || '0').replace(',', '.')
        ),
        min: Number(
          String(form.minimum || '0').replace(',', '.')
        ),
        favorite: form.favorite === 'true',
        scaleEnabled:
          form.scale_enabled === 'true',
        scalePlu: form.scale_plu,
        scaleMode: form.scale_mode,
        active: form.active === 'true',
        initialStock: Number(
          String(form.initial_stock || '0').replace(
            ',',
            '.'
          )
        ),
      };

      await enqueue(
        'products',
        'PRODUCT_UPSERT',
        {
          product,
        }
      );

      if (form.code) {
        // Foto e estoque máximo são dados só da nuvem (não mudam a
        // lógica de venda do PDV), por isso são salvos à parte e não
        // devem travar o salvamento do produto.
        await setProductImage(
          form.code,
          imageUrl || null
        ).catch(() => {});

        await setProductStockMax(
          form.code,
          maxStock
        ).catch(() => {});
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
          : 'Falha ao enviar produto.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Produtos"
      subtitle="Cadastro completo, preços, categorias e balança"
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
          label="+ Novo produto"
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
              label="Produtos"
              value={String(
                data.summary?.products || 0
              )}
            />

            <MetricCard
              label="Categorias"
              value={String(
                data.summary?.categories || 0
              )}
            />

            <MetricCard
              label="Por peso"
              value={String(
                data.summary?.by_weight || 0
              )}
            />

            <MetricCard
              label="Balança"
              value={String(
                data.summary?.scale || 0
              )}
            />
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por código ou nome"
          />

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Cadastro de produtos
            </Text>

            {filteredRows.length > 0 ? (
              filteredRows.map(
                (row: any) => (
                  <View
                    key={String(row.id)}
                    style={s.row}
                  >
                    {row.image_url ? (
                      <Image
                        source={{ uri: row.image_url }}
                        style={thumbStyles.thumb}
                      />
                    ) : (
                      <View style={thumbStyles.thumbPlaceholder}>
                        <Text style={thumbStyles.thumbPlaceholderText}>
                          {(row.name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={s.main}>
                      <Text style={s.name}>
                        {row.name}
                      </Text>

                      <Text style={s.meta}>
                        {row.code} • {row.category} •{' '}
                        {row.sale_mode === 'weight'
                          ? 'kg / peso'
                          : row.unit}
                        {row.scale_enabled
                          ? ` • PLU ${row.scale_plu}`
                          : ''}
                      </Text>

                      <Text style={s.meta}>
                        Estoque {row.stock} • mínimo{' '}
                        {row.minimum} • custo{' '}
                        {money(row.cost)}
                      </Text>
                    </View>

                    <View style={s.right}>
                      <Text style={s.amount}>
                        {money(row.price)}
                      </Text>

                      <Pressable
                        onPress={() => edit(row)}
                      >
                        <Text style={s.badge}>
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
                  ? 'Nenhum produto encontrado para essa busca.'
                  : 'Nenhum produto cadastrado.'}
              </Text>
            )}
          </View>
        </>
      )}

      <FormModal
        visible={open}
        title={
          form.id
            ? 'Editar produto'
            : 'Novo produto'
        }
        onCancel={() => setOpen(false)}
        onSave={save}
        busy={busy}
        wide
      >
        <Field
          label="Código *"
          value={form.code}
          onChangeText={(value) =>
            set('code', value)
          }
        />

        <Field
          label="Descrição *"
          value={form.name}
          onChangeText={(value) =>
            set('name', value)
          }
        />

        <Field
          label="Categoria *"
          value={form.category}
          onChangeText={(value) =>
            set('category', value)
          }
          placeholder="Ex.: Queijos"
        />

        <Field
          label="URL da foto"
          value={form.image_url}
          onChangeText={(value) =>
            set('image_url', value)
          }
          placeholder="https://..."
        />

        <Choice
          label="Modo de venda"
          value={form.sale_mode}
          onChange={(value) =>
            set('sale_mode', value)
          }
          options={[
            {
              label: 'Unidade',
              value: 'unit',
            },
            {
              label: 'Peso / kg',
              value: 'weight',
            },
          ]}
        />

        {form.sale_mode === 'unit' && (
          <Choice
            label="Unidade"
            value={form.unit}
            onChange={(value) =>
              set('unit', value)
            }
            options={[
              'un',
              'g',
              'L',
              'ml',
            ].map((value) => ({
              label: value,
              value,
            }))}
          />
        )}

        <Field
          label="Preço de venda *"
          value={form.price}
          onChangeText={(value) =>
            set('price', value)
          }
          keyboardType="decimal-pad"
        />

        <Field
          label="Custo"
          value={form.cost}
          onChangeText={(value) =>
            set('cost', value)
          }
          keyboardType="decimal-pad"
        />

        <Field
          label="Estoque mínimo"
          value={form.minimum}
          onChangeText={(value) =>
            set('minimum', value)
          }
          keyboardType="decimal-pad"
        />

        <Field
          label="Estoque máximo (opcional)"
          value={form.max_stock}
          onChangeText={(value) =>
            set('max_stock', value)
          }
          placeholder="Usado na sugestão de compra"
          keyboardType="decimal-pad"
        />

        {!form.id && (
          <Field
            label="Saldo inicial"
            value={form.initial_stock}
            onChangeText={(value) =>
              set('initial_stock', value)
            }
            keyboardType="decimal-pad"
          />
        )}

        <Choice
          label="Favorito"
          value={form.favorite}
          onChange={(value) =>
            set('favorite', value)
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
          label="Usar balança"
          value={form.scale_enabled}
          onChange={(value) =>
            set('scale_enabled', value)
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

        {form.scale_enabled === 'true' && (
          <>
            <Field
              label="PLU (1 a 5 números)"
              value={form.scale_plu}
              onChangeText={(value) =>
                set('scale_plu', value)
              }
              keyboardType="number-pad"
            />

            <Choice
              label="Etiqueta da balança"
              value={form.scale_mode}
              onChange={(value) =>
                set('scale_mode', value)
              }
              options={[
                {
                  label: 'Peso',
                  value: 'weight',
                },
                {
                  label: 'Preço',
                  value: 'price',
                },
              ]}
            />
          </>
        )}

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

const thumbStyles = StyleSheet.create({
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F0EFEA',
  },
  thumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F0EFEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.muted,
  },
});