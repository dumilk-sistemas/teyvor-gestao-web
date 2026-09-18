import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  Field,
  FormModal,
  Notice,
  SearchablePicker,
  confirmAction,
} from '@/components/FormKit';
import {
  createFinancialCategory,
  deleteFinancialCategory,
  getFinancialCategories,
  updateFinancialCategory,
} from '@/services/fullApi';
import { theme } from '@/constants/theme';

type CategoryType = 'expense' | 'revenue' | 'non_operating';

const TYPES: Array<{ label: string; value: CategoryType; description: string }> = [
  { label: 'Despesa', value: 'expense', description: 'Contas a pagar e saídas operacionais' },
  { label: 'Receita', value: 'revenue', description: 'Contas a receber e receitas do negócio' },
  { label: 'Entrada não operacional', value: 'non_operating', description: 'Aportes, empréstimos e outras entradas que não são faturamento' },
];

const typeLabel = (value: string) => TYPES.find((item) => item.value === value)?.label || value;

const DRE_GROUPS = [
  { label: 'Receita bruta', value: 'gross_revenue', types: ['revenue'], description: 'Vendas, serviços e outras receitas operacionais' },
  { label: 'Deduções da receita', value: 'revenue_deduction', types: ['expense'], description: 'Descontos, devoluções e tributos sobre vendas' },
  { label: 'Custos diretos', value: 'cost_of_goods', types: ['expense'], description: 'Custos diretamente ligados à mercadoria ou serviço' },
  { label: 'Despesa operacional', value: 'operating_expense', types: ['expense'], description: 'Aluguel, energia, pessoal, manutenção e administração' },
  { label: 'Receita financeira', value: 'financial_revenue', types: ['revenue', 'non_operating'], description: 'Rendimentos, juros recebidos e descontos obtidos' },
  { label: 'Despesa financeira', value: 'financial_expense', types: ['expense'], description: 'Juros, tarifas bancárias e encargos financeiros' },
  { label: 'Tributos sobre o resultado', value: 'taxes', types: ['expense'], description: 'Impostos calculados sobre o resultado' },
  { label: 'Outra receita', value: 'other_revenue', types: ['revenue', 'non_operating'], description: 'Receita que não pertence à operação principal' },
  { label: 'Outra despesa', value: 'other_expense', types: ['expense'], description: 'Despesa não pertencente à operação principal' },
  { label: 'Não considerar na DRE', value: 'excluded', types: ['expense', 'revenue', 'non_operating'], description: 'Aportes, empréstimos, transferências e movimentos patrimoniais' },
];

const defaultDreGroup = (type: CategoryType) => type === 'revenue' ? 'gross_revenue' : type === 'non_operating' ? 'excluded' : 'operating_expense';
const dreLabel = (value: string) => DRE_GROUPS.find((item) => item.value === value)?.label || 'Revisar classificação';

export function FinancialCategoriesModal({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | CategoryType>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', category_type: 'expense', dre_group: 'operating_expense', parent_id: '', active: true });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [transferTo, setTransferTo] = useState('');

  async function load() {
    try {
      setLoading(true);
      setError('');
      const result = await getFinancialCategories();
      setRows(result.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as categorias financeiras.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const visibleRows = useMemo(
    () => rows.filter((row) => filter === 'all' || row.category_type === filter),
    [filter, rows]
  );

  const parentOptions = rows
    .filter((row) => row.active && row.category_type === form.category_type && row.id !== form.id)
    .map((row) => ({ label: row.name, value: String(row.id), description: typeLabel(row.category_type) }));

  const transferOptions = rows
    .filter((row) => row.active && row.category_type === deleteTarget?.category_type && row.id !== deleteTarget?.id)
    .map((row) => ({ label: row.name, value: String(row.id), description: row.parent_name || typeLabel(row.category_type) }));

  const dreOptions = DRE_GROUPS
    .filter((item) => item.types.includes(form.category_type))
    .map(({ label, value, description }) => ({ label, value, description }));

  function startCreate(type: CategoryType = 'expense') {
    setForm({ name: '', category_type: type, dre_group: defaultDreGroup(type), parent_id: '', active: true });
    setFormError('');
    setFormOpen(true);
  }

  function startEdit(row: any) {
    setForm({ ...row, parent_id: row.parent_id ? String(row.parent_id) : '' });
    setFormError('');
    setFormOpen(true);
  }

  async function save() {
    if (String(form.name || '').trim().length < 2) {
      setFormError('Informe um nome com pelo menos dois caracteres.');
      return;
    }
    try {
      setBusy(true);
      setFormError('');
      const payload = {
        name: String(form.name).trim(),
        dre_group: form.dre_group || defaultDreGroup(form.category_type),
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        active: Boolean(form.active),
      };
      if (form.id) await updateFinancialCategory(form.id, payload);
      else await createFinancialCategory({ ...payload, category_type: form.category_type });
      setFormOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível salvar a categoria.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: any) {
    try {
      await updateFinancialCategory(row.id, { active: !row.active });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a categoria.');
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    if (deleteTarget.entry_count > 0 && !transferTo) {
      setError('Selecione uma categoria de destino para os lançamentos vinculados.');
      return;
    }
    const confirmed = await confirmAction(
      'Excluir categoria financeira',
      `A categoria ${deleteTarget.name} será removida. Esta ação exige atenção e ficará registrada. Deseja continuar?`
    );
    if (!confirmed) return;
    try {
      setBusy(true);
      setError('');
      await deleteFinancialCategory(deleteTarget.id, transferTo ? Number(transferTo) : null);
      setDeleteTarget(null);
      setTransferTo('');
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir a categoria.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Categorias financeiras</Text>
                <Text style={styles.subtitle}>Classifique receitas e despesas para o fluxo de caixa e os relatórios</Text>
              </View>
              <Pressable onPress={onClose}><Text style={styles.close}>×</Text></Pressable>
            </View>
            <View style={styles.toolbar}>
              <View style={styles.filters}>
                {[{ label: 'Todas', value: 'all' }, ...TYPES].map((item: any) => (
                  <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterActive]}>
                    <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <ActionButton label="+ Nova categoria" tone="gold" onPress={() => startCreate(filter === 'all' ? 'expense' : filter)} />
            </View>
            {!!error && <View style={styles.notice}><Notice text={error} tone="error" /></View>}
            <ScrollView contentContainerStyle={styles.list}>
              {loading && rows.length === 0 ? <Text style={styles.empty}>Carregando...</Text> : visibleRows.length === 0 ? <Text style={styles.empty}>Nenhuma categoria neste grupo.</Text> : visibleRows.map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={styles.rowMain}>
                    <View style={styles.nameLine}>
                      <Text style={styles.name}>{row.name}</Text>
                      <Text style={[styles.badge, !row.active && styles.badgeInactive]}>{row.active ? typeLabel(row.category_type) : 'Inativa'}</Text>
                    </View>
                    <Text style={styles.meta}>{row.parent_name ? `${row.parent_name} • ` : ''}{row.entry_count} lançamento(s) • DRE: {dreLabel(row.dre_group)}</Text>
                    {!row.dre_configured && <Text style={styles.review}>Revisar classificação antes de usar a DRE</Text>}
                  </View>
                  <View style={styles.actions}>
                    <ActionButton label="Editar" tone="plain" onPress={() => startEdit(row)} />
                    <ActionButton label={row.active ? 'Desativar' : 'Ativar'} tone="plain" onPress={() => toggle(row)} />
                    <ActionButton label="Excluir" tone="danger" onPress={() => { setError(''); setTransferTo(''); setDeleteTarget(row); }} />
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <FormModal visible={formOpen} title={form.id ? 'Editar categoria financeira' : 'Nova categoria financeira'} onCancel={() => setFormOpen(false)} onSave={save} busy={busy} errorText={formError}>
        {!form.id && <SearchablePicker label="Tipo *" value={form.category_type} onChange={(value) => setForm((current: any) => ({ ...current, category_type: value, dre_group: defaultDreGroup(value as CategoryType), parent_id: '' }))} options={TYPES} />}
        <Field label="Nome da categoria *" value={form.name || ''} onChangeText={(value) => setForm((current: any) => ({ ...current, name: value }))} placeholder={form.category_type === 'revenue' ? 'Ex.: Venda de mercadorias' : 'Ex.: Energia elétrica'} />
        <SearchablePicker label="Grupo na DRE *" value={form.dre_group || defaultDreGroup(form.category_type)} onChange={(value) => setForm((current: any) => ({ ...current, dre_group: value }))} options={dreOptions} />
        <Notice text="Esta classificação define em qual linha a categoria será somada na DRE gerencial. Aportes, empréstimos e transferências não devem compor o resultado." />
        <SearchablePicker label="Categoria superior (opcional)" value={form.parent_id || ''} onChange={(value) => setForm((current: any) => ({ ...current, parent_id: value }))} options={[{ label: 'Sem categoria superior', value: '' }, ...parentOptions]} />
      </FormModal>

      <FormModal visible={!!deleteTarget} title="Excluir categoria financeira?" onCancel={() => { setDeleteTarget(null); setTransferTo(''); }} onSave={remove} saveLabel={busy ? 'Excluindo...' : 'Confirmar exclusão'} busy={busy} errorText={error}>
        <Notice tone="error" text={`A exclusão de ${deleteTarget?.name || 'uma categoria'} exige atenção e não pode deixar lançamentos sem classificação.`} />
        <Text style={styles.deleteText}>{deleteTarget?.entry_count || 0} lançamento(s) estão vinculados a esta categoria.</Text>
        {Number(deleteTarget?.entry_count || 0) > 0 && <SearchablePicker label="Transferir lançamentos para *" value={transferTo} onChange={setTransferTo} options={transferOptions} placeholder="Selecione a categoria de destino" />}
      </FormModal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.55)',alignItems:'center',justifyContent:'center',padding:18},modal:{width:'100%',maxWidth:900,maxHeight:'92%',backgroundColor:'#FFF',borderRadius:18,overflow:'hidden'},header:{padding:20,borderBottomWidth:1,borderBottomColor:theme.colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{fontFamily:'Sora_700Bold',fontSize:20,color:theme.colors.text},subtitle:{fontFamily:'Inter_400Regular',fontSize:13,color:theme.colors.muted,marginTop:4},close:{fontSize:30,color:theme.colors.muted},toolbar:{padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'},filters:{flexDirection:'row',gap:7,flexWrap:'wrap'},filter:{borderWidth:1,borderColor:theme.colors.border,borderRadius:999,paddingHorizontal:11,paddingVertical:7},filterActive:{backgroundColor:theme.colors.black,borderColor:theme.colors.black},filterText:{fontFamily:'Inter_600SemiBold',fontSize:12,color:theme.colors.text},filterTextActive:{color:'#FFF'},notice:{paddingHorizontal:14},list:{padding:14,gap:9},row:{borderWidth:1,borderColor:theme.colors.border,borderRadius:12,padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'},rowMain:{flex:1,minWidth:240},nameLine:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},name:{fontFamily:'Inter_700Bold',fontSize:14,color:theme.colors.text},meta:{fontFamily:'Inter_400Regular',fontSize:12.5,color:theme.colors.muted,marginTop:5},review:{fontFamily:'Inter_600SemiBold',fontSize:11.5,color:'#9A6A12',marginTop:4},badge:{fontFamily:'Inter_700Bold',fontSize:10.5,paddingHorizontal:8,paddingVertical:4,borderRadius:999,backgroundColor:'#EAF7EF',color:theme.colors.success},badgeInactive:{backgroundColor:'#F2F3F4',color:theme.colors.muted},actions:{flexDirection:'row',gap:7,flexWrap:'wrap'},empty:{padding:26,textAlign:'center',color:theme.colors.muted},deleteText:{fontSize:14,color:theme.colors.text},
});
