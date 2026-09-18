import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AccountPicker } from '@/components/AccountPicker';
import { ActionButton, Choice, DateField, Field, FormModal, Notice, formStyles as s } from '@/components/FormKit';
import {
  adjustAccountBalance,
  createAccount,
  createTransfer,
  deleteAccount,
  getAccounts,
  getPaymentMapping,
  getTransfers,
  setPaymentMapping,
  updateAccount,
} from '@/services/fullApi';
import { theme } from '@/constants/theme';

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const isoToday = () => new Date().toISOString().slice(0, 10);

const isoToBR = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const toNumber = (value: string) => {
  const raw = String(value || '').trim().replace(/[^\d,.-]/g, '');
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if ((raw.match(/\./g) || []).length > 1) {
    normalized = raw.replace(/\./g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const PAYMENT_METHODS = [
  'Dinheiro',
  'Pix',
  'Débito',
  'Crédito',
  'Boleto',
  'Cheque',
  'Transferência',
  'Débito automático',
  'Cartão de débito',
  'Cartão de crédito',
  'Depósito',
  'Outros',
];

const ACCOUNT_TYPES = [
  { label: 'Caixa', value: 'caixa' },
  { label: 'Conta corrente', value: 'conta_corrente' },
  { label: 'Poupança', value: 'poupanca' },
];

function accountName(accounts: any[], id: number) {
  return accounts.find((a) => a.id === id)?.name || `#${id}`;
}

const emptyAccountForm = {
  name: '',
  account_type: 'caixa',
  initial_balance: '',
  opening_date: isoToday(),
  is_default: false,
};

const emptyTransferForm = {
  from_account_id: '',
  to_account_id: '',
  amount: '',
  transfer_date: isoToday(),
  description: '',
};

export function AccountsModal({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeSection, setActiveSection] = useState<'accounts' | 'mapping' | 'transfers'>('accounts');
  const [accountMenuId, setAccountMenuId] = useState<number | null>(null);

  function showError(message: string) {
    setSuccess('');
    setError(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function showToast(message: string) {
    setError('');
    setSuccess(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(''), 4000);
  }

  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyAccountForm);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>(emptyAccountForm);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [adjustBalance, setAdjustBalance] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [transferForm, setTransferForm] = useState<any>(emptyTransferForm);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [accRes, mapRes, trRes] = await Promise.all([
        getAccounts(),
        getPaymentMapping(),
        getTransfers(),
      ]);
      setAccounts(accRes.accounts || []);
      setMapping(mapRes.mapping || {});
      setTransfers(trRes.transfers || []);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível carregar as contas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) {
      setActiveSection('accounts');
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function saveAccount() {
    if (!form.name.trim()) {
      showError('Informe o nome da conta.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await createAccount({
        name: form.name.trim(),
        account_type: form.account_type,
        initial_balance: toNumber(form.initial_balance),
        opening_date: form.opening_date,
        is_default: form.is_default,
      });
      setForm(emptyAccountForm);
      setNewAccountOpen(false);
      showToast('Conta criada.');
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível criar a conta.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleDefault(id: number) {
    try {
      await updateAccount(id, { is_default: true });
      showToast('Conta padrão atualizada.');
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Falha ao definir conta padrão.');
    }
  }

  async function toggleActive(account: any) {
    try {
      await updateAccount(account.id, { active: !account.active });
      showToast(account.active ? 'Conta desativada.' : 'Conta ativada.');
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Falha ao atualizar conta.');
    }
  }

  function askRemoveAccount(account: any) {
    setDeleteError('');
    setDeleteTarget(account);
  }

  async function removeAccount() {
    if (!deleteTarget) return;
    try {
      setDeleteBusy(true);
      setDeleteError('');
      await deleteAccount(deleteTarget.id);
      setDeleteTarget(null);
      showToast('Conta excluída.');
      await load();
      onChanged?.();
    } catch (e: any) {
      setDeleteError(e?.message || 'Não foi possível excluir a conta.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function deactivateBlockedAccount() {
    if (!deleteTarget) return;
    try {
      setDeleteBusy(true);
      setDeleteError('');
      await updateAccount(deleteTarget.id, { active: false });
      setDeleteTarget(null);
      showToast('A conta foi desativada e o histórico financeiro foi preservado.');
      await load();
      onChanged?.();
    } catch (e: any) {
      setDeleteError(e?.message || 'Não foi possível desativar a conta.');
    } finally {
      setDeleteBusy(false);
    }
  }

  function startEdit(acc: any) {
    setNewAccountOpen(false);
    setEditingId(acc.id);
    setEditForm({
      name: acc.name,
      account_type: acc.account_type,
      initial_balance: String(acc.initial_balance),
      opening_date: acc.opening_date,
      is_default: acc.is_default,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyAccountForm);
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editForm.name.trim()) {
      showError('Informe o nome da conta.');
      return;
    }
    try {
      setEditBusy(true);
      setError('');
      await updateAccount(editingId, {
        name: editForm.name.trim(),
        account_type: editForm.account_type,
      });
      cancelEdit();
      showToast('Conta atualizada.');
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setEditBusy(false);
    }
  }

  function startAdjustment(account: any) {
    setAdjustTarget(account);
    setAdjustBalance(String(Number(account.current_balance || 0).toFixed(2)).replace('.', ','));
    setAdjustReason('');
    setAdjustError('');
  }

  async function saveAdjustment() {
    if (!adjustTarget) return;
    if (adjustReason.trim().length < 5) {
      setAdjustError('Explique o motivo do ajuste com pelo menos cinco caracteres.');
      return;
    }
    try {
      setAdjustBusy(true);
      setAdjustError('');
      await adjustAccountBalance(adjustTarget.id, {
        new_balance: toNumber(adjustBalance),
        reason: adjustReason.trim(),
      });
      setAdjustTarget(null);
      showToast('Saldo ajustado e registrado no histórico de auditoria.');
      await load();
      onChanged?.();
    } catch (e: any) {
      setAdjustError(e?.message || 'Não foi possível ajustar o saldo.');
    } finally {
      setAdjustBusy(false);
    }
  }

  async function changeMapping(method: string, value: string) {
    const accountId = value ? Number(value) : null;
    const previous = mapping[method] ?? null;
    setMapping((prev) => ({ ...prev, [method]: accountId }));
    try {
      await setPaymentMapping({ [method]: accountId });
      const target = accountId === null ? '(sem conta)' : accountName(accounts, accountId);
      showToast(`"${method}" agora vai para ${target}.`);
      onChanged?.();
    } catch (e: any) {
      setMapping((prev) => ({ ...prev, [method]: previous }));
      showError(e?.message || 'Falha ao salvar mapeamento.');
    }
  }

  async function saveTransfer() {
    const amount = toNumber(transferForm.amount);
    if (!transferForm.from_account_id || !transferForm.to_account_id) {
      setTransferError('Escolha as duas contas.');
      return;
    }
    if (transferForm.from_account_id === transferForm.to_account_id) {
      setTransferError('As contas precisam ser diferentes.');
      return;
    }
    if (amount <= 0) {
      setTransferError('Informe um valor maior que zero.');
      return;
    }
    try {
      setTransferBusy(true);
      setTransferError('');
      await createTransfer({
        from_account_id: Number(transferForm.from_account_id),
        to_account_id: Number(transferForm.to_account_id),
        amount,
        transfer_date: transferForm.transfer_date,
        description: transferForm.description,
      });
      setTransferForm(emptyTransferForm);
      await load();
      onChanged?.();
    } catch (e: any) {
      setTransferError(e?.message || 'Não foi possível registrar a transferência.');
    } finally {
      setTransferBusy(false);
    }
  }

  const accountOptions = accounts
    .filter((a) => a.active)
    .map((a) => ({ label: a.name, value: String(a.id) }));

  const activeAccounts = accounts.filter((account) => account.active);
  const totalBalance = activeAccounts.reduce(
    (total, account) => total + Number(account.current_balance || 0),
    0
  );
  const defaultAccount = accounts.find((account) => account.is_default);

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Contas e bancos</Text>
              <Text style={styles.subtitle}>Saldos, destinos de recebimento e transferências</Text>
            </View>

            <Pressable onPress={onClose}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {!!error && <Notice text={error} tone="error" />}
            {!!success && <Notice text={success} tone="ok" />}

            <View style={styles.accountOverview}>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>SALDO TOTAL</Text>
                <Text style={[styles.overviewValue, totalBalance < 0 && styles.negativeValue]}>
                  {money(totalBalance)}
                </Text>
              </View>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>CONTAS ATIVAS</Text>
                <Text style={styles.overviewValue}>{activeAccounts.length}</Text>
              </View>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewLabel}>CONTA PADRÃO</Text>
                <Text style={styles.overviewAccount} numberOfLines={1}>
                  {defaultAccount?.name || 'Não definida'}
                </Text>
              </View>
            </View>

            <View style={styles.tabs}>
              {[
                { key: 'accounts', label: 'Contas', icon: 'credit-card' },
                { key: 'mapping', label: 'Destinos de recebimento', icon: 'corner-down-right' },
                { key: 'transfers', label: 'Transferências', icon: 'repeat' },
              ].map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[styles.tab, activeSection === tab.key && styles.tabActive]}
                  onPress={() => setActiveSection(tab.key as typeof activeSection)}
                >
                  <Feather
                    name={tab.icon as any}
                    size={14}
                    color={activeSection === tab.key ? '#285DA9' : theme.colors.muted}
                  />
                  <Text style={[styles.tabText, activeSection === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {activeSection === 'accounts' && <View style={styles.sectionCard}>
              <View style={styles.cardHeadRow}>
                <View>
                  <Text style={styles.sectionTitle}>Suas contas</Text>
                  <Text style={styles.sectionDescription}>Caixas, bancos e contas de recebimento</Text>
                </View>

                <View style={styles.headBtn}>
                  <ActionButton
                    label={newAccountOpen ? 'Cancelar' : '+ Nova conta'}
                    tone="plain"
                    onPress={() => setNewAccountOpen((v) => !v)}
                  />
                </View>
              </View>

              {newAccountOpen && (
                <View style={styles.formArea}>
                  <Field
                    label="Nome"
                    value={form.name}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                    placeholder="Ex.: Caixa Loja, Banco do Brasil"
                  />

                  <Choice
                    label="Tipo"
                    options={ACCOUNT_TYPES}
                    value={form.account_type}
                    onChange={(v) => setForm({ ...form, account_type: v })}
                  />

                  <Field
                    label="Saldo inicial"
                    value={String(form.initial_balance)}
                    onChangeText={(v) => setForm({ ...form, initial_balance: v })}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                  />

                  <DateField
                    label="Data do saldo inicial"
                    value={form.opening_date}
                    onChangeText={(v) => setForm({ ...form, opening_date: v })}
                  />

                  <Choice
                    label="Conta padrão (usada quando a forma de pagamento não tiver conta definida)"
                    options={[
                      { label: 'Não', value: '0' },
                      { label: 'Sim', value: '1' },
                    ]}
                    value={form.is_default ? '1' : '0'}
                    onChange={(v) => setForm({ ...form, is_default: v === '1' })}
                  />

                  <ActionButton label="Salvar conta" onPress={saveAccount} disabled={busy} />
                </View>
              )}

              {loading && accounts.length === 0 ? (
                <Text style={s.empty}>Carregando...</Text>
              ) : accounts.length === 0 ? (
                <Text style={s.empty}>Nenhuma conta cadastrada ainda.</Text>
              ) : (
                accounts.map((acc) => (
                  <View key={acc.id} style={[styles.accountRow, accountMenuId === acc.id && styles.accountRowMenuOpen]}>
                    <View style={styles.accountMain}>
                      <View style={styles.accountNameLine}>
                        <Text style={styles.accountName}>{acc.name}</Text>
                        {acc.is_default && <Text style={styles.defaultBadge}>PADRÃO</Text>}
                        {!acc.active && <Text style={styles.inactiveBadge}>INATIVA</Text>}
                      </View>

                      <Text style={styles.accountMeta}>
                        {ACCOUNT_TYPES.find((type) => type.value === acc.account_type)?.label || 'Conta'} • saldo inicial em {isoToBR(acc.opening_date)}: {money(acc.initial_balance)}
                      </Text>

                      <View style={styles.actionsWrap}>
                        <Pressable
                          onPress={() => setAccountMenuId((current) => current === acc.id ? null : acc.id)}
                          style={[styles.actionsTrigger, accountMenuId === acc.id && styles.actionsTriggerActive]}
                        >
                          <Feather name="more-horizontal" size={16} color={theme.colors.text} />
                          <Text style={styles.actionsTriggerText}>Ações</Text>
                        </Pressable>

                        {accountMenuId === acc.id && (
                          <View style={styles.actionsMenu}>
                            {!acc.is_default && (
                              <Pressable style={styles.menuAction} onPress={() => { setAccountMenuId(null); toggleDefault(acc.id); }}>
                                <Feather name="check-circle" size={14} color={theme.colors.text} />
                                <Text style={styles.menuActionText}>Definir como padrão</Text>
                              </Pressable>
                            )}
                            <Pressable style={styles.menuAction} onPress={() => { setAccountMenuId(null); editingId === acc.id ? cancelEdit() : startEdit(acc); }}>
                              <Feather name="edit-2" size={14} color={theme.colors.text} />
                              <Text style={styles.menuActionText}>{editingId === acc.id ? 'Cancelar edição' : 'Editar dados'}</Text>
                            </Pressable>
                            <Pressable style={styles.menuAction} onPress={() => { setAccountMenuId(null); startAdjustment(acc); }}>
                              <Feather name="sliders" size={14} color={theme.colors.text} />
                              <Text style={styles.menuActionText}>Ajustar saldo</Text>
                            </Pressable>
                            <Pressable style={styles.menuAction} onPress={() => { setAccountMenuId(null); toggleActive(acc); }}>
                              <Feather name={acc.active ? 'pause-circle' : 'play-circle'} size={14} color={theme.colors.text} />
                              <Text style={styles.menuActionText}>{acc.active ? 'Desativar conta' : 'Ativar conta'}</Text>
                            </Pressable>
                            <Pressable style={styles.menuAction} onPress={() => { setAccountMenuId(null); askRemoveAccount(acc); }}>
                              <Feather name="trash-2" size={14} color={theme.colors.danger} />
                              <Text style={styles.menuActionDanger}>Excluir conta</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>

                      {editingId === acc.id && (
                        <View style={styles.formArea}>
                          <Field
                            label="Nome"
                            value={editForm.name}
                            onChangeText={(v) => setEditForm({ ...editForm, name: v })}
                          />

                          <Choice
                            label="Tipo"
                            options={ACCOUNT_TYPES}
                            value={editForm.account_type}
                            onChange={(v) => setEditForm({ ...editForm, account_type: v })}
                          />

                          <Notice text="Para corrigir o saldo, use Ajustar saldo. O sistema exigirá justificativa e preservará o histórico." />

                          <ActionButton label="Salvar alterações" onPress={saveEdit} disabled={editBusy} />
                        </View>
                      )}
                    </View>

                    <View style={styles.balanceArea}>
                      <Text style={styles.balanceLabel}>SALDO ATUAL</Text>
                      <Text style={[styles.balanceValue, acc.current_balance < 0 && styles.negativeValue]}>
                        {money(acc.current_balance)}
                      </Text>
                      {!!acc.last_adjustment && (
                        <Text style={styles.adjustmentMeta}>
                          Último ajuste: {money(acc.last_adjustment.difference)} • {acc.last_adjustment.reason}
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>}

            {activeSection === 'mapping' && <View style={styles.sectionCard}>
              <Text style={styles.sectionTitlePadded}>Destino das formas de pagamento</Text>

              <Text style={styles.cardNote}>
                Defina em qual conta cada recebimento do PDV será registrado automaticamente.
              </Text>

              <View style={styles.mappingList}>
                {PAYMENT_METHODS.map((method) => (
                  <AccountPicker
                    key={method}
                    label={method}
                    options={accountOptions}
                    value={mapping[method] != null ? String(mapping[method]) : ''}
                    onChange={(v) => changeMapping(method, v)}
                  />
                ))}
              </View>
            </View>}

            {activeSection === 'transfers' && <View style={styles.sectionCard}>
              <Text style={styles.sectionTitlePadded}>Nova transferência</Text>
              <Text style={styles.cardNote}>Movimente valores entre contas sem alterar receitas ou despesas.</Text>

              {!!transferError && <Notice text={transferError} tone="error" />}

              <AccountPicker
                label="De"
                options={accountOptions}
                value={transferForm.from_account_id}
                onChange={(v) => setTransferForm({ ...transferForm, from_account_id: v })}
                allowEmpty={false}
              />

              <AccountPicker
                label="Para"
                options={accountOptions}
                value={transferForm.to_account_id}
                onChange={(v) => setTransferForm({ ...transferForm, to_account_id: v })}
                allowEmpty={false}
              />

              <Field
                label="Valor"
                value={String(transferForm.amount)}
                onChangeText={(v) => setTransferForm({ ...transferForm, amount: v })}
                placeholder="0,00"
                keyboardType="decimal-pad"
              />

              <DateField
                label="Data"
                value={transferForm.transfer_date}
                onChangeText={(v) => setTransferForm({ ...transferForm, transfer_date: v })}
              />

              <Field
                label="Descrição (opcional)"
                value={transferForm.description}
                onChangeText={(v) => setTransferForm({ ...transferForm, description: v })}
              />

              <ActionButton
                label="Registrar transferência"
                onPress={saveTransfer}
                disabled={transferBusy}
              />

              {transfers.length > 0 && (
                <View style={styles.transferList}>
                  <Text style={styles.cardNote}>Últimas transferências</Text>

                  {transfers.slice(0, 10).map((t) => (
                    <View key={t.id} style={styles.transferRow}>
                      <View style={styles.accountMain}>
                        <Text style={styles.accountName}>
                          {accountName(accounts, t.from_account_id)} → {accountName(accounts, t.to_account_id)}
                        </Text>

                        <Text style={styles.accountMeta}>
                          {isoToBR(t.transfer_date)}
                          {t.description ? ` • ${t.description}` : ''}
                        </Text>
                      </View>

                      <Text style={styles.transferAmount}>{money(t.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>}
          </ScrollView>
        </View>
      </View>
    </Modal>

    <FormModal
      visible={!!adjustTarget}
      title="Ajustar saldo da conta"
      onCancel={() => setAdjustTarget(null)}
      onSave={saveAdjustment}
      saveLabel="Confirmar ajuste"
      busy={adjustBusy}
      errorText={adjustError}
    >
      <Notice text={`Saldo calculado atual de ${adjustTarget?.name || 'conta'}: ${money(Number(adjustTarget?.current_balance || 0))}. A diferença será registrada como ajuste auditável.`} />
      <Field label="Novo saldo correto *" value={adjustBalance} onChangeText={setAdjustBalance} keyboardType="decimal-pad" placeholder="0,00" />
      <Field label="Justificativa obrigatória *" value={adjustReason} onChangeText={setAdjustReason} multiline placeholder="Ex.: conciliação com extrato bancário de 17/09/2026" />
    </FormModal>

    <Modal
      visible={!!deleteTarget}
      transparent
      animationType="fade"
      onRequestClose={() => !deleteBusy && setDeleteTarget(null)}
    >
      <View style={styles.deleteBackdrop}>
        <View style={styles.deleteModal}>
          <View style={styles.deleteIcon}>
            <Text style={styles.deleteIconText}>!</Text>
          </View>

          <Text style={styles.deleteTitle}>Excluir conta financeira?</Text>
          <Text style={styles.deleteText}>
            Você está prestes a excluir permanentemente a conta{' '}
            <Text style={styles.deleteAccountName}>{deleteTarget?.name || ''}</Text>.
          </Text>

          <View style={styles.deleteSummary}>
            <Text style={styles.deleteSummaryLabel}>Saldo atual calculado</Text>
            <Text style={[
              styles.deleteSummaryValue,
              Number(deleteTarget?.current_balance || 0) < 0 && { color: theme.colors.danger },
            ]}>
              {money(Number(deleteTarget?.current_balance || 0))}
            </Text>
          </View>

          <Text style={styles.deleteWarning}>
            Essa ação não pode ser desfeita. Se houver transferências vinculadas, a exclusão será bloqueada para preservar o histórico financeiro.
          </Text>

          {!!deleteError && (
            <View style={styles.deleteErrorArea}>
              <Notice text={deleteError} tone="error" />
              {!deleteTarget?.active ? (
                <Text style={styles.deleteHelp}>Esta conta já está desativada. Você pode mantê-la assim sem afetar os relatórios anteriores.</Text>
              ) : (
                <Text style={styles.deleteHelp}>Você pode desativar a conta: ela deixa de ser usada em novos movimentos, mas o histórico permanece correto.</Text>
              )}
            </View>
          )}

          <View style={styles.deleteActions}>
            <ActionButton
              label="Cancelar"
              tone="plain"
              disabled={deleteBusy}
              onPress={() => {
                setDeleteError('');
                setDeleteTarget(null);
              }}
            />
            {!!deleteError && deleteTarget?.active && (
              <ActionButton
                label="Desativar conta"
                tone="plain"
                disabled={deleteBusy}
                onPress={deactivateBlockedAccount}
              />
            )}
            {!deleteError && (
              <ActionButton
                label={deleteBusy ? 'Excluindo...' : 'Excluir definitivamente'}
                tone="danger"
                disabled={deleteBusy}
                onPress={removeAccount}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  deleteBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(13,17,23,0.68)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  deleteModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    maxWidth: 500,
    padding: 22,
    width: '100%',
  },
  deleteIcon: {
    alignItems: 'center',
    backgroundColor: '#FDECEC',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  deleteIconText: {
    color: theme.colors.danger,
    fontFamily: 'Sora_800ExtraBold',
    fontSize: 22,
  },
  deleteTitle: {
    color: theme.colors.text,
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
    marginTop: 14,
  },
  deleteText: {
    color: theme.colors.muted,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
  },
  deleteAccountName: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  deleteSummary: {
    alignItems: 'center',
    backgroundColor: '#F7F6F3',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    padding: 13,
  },
  deleteSummaryLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteSummaryValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  deleteWarning: {
    color: '#784749',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 14,
  },
  deleteErrorArea: {
    gap: 8,
    marginTop: 14,
  },
  deleteHelp: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  deleteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 860,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
    color: theme.colors.text,
    flex: 1,
  },
  subtitle: { color: theme.colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  close: {
    fontSize: 28,
    lineHeight: 28,
    color: theme.colors.muted,
  },
  scroll: {
    marginTop: 14,
  },
  scrollContent: {
    gap: 11,
    paddingBottom: 10,
  },
  accountOverview: {
    backgroundColor: '#F7F9FC',
    borderColor: '#DDE5EF',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 9,
  },
  overviewItem: { flex: 1, minWidth: 150, paddingHorizontal: 5, paddingVertical: 2 },
  overviewLabel: { color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: 0.25 },
  overviewValue: { color: theme.colors.text, fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 2 },
  overviewAccount: { color: theme.colors.text, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 3 },
  negativeValue: { color: theme.colors.danger },
  tabs: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    borderRadius: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 2,
  },
  tab: {
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabActive: { borderBottomColor: '#3568B8' },
  tabText: { color: theme.colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  tabTextActive: { color: '#285DA9' },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: theme.colors.border,
    borderRadius: 13,
    borderWidth: 1,
    overflow: 'visible',
  },
  sectionTitle: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 15 },
  sectionTitlePadded: { color: theme.colors.text, fontFamily: 'Sora_700Bold', fontSize: 15, paddingHorizontal: 16, paddingTop: 15 },
  sectionDescription: { color: theme.colors.muted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
  },
  headBtn: {
    flexDirection: 'row',
  },
  formArea: {
    padding: 16,
    paddingTop: 12,
    gap: 12,
  },
  actionsWrap: { alignSelf: 'flex-start', marginTop: 7, position: 'relative', zIndex: 10 },
  actionsTrigger: { alignItems: 'center', borderColor: theme.colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 32, paddingHorizontal: 9 },
  actionsTriggerActive: { backgroundColor: '#EEF4FC', borderColor: '#9BB7DE' },
  actionsTriggerText: { color: theme.colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 11.5 },
  actionsMenu: { backgroundColor: '#FFFFFF', borderColor: theme.colors.border, borderRadius: 10, borderWidth: 1, elevation: 10, left: 0, minWidth: 205, paddingVertical: 5, position: 'absolute', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, top: 36, zIndex: 30 },
  menuAction: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 38, paddingHorizontal: 11 },
  menuActionText: { color: theme.colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  menuActionDanger: { color: theme.colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  cardNote: {
    fontSize: 12,
    color: theme.colors.muted,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  mappingList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
  },
  transferList: {
    marginTop: 6,
  },
  accountRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  accountRowMenuOpen: { zIndex: 20 },
  accountMain: { flex: 1, minWidth: 260 },
  accountNameLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  accountName: { color: theme.colors.text, fontFamily: 'Inter_700Bold', fontSize: 14 },
  accountMeta: { color: theme.colors.muted, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  defaultBadge: { backgroundColor: '#EAF7EF', borderRadius: 7, color: theme.colors.success, fontFamily: 'Inter_700Bold', fontSize: 10.5, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  inactiveBadge: { backgroundColor: '#EEEFF1', borderRadius: 7, color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 10.5, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  balanceArea: { alignItems: 'flex-end', minWidth: 135 },
  balanceLabel: { color: theme.colors.muted, fontFamily: 'Inter_700Bold', fontSize: 11.5, letterSpacing: 0.25 },
  balanceValue: { color: theme.colors.text, fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 3 },
  adjustmentMeta: { color: theme.colors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 5, maxWidth: 240, textAlign: 'right' },
  transferRow: { alignItems: 'center', borderTopColor: theme.colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  transferAmount: { color: theme.colors.text, fontSize: 12.5, fontWeight: '900' },
});
