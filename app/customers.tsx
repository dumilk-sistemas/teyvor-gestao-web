import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { useToast } from '@/components/Toast';
import { theme, useThemeColors } from '@/constants/theme';
import { createCustomer, getCustomers, updateCustomer } from '@/services/api';
import type { CustomerRow, CustomerWrite, CustomersData } from '@/types/api';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const dateBR = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const blankForm = (): CustomerWrite => ({ name: '', document: '', phone: '', email: '', city: '', notes: '', active: true });
const digits = (value: string) => value.replace(/\D/g, '');

function formatDocument(value: string) {
  const number = digits(value).slice(0, 14);
  if (number.length <= 11) {
    return number.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return number.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export default function Customers() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [data, setData] = useState<CustomersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState<CustomerWrite>(blankForm());
  const [historyId, setHistoryId] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true); setError('');
      setData(await getCustomers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar clientes.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm(blankForm()); setError(''); setFormOpen(true);
  }

  function openEdit(row: CustomerRow) {
    setEditing(row);
    setForm({ name: row.name, document: row.document, phone: row.phone, email: row.email, city: row.city, notes: row.notes, active: row.active });
    setError(''); setFormOpen(true);
  }

  function closeForm() { if (!saving) { setFormOpen(false); setEditing(null); } }

  async function save() {
    if (form.name.trim().length < 2) { setError('Informe o nome ou a razão social.'); return; }
    const document = digits(form.document);
    if (document && document.length !== 11 && document.length !== 14) { setError('CPF deve ter 11 dígitos e CNPJ deve ter 14.'); return; }
    try {
      setSaving(true); setError('');
      const payload = { ...form, name: form.name.trim(), document };
      if (editing?.id !== undefined) await updateCustomer(editing.id, payload);
      else await createCustomer(payload);
      setFormOpen(false); setEditing(null);
      showToast('Cliente salvo. O sincronizador enviará a alteração ao caixa.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o cliente.');
    } finally { setSaving(false); }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return data?.rows || [];
    const termDigits = digits(term);
    return (data?.rows || []).filter(row =>
      row.name.toLocaleLowerCase('pt-BR').includes(term) ||
      row.city.toLocaleLowerCase('pt-BR').includes(term) ||
      (!!termDigits && digits(row.document).includes(termDigits)) ||
      (!!termDigits && digits(row.phone).includes(termDigits))
    );
  }, [data, search]);

  return <AdminShell
    title="Clientes"
    subtitle="Cadastro e histórico de compras sincronizados com o PDV"
    syncText={data?.last_sync_at ? `Atualizado em ${new Date(data.last_sync_at).toLocaleString('pt-BR')}` : 'Aguardando sincronização'}
    refreshing={loading}
    onRefresh={load}
    customersWrite
    syncNote
    headerActions={
      <Pressable style={styles.primary} onPress={openNew}>
        <Text style={styles.primaryText}>+ Novo cliente</Text>
      </Pressable>
    }
  >
    {!!error && <Text style={styles.error}>{error}</Text>}

    {formOpen && <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <View><Text style={styles.formTitle}>{editing ? 'Editar cliente' : 'Novo cliente'}</Text><Text style={styles.formSub}>Os campos com * são obrigatórios.</Text></View>
        <Pressable onPress={closeForm}><Text style={styles.cancelLink}>Fechar</Text></Pressable>
      </View>
      <View style={styles.fields}>
        <View style={styles.fieldWide}><Text style={styles.label}>Nome / Razão social *</Text><TextInput value={form.name} onChangeText={name => setForm({...form, name})} style={styles.input} placeholder="Nome completo ou razão social" /></View>
        <View style={styles.field}><Text style={styles.label}>CPF / CNPJ</Text><TextInput value={formatDocument(form.document)} onChangeText={document => setForm({...form, document})} style={styles.input} keyboardType="numeric" placeholder="Somente números" /></View>
        <View style={styles.field}><Text style={styles.label}>Telefone / WhatsApp</Text><TextInput value={form.phone} onChangeText={phone => setForm({...form, phone})} style={styles.input} keyboardType="phone-pad" placeholder="(35) 99999-9999" /></View>
        <View style={styles.field}><Text style={styles.label}>E-mail</Text><TextInput value={form.email} onChangeText={email => setForm({...form, email})} style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="cliente@email.com" /></View>
        <View style={styles.field}><Text style={styles.label}>Cidade</Text><TextInput value={form.city} onChangeText={city => setForm({...form, city})} style={styles.input} placeholder="Cidade" /></View>
        <View style={styles.fieldWide}><Text style={styles.label}>Observações</Text><TextInput value={form.notes} onChangeText={notes => setForm({...form, notes})} style={[styles.input, styles.notes]} multiline placeholder="Preferências, endereço ou observações" /></View>
      </View>
      <View style={styles.formActions}>
        <View style={styles.activeChoice}>
          <Pressable style={[styles.choice, form.active && styles.choiceActive]} onPress={() => setForm({...form, active: true})}><Text style={[styles.choiceText, form.active && styles.choiceTextActive]}>Ativo</Text></Pressable>
          <Pressable style={[styles.choice, !form.active && styles.choiceInactive]} onPress={() => setForm({...form, active: false})}><Text style={[styles.choiceText, !form.active && styles.choiceTextActive]}>Inativo</Text></Pressable>
        </View>
        <View style={styles.actionButtons}><Pressable style={styles.secondary} onPress={closeForm}><Text style={styles.secondaryText}>Cancelar</Text></Pressable><Pressable disabled={saving} style={[styles.primary, saving && styles.disabled]} onPress={save}><Text style={styles.primaryText}>{saving ? 'Salvando...' : 'Salvar cliente'}</Text></Pressable></View>
      </View>
    </View>}

    {data && <>
      <View style={styles.grid}>
        <MetricCard label="Clientes" value={String(data.summary.customers)} icon="users" color="#3568B8" background="#EEF4FC" />
        <MetricCard label="Ativos" value={String(data.summary.active)} icon="user-check" color="#25835A" background="#EAF7F0" />
        <MetricCard label="Faturamento identificado" value={money(data.summary.identified_revenue)} icon="dollar-sign" color="#B8862F" background="#FBF3E0" />
        <MetricCard label="Vendas sem cliente" value={String(data.summary.unidentified_sales)} icon="alert-circle" color="#C84E4E" background="#FFF3F3" />
      </View>
      <View style={styles.toolbar}><TextInput value={search} onChangeText={setSearch} style={styles.search} placeholder="Buscar por nome, CPF/CNPJ, telefone ou cidade" /></View>
      <View style={styles.card}>
        <Text style={styles.title}>Clientes ({filtered.length})</Text>
        {filtered.length ? filtered.map((row, index) => {
          const expanded = historyId === String(row.id);
          return <View key={String(row.id || index)} style={styles.customerBlock}>
            <View style={styles.row}>
              <View style={styles.main}><Text style={styles.desc}>{row.name}</Text><Text style={styles.meta}>{row.document ? formatDocument(row.document) : 'Sem CPF/CNPJ'}{row.phone ? ` • ${row.phone}` : ''}{row.city ? ` • ${row.city}` : ''}</Text><Text style={styles.meta}>{row.email || 'Sem e-mail'}{row.notes ? ` • ${row.notes}` : ''}</Text></View>
              <View style={styles.right}><Text style={styles.amount}>{money(row.total)}</Text><Text style={styles.meta}>{row.purchases} compra(s) • Ticket {money(row.ticket_average)}</Text><Text style={styles.meta}>{row.last_purchase_date ? `Última ${dateBR(row.last_purchase_date)}` : 'Sem compras'}</Text><Text style={[styles.status, row.active ? styles.ok : styles.bad]}>{row.active ? 'Ativo' : 'Inativo'}</Text></View>
            </View>
            <View style={styles.rowActions}><Pressable style={styles.smallButton} onPress={() => openEdit(row)}><Text style={styles.smallButtonText}>Editar</Text></Pressable><Pressable style={styles.smallButton} onPress={() => setHistoryId(expanded ? null : String(row.id))}><Text style={styles.smallButtonText}>{expanded ? 'Ocultar histórico' : 'Ver histórico'}</Text></Pressable></View>
            {expanded && <View style={styles.history}><Text style={styles.historyTitle}>Histórico de compras</Text>{row.history.length ? row.history.map((sale, saleIndex) => <View key={String(sale.id || saleIndex)} style={styles.historyRow}><View><Text style={styles.historyName}>Venda #{sale.number || '—'} • {dateBR(sale.date)} {sale.time}</Text><Text style={styles.meta}>{sale.summary} • {sale.payment}</Text></View><Text style={styles.historyValue}>{money(sale.total)}</Text></View>) : <Text style={styles.empty}>Nenhuma compra identificada para este cliente.</Text>}</View>}
          </View>;
        }) : <Text style={styles.empty}>Nenhum cliente encontrado.</Text>}
      </View>
    </>}
  </AdminShell>;
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10}, error:{color:theme.colors.danger,fontSize:14,fontWeight:'700'},
  toolbar:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center',justifyContent:'space-between'},search:{minWidth:260,flex:1,height:46,borderWidth:1,borderColor:theme.colors.border,borderRadius:theme.radius.sm,paddingHorizontal:14,backgroundColor:'#FFF',fontSize:14,color:theme.colors.text},
  formCard:{backgroundColor:'#FFF',borderWidth:1,borderColor:c.gold,borderRadius:theme.radius.md,padding:18,gap:16},formHeader:{flexDirection:'row',justifyContent:'space-between',gap:12},formTitle:{fontSize:21,fontWeight:'900',color:theme.colors.text},formSub:{fontSize:13,color:theme.colors.muted,marginTop:4},cancelLink:{color:theme.colors.danger,fontWeight:'800'},fields:{flexDirection:'row',flexWrap:'wrap',gap:12},field:{flexGrow:1,flexBasis:280},fieldWide:{flexGrow:1,flexBasis:'100%'},label:{fontSize:13,fontWeight:'800',color:theme.colors.text,marginBottom:6},input:{height:48,borderWidth:1,borderColor:theme.colors.border,borderRadius:theme.radius.sm,paddingHorizontal:13,backgroundColor:'#FFF',fontSize:15,color:theme.colors.text},notes:{height:82,paddingTop:12,textAlignVertical:'top'},formActions:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:12},activeChoice:{flexDirection:'row',gap:6},choice:{borderWidth:1,borderColor:theme.colors.border,borderRadius:9,paddingHorizontal:16,paddingVertical:10},choiceActive:{backgroundColor:theme.colors.success,borderColor:theme.colors.success},choiceInactive:{backgroundColor:theme.colors.danger,borderColor:theme.colors.danger},choiceText:{fontSize:13,fontWeight:'800',color:theme.colors.text},choiceTextActive:{color:'#FFF'},actionButtons:{flexDirection:'row',gap:8},
  primary:{backgroundColor:theme.colors.black,borderRadius:theme.radius.sm,paddingHorizontal:17,paddingVertical:13},primaryText:{color:'#FFF',fontSize:14,fontWeight:'900'},secondary:{backgroundColor:'#FFF',borderWidth:1,borderColor:theme.colors.border,borderRadius:theme.radius.sm,paddingHorizontal:17,paddingVertical:12},secondaryText:{color:theme.colors.text,fontSize:14,fontWeight:'800'},disabled:{opacity:.55},
  card:{backgroundColor:'#FFF',borderWidth:1,borderColor:theme.colors.border,borderRadius:theme.radius.md,overflow:'hidden'},title:{fontSize:18,fontWeight:'900',padding:16,color:theme.colors.text},customerBlock:{borderTopWidth:1,borderTopColor:theme.colors.border},row:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:12,padding:15},main:{flexGrow:1,flexBasis:360},right:{alignItems:'flex-end',justifyContent:'center',flexGrow:1,flexBasis:230},desc:{fontSize:15,fontWeight:'900',color:theme.colors.text},meta:{fontSize:13,color:theme.colors.muted,marginTop:4},amount:{fontSize:16,fontWeight:'900',color:theme.colors.text},status:{fontSize:12,fontWeight:'800',marginTop:4},ok:{color:theme.colors.success},bad:{color:theme.colors.danger},rowActions:{flexDirection:'row',gap:8,paddingHorizontal:15,paddingBottom:14},smallButton:{borderWidth:1,borderColor:theme.colors.border,borderRadius:8,paddingHorizontal:12,paddingVertical:8},smallButtonText:{fontSize:12,fontWeight:'800',color:theme.colors.text},
  history:{backgroundColor:'#F8F7F3',borderTopWidth:1,borderTopColor:theme.colors.border,padding:15},historyTitle:{fontSize:14,fontWeight:'900',color:theme.colors.text,marginBottom:8},historyRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,paddingVertical:10,borderTopWidth:1,borderTopColor:theme.colors.border},historyName:{fontSize:13,fontWeight:'800',color:theme.colors.text},historyValue:{fontSize:14,fontWeight:'900',color:theme.colors.text},empty:{padding:18,color:theme.colors.muted,fontSize:14}
});
