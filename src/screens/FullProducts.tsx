import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AdminShell } from '@/components/AdminShell';
import { AccountPicker } from '@/components/AccountPicker';
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
  createProductCategory,
  deleteProductCategory,
  enqueue,
  getFull,
  getProductCategories,
  setProductFiscal,
  setProductImage,
  setProductStockMax,
  updateProductCategory,
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
  original_stock: '0',
  image_url: '',
  max_stock: '',
  ncm: '',
  cfop: '',
  csosn_cst: '',
  origem_mercadoria: '0',
  unidade_tributavel: 'UN',
};

export default function FullProducts() {
  const { width } = useWindowDimensions();
  const compactLayout = width < 900;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'negative' | 'inactive'>('all');
  const [sortMode, setSortMode] = useState<'name' | 'price_desc' | 'stock_asc'>('name');
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({ code: true, category: true, unit: true, cost: true, price: true, stock: true, status: true });
  const [categories, setCategories] = useState<any[]>([]);
  const [categorySummary, setCategorySummary] = useState<any>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [categoryDeleteOpen, setCategoryDeleteOpen] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [categoryForm, setCategoryForm] = useState<any>({ id: null, name: '', active: true });
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);
  const [transferToId, setTransferToId] = useState('');

  const activeCategories = useMemo(
    () => categories.filter((category) => category.active),
    [categories]
  );

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return rows
      .filter((row: any) => selectedCategory === 'all' || (selectedCategory === 'uncategorized' ? !row.category : row.category === selectedCategory))
      .filter((row: any) => stockFilter === 'all' || (stockFilter === 'low' && Number(row.stock || 0) <= Number(row.minimum || 0)) || (stockFilter === 'negative' && Number(row.stock || 0) < 0) || (stockFilter === 'inactive' && row.active === false))
      .filter((row: any) => !term || [row.name, row.code, row.category].filter(Boolean).some((field) => String(field).toLocaleLowerCase('pt-BR').includes(term)))
      .sort((a: any, b: any) => sortMode === 'price_desc' ? Number(b.price || 0) - Number(a.price || 0) : sortMode === 'stock_asc' ? Number(a.stock || 0) - Number(b.stock || 0) : String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }, [data, search, selectedCategory, stockFilter, sortMode]);

  const categoryNavigation = useMemo(() => {
    const rows = data?.rows || [];
    const counts = new Map<string, number>();
    let uncategorized = 0;
    rows.forEach((row: any) => row.category ? counts.set(row.category, (counts.get(row.category) || 0) + 1) : uncategorized++);
    return { uncategorized, rows: activeCategories.map((category) => ({ ...category, product_count: counts.get(category.name) || 0 })) };
  }, [data, activeCategories]);

  async function load() {
    try {
      setLoading(true);
      setError('');

      const result = await getFull('products');
      setData(result);
      await loadCategories();
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

  async function loadCategories() {
    try {
      setCategoryError('');
      const result = await getProductCategories();
      setCategories(result?.rows || []);
      setCategorySummary(result?.summary || null);
    } catch (e) {
      setCategoryError(
        e instanceof Error ? e.message : 'Falha ao carregar categorias.'
      );
    }
  }

  function startCategory(row?: any) {
    setCategoryError('');
    setCategoryManagerOpen(false);
    setCategoryForm({
      id: row?.id || null,
      name: row?.name || '',
      active: row?.active !== false,
    });
    setCategoryFormOpen(true);
  }

  async function saveCategory() {
    try {
      setCategoryBusy(true);
      setCategoryError('');
      const name = String(categoryForm.name || '').trim();
      if (name.length < 2) {
        setCategoryError('Informe um nome com pelo menos 2 caracteres.');
        return;
      }
      const result = categoryForm.id
        ? await updateProductCategory(categoryForm.id, {
            name,
            active: categoryForm.active,
          })
        : await createProductCategory({ name, active: categoryForm.active });
      setCategoryFormOpen(false);
      await loadCategories();
      setCategoryManagerOpen(true);
      showToast(
        result?.commands_queued
          ? `Categoria salva. ${result.commands_queued} produto(s) serão atualizados pelo PDV.`
          : 'Categoria salva com sucesso.'
      );
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : 'Falha ao salvar categoria.');
    } finally {
      setCategoryBusy(false);
    }
  }

  async function toggleCategory(row: any) {
    try {
      setCategoryBusy(true);
      setCategoryError('');
      await updateProductCategory(row.id, { active: !row.active });
      await loadCategories();
      showToast(row.active ? 'Categoria desativada.' : 'Categoria reativada.');
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : 'Falha ao alterar categoria.');
    } finally {
      setCategoryBusy(false);
    }
  }

  function startDeleteCategory(row: any) {
    setCategoryError('');
    setCategoryToDelete(row);
    setTransferToId('');
    setCategoryManagerOpen(false);
    setCategoryDeleteOpen(true);
  }

  async function removeCategory() {
    if (!categoryToDelete) return;
    try {
      setCategoryBusy(true);
      setCategoryError('');
      if (categoryToDelete.product_count > 0 && !transferToId) {
        setCategoryError('Selecione a categoria que receberá os produtos.');
        return;
      }
      const result = await deleteProductCategory(
        categoryToDelete.id,
        transferToId ? Number(transferToId) : null
      );
      setCategoryDeleteOpen(false);
      setCategoryToDelete(null);
      await loadCategories();
      setCategoryManagerOpen(true);
      showToast(
        result?.pending_sync
          ? 'Transferência enviada. A categoria será removida após a sincronização do PDV.'
          : 'Categoria excluída.'
      );
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : 'Falha ao excluir categoria.');
    } finally {
      setCategoryBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const edit = (row?: any) => {
    setModalError('');
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
        initial_stock: String(row.stock ?? 0).replace('.', ','),
        original_stock: String(row.stock ?? 0).replace('.', ','),
        image_url: row.image_url || '',
        max_stock:
          row.max_stock === null || row.max_stock === undefined
            ? ''
            : String(row.max_stock).replace('.', ','),
        ncm: row.fiscal?.ncm || '',
        cfop: row.fiscal?.cfop || '',
        csosn_cst: row.fiscal?.csosn_cst || '',
        origem_mercadoria: row.fiscal?.origem_mercadoria || '0',
        unidade_tributavel: row.fiscal?.unidade_tributavel || 'UN',
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
      setModalError('');

      if (!form.category) {
        setModalError('Selecione uma categoria.');
        return;
      }

      const stockValue = Number(
        String(form.initial_stock || '').replace(',', '.')
      );
      if (!Number.isFinite(stockValue)) {
        setModalError('Informe uma quantidade de estoque válida.');
        return;
      }

      const imageUrl = form.image_url.trim();
      if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
        setModalError('URL da foto deve começar com http:// ou https://.');
        return;
      }

      const maxStockText = form.max_stock.trim();
      const maxStock = maxStockText
        ? Number(maxStockText.replace(',', '.'))
        : null;
      if (maxStockText && (Number.isNaN(maxStock) || (maxStock as number) < 0)) {
        setModalError('Estoque máximo inválido.');
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
        initialStock: stockValue,
      };

      await enqueue(
        'products',
        'PRODUCT_UPSERT',
        {
          product,
        }
      );

      const originalStock = Number(
        String(form.original_stock || '0').replace(',', '.')
      );
      if (
        form.id &&
        Number.isFinite(originalStock) &&
        stockValue !== originalStock
      ) {
        await enqueue('stock', 'STOCK_ADJUST', {
          productId: String(form.id),
          newStock: stockValue,
          reason: 'Ajuste realizado no cadastro do produto',
        });
      }

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

        await setProductFiscal(form.code, {
          ncm: form.ncm.trim(),
          cfop: form.cfop.trim(),
          csosn_cst: form.csosn_cst.trim(),
          origem_mercadoria: form.origem_mercadoria.trim() || '0',
          unidade_tributavel: (form.unidade_tributavel.trim() || 'UN').toUpperCase(),
        }).catch(() => {});
      }

      setOpen(false);
      showToast(commandMessage);

      setTimeout(() => {
        load();
      }, 1200);
    } catch (e) {
      setModalError(
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
        <View style={s.toolbar}>
          <ActionButton
            label="Gerenciar categorias"
            tone="plain"
            onPress={() => {
              setCategoryError('');
              setCategoryManagerOpen(true);
              loadCategories();
            }}
          />
          <ActionButton
            label="+ Novo produto"
            tone="gold"
            onPress={() => edit()}
          />
        </View>
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
              icon="box"
              color="#3568B8"
              background="#EEF4FC"
            />

            <MetricCard
              label="Categorias"
              value={String(
                categorySummary?.categories ?? data.summary?.categories ?? 0
              )}
              note={categorySummary ? `${categorySummary.active} ativa(s)` : undefined}
              icon="tag"
              color="#B8862F"
              background="#FBF3E0"
            />

            <MetricCard
              label="Por peso"
              value={String(
                data.summary?.by_weight || 0
              )}
              icon="sliders"
              color="#25835A"
              background="#EAF7F0"
            />

            <MetricCard
              label="Balança"
              value={String(
                data.summary?.scale || 0
              )}
              icon="check-square"
              color="#66717D"
              background="#F2F4F5"
            />

            <MetricCard
              label="Classificados p/ nota fiscal"
              value={`${data.summary?.fiscal_classified || 0}/${data.summary?.products || 0}`}
              note="NCM + CFOP preenchidos"
              icon="file-text"
              color="#6A70A8"
              background="#F0F1FA"
            />
          </View>

          <View style={[productStyles.workspace, compactLayout && productStyles.workspaceCompact]}>
            {(!compactLayout || categoriesOpen) && <View style={[productStyles.categoryRail, compactLayout && productStyles.categoryRailCompact]}>
              <Text style={productStyles.railTitle}>Categorias</Text>
              <CategoryNav label="Todos os produtos" count={data.summary?.products || 0} active={selectedCategory === 'all'} onPress={() => setSelectedCategory('all')} />
              <CategoryNav label="Sem categoria" count={categoryNavigation.uncategorized} active={selectedCategory === 'uncategorized'} onPress={() => setSelectedCategory('uncategorized')} />
              {categoryNavigation.rows.map((category: any) => <CategoryNav key={String(category.id)} label={category.name} count={category.product_count} active={selectedCategory === category.name} onPress={() => setSelectedCategory(category.name)} />)}
              <Pressable style={productStyles.manageCategories} onPress={() => { setCategoryError(''); setCategoryManagerOpen(true); loadCategories(); }}>
                <Feather name="settings" size={14} color={theme.colors.text} /><Text style={productStyles.manageText}>Gerenciar categorias</Text>
              </Pressable>
            </View>}

            <View style={productStyles.productArea}>
              <View style={productStyles.tableToolbar}>
                {compactLayout && <Pressable style={productStyles.mobileCategoryButton} onPress={() => setCategoriesOpen((current) => !current)}><Feather name="tag" size={16} color={theme.colors.text} /><Text style={productStyles.mobileCategoryText}>Categorias</Text></Pressable>}
                <View style={productStyles.searchArea}><SearchBar value={search} onChangeText={setSearch} placeholder="Buscar por código ou nome" /></View>
                <View style={productStyles.tools}>
                  <ToolbarMenu icon="chevron-down" label="Ordenar" open={sortOpen} onPress={() => { setSortOpen(!sortOpen); setFilterOpen(false); setColumnsOpen(false); }}>
                    <MenuOption label="Nome (A–Z)" active={sortMode === 'name'} onPress={() => { setSortMode('name'); setSortOpen(false); }} />
                    <MenuOption label="Maior preço" active={sortMode === 'price_desc'} onPress={() => { setSortMode('price_desc'); setSortOpen(false); }} />
                    <MenuOption label="Menor estoque" active={sortMode === 'stock_asc'} onPress={() => { setSortMode('stock_asc'); setSortOpen(false); }} />
                  </ToolbarMenu>
                  <ToolbarMenu icon="filter" label="Filtrar" open={filterOpen} onPress={() => { setFilterOpen(!filterOpen); setSortOpen(false); setColumnsOpen(false); }}>
                    {[['all','Todos'],['low','Estoque baixo'],['negative','Estoque negativo'],['inactive','Produtos inativos']].map(([value,label]) => <MenuOption key={value} label={label} active={stockFilter === value} onPress={() => { setStockFilter(value as any); setFilterOpen(false); }} />)}
                  </ToolbarMenu>
                  <ToolbarMenu icon="columns" label="Colunas" open={columnsOpen} onPress={() => { setColumnsOpen(!columnsOpen); setSortOpen(false); setFilterOpen(false); }}>
                    {Object.entries({ code: 'Código', category: 'Categoria', unit: 'Unidade', cost: 'Custo', price: 'Preço de venda', stock: 'Estoque', status: 'Status' }).map(([key,label]) => <MenuOption key={key} label={label} active={visibleColumns[key]} onPress={() => setVisibleColumns((current) => ({ ...current, [key]: !current[key] }))} />)}
                  </ToolbarMenu>
                </View>
              </View>

              <View style={productStyles.resultLine}><Text style={productStyles.resultText}>{filteredRows.length} produto(s)</Text></View>
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={productStyles.tableScroll}>
                <View style={productStyles.table}>
                  <View style={[productStyles.tableRow, productStyles.tableHead]}>
                    <Text style={[productStyles.headText, productStyles.productColumn]}>PRODUTO</Text>
                    {visibleColumns.code && <Text style={[productStyles.headText, productStyles.smallColumn]}>CÓDIGO</Text>}
                    {visibleColumns.category && <Text style={[productStyles.headText, productStyles.mediumColumn]}>CATEGORIA</Text>}
                    {visibleColumns.unit && <Text style={[productStyles.headText, productStyles.tinyColumn]}>UN.</Text>}
                    {visibleColumns.cost && <Text style={[productStyles.headText, productStyles.valueColumn]}>CUSTO</Text>}
                    {visibleColumns.price && <Text style={[productStyles.headText, productStyles.valueColumn]}>VENDA</Text>}
                    {visibleColumns.stock && <Text style={[productStyles.headText, productStyles.stockColumn]}>ESTOQUE</Text>}
                    {visibleColumns.status && <Text style={[productStyles.headText, productStyles.statusColumn]}>STATUS</Text>}
                    <View style={productStyles.actionColumn} />
                  </View>
                  {filteredRows.map((row: any) => {
                    const stock = Number(row.stock || 0); const minimum = Number(row.minimum || 0);
                    const stockTone = stock < 0 ? productStyles.stockNegative : stock <= minimum ? productStyles.stockLow : productStyles.stockOk;
                    return <View key={String(row.id)} style={productStyles.tableRow}>
                      <View style={productStyles.productColumn}>{row.image_url ? <Image source={{ uri: row.image_url }} style={thumbStyles.thumb} /> : <View style={thumbStyles.thumbPlaceholder}><Text style={thumbStyles.thumbPlaceholderText}>{(row.name || '?').charAt(0).toUpperCase()}</Text></View>}<View style={productStyles.productNameArea}><Text style={productStyles.productName} numberOfLines={1}>{row.name}</Text><Text style={productStyles.productMeta} numberOfLines={1}>Mínimo {row.minimum || 0}{row.scale_enabled ? ` • PLU ${row.scale_plu}` : ''}</Text></View></View>
                      {visibleColumns.code && <Text style={[productStyles.cellText, productStyles.smallColumn]}>{row.code || '—'}</Text>}
                      {visibleColumns.category && <Text style={[productStyles.cellText, productStyles.mediumColumn]}>{row.category || 'Sem categoria'}</Text>}
                      {visibleColumns.unit && <Text style={[productStyles.cellText, productStyles.tinyColumn]}>{row.sale_mode === 'weight' ? 'kg' : row.unit}</Text>}
                      {visibleColumns.cost && <Text style={[productStyles.cellText, productStyles.valueColumn]}>{money(row.cost)}</Text>}
                      {visibleColumns.price && <Text style={[productStyles.cellStrong, productStyles.valueColumn]}>{money(row.price)}</Text>}
                      {visibleColumns.stock && <Text style={[productStyles.cellStrong, productStyles.stockColumn, stockTone]}>{row.stock}</Text>}
                      {visibleColumns.status && <View style={productStyles.statusColumn}><Text style={[productStyles.statusBadge, row.active === false && productStyles.statusInactive]}>{row.active === false ? 'Inativo' : 'Ativo'}</Text></View>}
                      <View style={productStyles.actionColumn}><Pressable onPress={() => edit(row)} style={productStyles.editButton}><Feather name="edit-2" size={14} color={theme.colors.text} /><Text style={productStyles.editText}>Editar</Text></Pressable></View>
                    </View>;
                  })}
                  {filteredRows.length === 0 && <Text style={s.empty}>Nenhum produto encontrado com estes filtros.</Text>}
                </View>
              </ScrollView>
            </View>
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
        errorText={modalError}
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

        <AccountPicker
          label="Categoria *"
          value={form.category}
          onChange={(value) => set('category', value)}
          emptyLabel="Selecione uma categoria"
          options={[
            ...activeCategories.map((category) => ({
              label: category.name,
              value: category.name,
            })),
            ...(form.category && !activeCategories.some((category) => category.name === form.category)
              ? [{ label: `${form.category} (inativa)`, value: form.category }]
              : []),
          ]}
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

        <Field
          label={form.id ? 'Quantidade atual em estoque *' : 'Quantidade inicial em estoque *'}
          value={form.initial_stock}
          onChangeText={(value) =>
            set('initial_stock', value)
          }
          keyboardType="decimal-pad"
        />

        {!!form.id && (
          <Notice text="Se a quantidade for alterada, o sistema registrará um ajuste de inventário no histórico do estoque." />
        )}

        <Text style={thumbStyles.fiscalSectionTitle}>
          Classificação fiscal (necessária para emitir nota fiscal)
        </Text>

        <Field
          label="NCM"
          value={form.ncm}
          onChangeText={(value) => set('ncm', value)}
          placeholder="Ex.: 04012000"
          keyboardType="number-pad"
        />

        <Field
          label="CFOP"
          value={form.cfop}
          onChangeText={(value) => set('cfop', value)}
          placeholder="Ex.: 5102"
          keyboardType="number-pad"
        />

        <Field
          label="Situação tributária (CSOSN ou CST, conforme o regime da empresa)"
          value={form.csosn_cst}
          onChangeText={(value) => set('csosn_cst', value)}
          placeholder="Ex.: 102 (Simples Nacional) ou 060"
        />

        <Choice
          label="Origem da mercadoria"
          value={form.origem_mercadoria}
          onChange={(value) => set('origem_mercadoria', value)}
          options={[
            { label: 'Nacional', value: '0' },
            { label: 'Importada (direta)', value: '1' },
            { label: 'Importada (mercado interno)', value: '2' },
          ]}
        />

        <Field
          label="Unidade tributável"
          value={form.unidade_tributavel}
          onChangeText={(value) => set('unidade_tributavel', value)}
          placeholder="Ex.: UN, KG, CX"
        />

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

      <FormModal
        visible={categoryManagerOpen}
        title="Gerenciador de categorias"
        onCancel={() => setCategoryManagerOpen(false)}
        onSave={() => setCategoryManagerOpen(false)}
        saveLabel="Concluir"
        busy={categoryBusy}
        errorText={categoryError}
        wide
      >
        <View style={s.toolbar}>
          <ActionButton
            label="+ Nova categoria"
            tone="gold"
            onPress={() => startCategory()}
          />
        </View>

        <Notice text="Categorias desativadas continuam nos produtos já cadastrados, mas deixam de aparecer para novos cadastros." />

        {categories.length > 0 ? (
          categories.map((category) => (
            <View key={String(category.id)} style={s.row}>
              <View style={s.main}>
                <Text style={s.name}>{category.name}</Text>
                <Text style={s.meta}>
                  {category.product_count} produto(s) • {category.active ? 'Ativa' : 'Inativa'}
                </Text>
              </View>
              <View style={s.right}>
                <View style={s.toolbar}>
                  <ActionButton
                    label="Editar"
                    tone="plain"
                    onPress={() => startCategory(category)}
                  />
                  <ActionButton
                    label={category.active ? 'Desativar' : 'Ativar'}
                    tone="plain"
                    onPress={() => toggleCategory(category)}
                  />
                  <ActionButton
                    label="Excluir"
                    tone="danger"
                    onPress={() => startDeleteCategory(category)}
                  />
                </View>
              </View>
            </View>
          ))
        ) : (
          <Text style={s.empty}>Nenhuma categoria cadastrada.</Text>
        )}
      </FormModal>

      <FormModal
        visible={categoryFormOpen}
        title={categoryForm.id ? 'Editar categoria' : 'Nova categoria'}
        onCancel={() => {
          setCategoryFormOpen(false);
          setCategoryManagerOpen(true);
        }}
        onSave={saveCategory}
        busy={categoryBusy}
        errorText={categoryError}
      >
        <Field
          label="Nome da categoria *"
          value={categoryForm.name || ''}
          onChangeText={(value) => setCategoryForm((current: any) => ({ ...current, name: value }))}
          placeholder="Ex.: Queijos"
        />
        <Choice
          label="Status"
          value={categoryForm.active ? 'true' : 'false'}
          onChange={(value) => setCategoryForm((current: any) => ({ ...current, active: value === 'true' }))}
          options={[
            { label: 'Ativa', value: 'true' },
            { label: 'Inativa', value: 'false' },
          ]}
        />
      </FormModal>

      <FormModal
        visible={categoryDeleteOpen}
        title="Excluir categoria?"
        onCancel={() => {
          setCategoryDeleteOpen(false);
          setCategoryManagerOpen(true);
        }}
        onSave={removeCategory}
        saveLabel={categoryToDelete?.product_count > 0 ? 'Transferir e excluir' : 'Excluir categoria'}
        busy={categoryBusy}
        errorText={categoryError}
      >
        <Notice
          tone="error"
          text={categoryToDelete?.product_count > 0
            ? `A categoria ${categoryToDelete?.name} possui ${categoryToDelete?.product_count} produto(s). Para excluí-la, escolha abaixo para onde eles serão transferidos.`
            : `A categoria ${categoryToDelete?.name || ''} será excluída permanentemente.`}
        />
        {categoryToDelete?.product_count > 0 && (
          <AccountPicker
            label="Transferir produtos para *"
            value={transferToId}
            onChange={setTransferToId}
            emptyLabel="Selecione a categoria de destino"
            options={activeCategories
              .filter((category) => category.id !== categoryToDelete?.id)
              .map((category) => ({
                label: category.name,
                value: String(category.id),
              }))}
          />
        )}
      </FormModal>
    </AdminShell>
  );
}

function CategoryNav({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[productStyles.categoryItem, active && productStyles.categoryItemActive]}>
    <Text style={[productStyles.categoryLabel, active && productStyles.categoryLabelActive]} numberOfLines={1}>{label}</Text>
    <Text style={[productStyles.categoryCount, active && productStyles.categoryCountActive]}>{count}</Text>
  </Pressable>;
}

function ToolbarMenu({ icon, label, open, onPress, children }: { icon: any; label: string; open: boolean; onPress: () => void; children: any }) {
  return <View style={productStyles.toolWrap}>
    <Pressable onPress={onPress} style={[productStyles.toolButton, open && productStyles.toolButtonActive]} accessibilityLabel={label}>
      <Feather name={icon} size={17} color={theme.colors.text} />
    </Pressable>
    {open && <View style={productStyles.toolMenu}><Text style={productStyles.toolMenuTitle}>{label}</Text>{children}</View>}
  </View>;
}

function MenuOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={productStyles.menuOption}>
    <Text style={[productStyles.menuOptionText, active && productStyles.menuOptionActive]}>{label}</Text>
    {active && <Feather name="check" size={15} color="#3568B8" />}
  </Pressable>;
}

const productStyles = StyleSheet.create({
  workspace: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  workspaceCompact: { flexDirection: 'column' },
  categoryRail: { width: 220, flexShrink: 0, backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, padding: 10, alignSelf: 'flex-start' },
  categoryRailCompact: { width: '100%' },
  railTitle: { fontFamily: 'Sora_700Bold', fontSize: 15, color: theme.colors.text, paddingHorizontal: 9, paddingVertical: 8 },
  categoryItem: { minHeight: 40, paddingHorizontal: 9, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  categoryItemActive: { backgroundColor: '#EEF4FC' }, categoryLabel: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.colors.text },
  categoryLabelActive: { fontFamily: 'Inter_700Bold', color: '#285DA9' }, categoryCount: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: theme.colors.muted }, categoryCountActive: { color: '#285DA9' },
  manageCategories: { minHeight: 42, marginTop: 8, paddingHorizontal: 9, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: 7 },
  manageText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.text },
  productArea: { flex: 1, minWidth: 0, backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, zIndex: 2 },
  tableToolbar: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 15 }, searchArea: { flex: 1, minWidth: 220 }, tools: { flexDirection: 'row', gap: 7 },
  mobileCategoryButton: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }, mobileCategoryText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.colors.text },
  toolWrap: { position: 'relative' }, toolButton: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, toolButtonActive: { borderColor: '#3568B8', backgroundColor: '#EEF4FC' },
  toolMenu: { position: 'absolute', zIndex: 30, top: 47, right: 0, width: 220, paddingVertical: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, shadowColor: '#000', shadowOpacity: .12, shadowRadius: 14, elevation: 10 },
  toolMenuTitle: { paddingHorizontal: 13, paddingVertical: 7, fontFamily: 'Sora_700Bold', fontSize: 13.5, color: theme.colors.text }, menuOption: { minHeight: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, menuOptionText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.colors.text }, menuOptionActive: { fontFamily: 'Inter_600SemiBold', color: '#285DA9' },
  resultLine: { paddingHorizontal: 14, paddingBottom: 10 }, resultText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: theme.colors.muted },
  tableScroll: { minWidth: '100%' }, table: { minWidth: 900, flex: 1 }, tableRow: { minHeight: 66, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' }, tableHead: { minHeight: 38, backgroundColor: '#F7F6F3' },
  headText: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, letterSpacing: .45, color: theme.colors.muted }, cellText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: theme.colors.text }, cellStrong: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: theme.colors.text },
  productColumn: { width: 260, flexDirection: 'row', alignItems: 'center', gap: 10 }, productNameArea: { flex: 1, minWidth: 0 }, productName: { fontFamily: 'Inter_700Bold', fontSize: 13.5, color: theme.colors.text }, productMeta: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 11.5, color: theme.colors.muted },
  tinyColumn: { width: 60 }, smallColumn: { width: 100 }, mediumColumn: { width: 145 }, valueColumn: { width: 115, textAlign: 'right', paddingRight: 16 }, stockColumn: { width: 90, textAlign: 'right', paddingRight: 16 }, statusColumn: { width: 85, alignItems: 'center' }, actionColumn: { width: 88, alignItems: 'flex-end' },
  stockNegative: { color: theme.colors.danger }, stockLow: { color: '#B06D17' }, stockOk: { color: theme.colors.success }, statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#EAF7EF', fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.colors.success }, statusInactive: { backgroundColor: '#EEF0F2', color: theme.colors.muted },
  editButton: { minHeight: 34, paddingHorizontal: 9, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }, editText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: theme.colors.text },
});

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
  fiscalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.muted,
    marginTop: 6,
  },
});
