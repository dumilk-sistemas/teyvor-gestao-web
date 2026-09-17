import { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { AdminShell } from '@/components/AdminShell';
import { MetricCard } from '@/components/MetricCard';
import { SearchBar } from '@/components/SearchBar';
import {
  ActionButton,
  Choice,
  DateField,
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

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const today = () =>
  new Date().toISOString().slice(0, 10);

type XmlPurchaseItem = {
  key: string;
  supplierCode: string;
  barcode: string;
  name: string;
  unit: string;
  qty: number;
  cost: number;
};

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizedCode = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');

function xmlElements(node: any, localName: string) {
  return Array.from(node?.getElementsByTagName?.('*') || []).filter(
    (element: any) => element.localName === localName || element.nodeName === localName
  ) as any[];
}

function xmlText(node: any, localName: string) {
  return String(xmlElements(node, localName)[0]?.textContent || '').trim();
}

function parseNfeXml(xml: string) {
  const documentNode = new DOMParser().parseFromString(xml, 'application/xml');
  if (xmlElements(documentNode, 'parsererror').length > 0) {
    throw new Error('O arquivo XML está inválido ou corrompido.');
  }

  const info = xmlElements(documentNode, 'infNFe')[0];
  const issuer = xmlElements(documentNode, 'emit')[0];
  const ide = xmlElements(documentNode, 'ide')[0];
  const invoiceTotal = xmlElements(documentNode, 'ICMSTot')[0];
  if (!info || !issuer || !ide) {
    throw new Error('O arquivo não contém uma NF-e de produto reconhecida.');
  }

  const paymentCode = xmlText(xmlElements(documentNode, 'detPag')[0], 'tPag');
  const paymentMap: Record<string, string> = {
    '01': 'Dinheiro',
    '03': 'Crédito',
    '04': 'Débito',
    '15': 'Boleto',
    '16': 'Depósito',
    '17': 'Pix',
    '18': 'Transferência',
    '90': 'Outros',
  };
  const installments = xmlElements(documentNode, 'dup');
  const firstInstallment = installments[0];

  const items = xmlElements(documentNode, 'det').map((detail: any, index) => {
    const product = xmlElements(detail, 'prod')[0];
    return {
      key: String(detail.getAttribute?.('nItem') || index + 1),
      supplierCode: xmlText(product, 'cProd'),
      barcode: xmlText(product, 'cEAN'),
      name: xmlText(product, 'xProd') || `Item ${index + 1}`,
      unit: xmlText(product, 'uCom'),
      qty: Number(xmlText(product, 'qCom') || 0),
      cost: Number(xmlText(product, 'vUnCom') || 0),
    } as XmlPurchaseItem;
  });

  const issuedAt = xmlText(ide, 'dhEmi') || xmlText(ide, 'dEmi');
  const accessKey = String(info.getAttribute?.('Id') || '').replace(/^NFe/i, '');
  return {
    supplierDocument: xmlText(issuer, 'CNPJ') || xmlText(issuer, 'CPF'),
    supplierName: xmlText(issuer, 'xNome'),
    number: xmlText(ide, 'nNF'),
    date: issuedAt.slice(0, 10) || today(),
    dueDate: xmlText(firstInstallment, 'dVenc') || issuedAt.slice(0, 10) || today(),
    accessKey,
    paymentMethod: paymentMap[paymentCode] || 'Outros',
    paymentTerms: installments.length > 1 ? `${installments.length} parcelas` : 'À vista',
    total: Number(xmlText(invoiceTotal, 'vNF') || 0),
    items,
  };
}

export default function FullPurchases() {
  const [data, setData] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [xmlPending, setXmlPending] = useState<XmlPurchaseItem[]>([]);
  const [xmlNotice, setXmlNotice] = useState('');
  const [xmlDocumentTotal, setXmlDocumentTotal] = useState<number | null>(null);

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const term = search.trim().toLocaleLowerCase('pt-BR');

    if (!term) {
      return rows;
    }

    return rows.filter((row: any) =>
      [row.supplier, row.document]
        .filter(Boolean)
        .some((field) =>
          String(field).toLocaleLowerCase('pt-BR').includes(term)
        )
    );
  }, [data, search]);

  const [form, setForm] = useState({
    supplierId: '',
    document: '',
    date: today(),
    dueDate: today(),
    notes: '',
    generatePayable: 'true',
    source: 'manual',
    documentType: 'Sem nota',
    accessKey: '',
    paymentMethod: 'Boleto',
    paymentTerms: 'À vista',
  });

  const [line, setLine] = useState({
    productId: '',
    qty: '1',
    cost: '0,00',
  });

  const [lines, setLines] = useState<any[]>([]);

  async function load() {
    try {
      setLoading(true);
      setError('');

      const purchaseData = await getFull('purchases');

      // Fornecedores e produtos só são usados para montar um novo
      // recebimento. Perfis sem acesso a esses módulos ainda
      // conseguem consultar as compras normalmente.
      const [supplierData, productData] = await Promise.all([
        getFull('suppliers').catch(() => null),
        getFull('products').catch(() => null),
      ]);

      setData(purchaseData);
      setSuppliers(supplierData?.rows || []);
      setProducts(productData?.rows || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Falha ao carregar compras.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const start = (source = 'manual') => {
    const activeSupplier = suppliers.find(
      (supplier) => supplier.active
    );

    const firstProduct = products[0];

    setForm({
      supplierId: String(activeSupplier?.id || ''),
      document: '',
      date: today(),
      dueDate: today(),
      notes: '',
      generatePayable: 'true',
      source,
      documentType: source === 'xml' ? 'NF-e' : 'Sem nota',
      accessKey: '',
      paymentMethod: 'Boleto',
      paymentTerms: 'À vista',
    });

    setLine({
      productId: String(firstProduct?.id || ''),
      qty: '1',
      cost: String(
        firstProduct?.cost || 0
      ).replace('.', ','),
    });

    setLines([]);
    setXmlPending([]);
    setXmlNotice('');
    setXmlDocumentTotal(null);
    setModalError('');
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

  const changeProduct = (
    id: string
  ) => {
    const product = products.find(
      (item) => String(item.id) === id
    );

    setLine((current) => ({
      ...current,
      productId: id,
      cost: String(
        product?.cost || 0
      ).replace('.', ','),
    }));
  };

  const addLine = () => {
    const qty = Number(
      String(line.qty || '0').replace(',', '.')
    );

    const cost = Number(
      String(line.cost || '0').replace(',', '.')
    );

    if (
      !line.productId ||
      qty <= 0 ||
      cost < 0
    ) {
      setModalError(
        'Confira produto, quantidade e custo.'
      );
      return;
    }

    setModalError('');

    setLines((current) => {
      const existing = current.find(
        (item) =>
          String(item.productId) ===
          String(line.productId)
      );

      if (existing) {
        return current.map((item) =>
          item === existing
            ? {
                ...item,
                qty: item.qty + qty,
                cost,
              }
            : item
        );
      }

      return [
        ...current,
        {
          productId: line.productId,
          qty,
          cost,
        },
      ];
    });
  };

  const mergeLines = (incoming: Array<{ productId: string; qty: number; cost: number }>) => {
    setLines((current) => {
      const merged = [...current];
      incoming.forEach((next) => {
        const index = merged.findIndex(
          (item) => String(item.productId) === String(next.productId)
        );
        if (index >= 0) {
          merged[index] = {
            ...merged[index],
            qty: Number(merged[index].qty || 0) + next.qty,
            cost: next.cost,
          };
        } else {
          merged.push(next);
        }
      });
      return merged;
    });
  };

  const mapXmlItem = (item: XmlPurchaseItem, productId: string) => {
    if (!productId) return;
    mergeLines([{ productId, qty: item.qty, cost: item.cost }]);
    setXmlPending((current) => current.filter((candidate) => candidate.key !== item.key));
  };

  const pickXml = () => {
    if (Platform.OS !== 'web') {
      setModalError('A importação de XML está disponível no painel web.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml,text/xml,application/xml';
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        setModalError('');
        const parsed = parseNfeXml(await file.text());
        const supplier = suppliers.find(
          (candidate) =>
            onlyDigits(candidate.document) === onlyDigits(parsed.supplierDocument)
        );
        const matched: Array<{ productId: string; qty: number; cost: number }> = [];
        const pending: XmlPurchaseItem[] = [];

        parsed.items.forEach((item) => {
          const product = products.find((candidate) => {
            const code = normalizedCode(candidate.code);
            return (
              (!!code && code === normalizedCode(item.supplierCode)) ||
              (!!code && code === normalizedCode(item.barcode))
            );
          });
          if (product) {
            matched.push({ productId: String(product.id), qty: item.qty, cost: item.cost });
          } else {
            pending.push(item);
          }
        });

        setForm((current) => ({
          ...current,
          source: 'xml',
          supplierId: String(supplier?.id || ''),
          document: parsed.number,
          documentType: 'NF-e',
          accessKey: parsed.accessKey,
          date: parsed.date,
          dueDate: parsed.dueDate,
          paymentMethod: parsed.paymentMethod,
          paymentTerms: parsed.paymentTerms,
          notes: `Importado do XML ${file.name}`,
        }));
        setLines([]);
        setXmlPending(pending);
        setXmlDocumentTotal(parsed.total > 0 ? parsed.total : null);
        mergeLines(matched);
        setXmlNotice(
          `${file.name}: ${matched.length} item(ns) reconhecido(s), ${pending.length} aguardando vínculo. Total da NF-e ${money(parsed.total)}.`
        );
        if (!supplier) {
          setModalError(
            `O fornecedor ${parsed.supplierName || parsed.supplierDocument} não foi localizado. Selecione o cadastro correto antes de confirmar.`
          );
        }
      } catch (cause) {
        setModalError(
          cause instanceof Error ? cause.message : 'Não foi possível ler o XML.'
        );
      }
    };
    input.click();
  };

  async function save() {
    try {
      setBusy(true);
      setModalError('');

      if (!form.supplierId) {
        setModalError('Selecione o fornecedor.');
        return;
      }

      if (xmlPending.length > 0) {
        setModalError('Vincule todos os produtos do XML antes de confirmar.');
        return;
      }

      if (lines.length === 0) {
        setModalError(
          'Adicione pelo menos um produto ao recebimento.'
        );
        return;
      }

      const itemsTotal = lines.reduce(
        (sum, item) => sum + Number(item.qty || 0) * Number(item.cost || 0),
        0
      );

      if (
        form.source === 'xml' &&
        xmlDocumentTotal !== null &&
        Math.abs(itemsTotal - xmlDocumentTotal) > 0.02
      ) {
        setModalError(
          `O total dos itens (${money(itemsTotal)}) difere do total da NF-e (${money(xmlDocumentTotal)}). Revise custos, frete, descontos ou impostos antes de confirmar.`
        );
        return;
      }

      await enqueue(
        'purchases',
        'PURCHASE_CREATE',
        {
          purchase: {
            supplierId: form.supplierId,
            document: form.document,
            date: form.date,
            dueDate: form.dueDate,
            notes: form.notes,
            source: form.source,
            documentType: form.documentType,
            accessKey: form.accessKey,
            paymentMethod: form.paymentMethod,
            paymentTerms: form.paymentTerms,
            documentTotal: xmlDocumentTotal,
            generatePayable:
              form.generatePayable === 'true',
            items: lines,
          },
        }
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
          : 'Falha ao enviar recebimento.'
      );
    } finally {
      setBusy(false);
    }
  }

  const total = lines.reduce(
    (sum, item) =>
      sum + item.qty * item.cost,
    0
  );

  return (
    <AdminShell
      title="Compras / Recebimentos"
      subtitle="Mercadorias, estoque e conta a pagar em uma operação"
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
        <>
          <ActionButton
            label="Importar XML NF-e"
            tone="plain"
            onPress={() => start('xml')}
          />
          <ActionButton
            label="+ Compra manual"
            tone="gold"
            onPress={() => start('manual')}
          />
        </>
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
              label="Recebimentos"
              value={String(
                data.summary?.receipts || 0
              )}
            />

            <MetricCard
              label="Comprado no mês"
              value={money(
                data.summary?.month_total || 0
              )}
            />

            <MetricCard
              label="Total histórico"
              value={money(
                data.summary?.historic_total || 0
              )}
            />

            <MetricCard
              label="Fornecedores ativos"
              value={String(
                data.summary?.active_suppliers || 0
              )}
            />
          </View>

          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por fornecedor ou documento"
          />

          <View style={s.card}>
            <Text style={s.cardTitle}>
              Histórico
            </Text>

            {filteredRows.length > 0 ? (
              filteredRows.map(
                (row: any) => (
                  <View
                    key={String(row.id)}
                    style={s.row}
                  >
                    <View style={s.main}>
                      <Text style={s.name}>
                        {row.supplier}
                      </Text>

                      <Text style={s.meta}>
                        {formatDateBR(row.date)} •{' '}
                        {row.document ||
                          'Sem documento'}{' '}
                        • {row.items}{' '}
                        item(ns) • vence{' '}
                        {formatDateBR(row.due_date)}
                      </Text>
                    </View>

                    <View style={s.right}>
                      <Text style={s.amount}>
                        {money(row.total)}
                      </Text>

                      <Text style={s.badge}>
                        {row.payable_status}
                      </Text>
                    </View>
                  </View>
                )
              )
            ) : (
              <Text style={s.empty}>
                {search
                  ? 'Nenhum recebimento encontrado para essa busca.'
                  : 'Nenhum recebimento registrado.'}
              </Text>
            )}
          </View>
        </>
      )}

      <FormModal
        visible={open}
        title="Novo recebimento"
        onCancel={() => setOpen(false)}
        onSave={save}
        saveLabel="Confirmar recebimento"
        busy={busy}
        wide
        errorText={modalError}
      >
        {form.source === 'xml' && (
          <>
            <Notice text="Selecione um XML de NF-e. Antes de confirmar, revise o fornecedor, os vínculos dos produtos, as quantidades e o financeiro." />
            <ActionButton
              label={xmlNotice ? 'Selecionar outro XML' : 'Selecionar arquivo XML'}
              tone="dark"
              onPress={pickXml}
            />
            {!!xmlNotice && <Notice text={xmlNotice} />}
          </>
        )}

        <SearchablePicker
          label="Fornecedor *"
          value={form.supplierId}
          onChange={(value) =>
            set('supplierId', value)
          }
          options={suppliers
            .filter(
              (supplier) =>
                supplier.active
            )
            .map((supplier) => ({
              label: supplier.name,
              value: String(
                supplier.id
              ),
              description: supplier.document || supplier.phone || 'Fornecedor ativo',
            }))}
          placeholder="Selecione o fornecedor"
          searchPlaceholder="Buscar fornecedor"
        />

        <Field
          label="Número da nota / documento"
          value={form.document}
          onChangeText={(value) =>
            set('document', value)
          }
        />

        <SearchablePicker
          label="Tipo de documento"
          value={form.documentType}
          onChange={(value) => set('documentType', value)}
          options={[
            { label: 'Sem nota / recibo', value: 'Sem nota', description: 'Compra manual ou notinha simples' },
            { label: 'NF-e de produto', value: 'NF-e', description: 'Nota fiscal eletrônica modelo 55' },
            { label: 'Cupom / NFC-e', value: 'NFC-e', description: 'Cupom fiscal eletrônico' },
            { label: 'Outro documento', value: 'Outro', description: 'Boleto, recibo ou referência interna' },
          ]}
        />

        {form.documentType === 'NF-e' && (
          <Field
            label="Chave de acesso da NF-e"
            value={form.accessKey}
            onChangeText={(value) => set('accessKey', onlyDigits(value).slice(0, 44))}
            keyboardType="number-pad"
            placeholder="44 dígitos"
          />
        )}

        <DateField
          label="Data do recebimento *"
          value={form.date}
          onChangeText={(value) =>
            set('date', value)
          }
        />

        <SearchablePicker
          label="Forma prevista de pagamento"
          value={form.paymentMethod}
          onChange={(value) => set('paymentMethod', value)}
          options={['Boleto', 'Pix', 'Dinheiro', 'Crédito', 'Débito', 'Transferência', 'Depósito', 'Outros'].map((value) => ({
            label: value,
            value,
          }))}
        />

        <Field
          label="Condição de pagamento"
          value={form.paymentTerms}
          onChangeText={(value) => set('paymentTerms', value)}
          placeholder="Ex.: À vista, 30 dias, 2 parcelas"
        />

        <DateField
          label="Vencimento"
          value={form.dueDate}
          onChangeText={(value) =>
            set('dueDate', value)
          }
        />

        <Choice
          label="Gerar conta a pagar"
          value={form.generatePayable}
          onChange={(value) =>
            set(
              'generatePayable',
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

        <Text style={s.cardTitle}>
          Adicionar produto
        </Text>

        {xmlPending.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Produtos do XML para vincular</Text>
            {xmlPending.map((item) => (
              <View key={item.key} style={s.row}>
                <View style={s.main}>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={s.meta}>
                    Cód. fornecedor {item.supplierCode || '—'} • {item.qty} {item.unit} • {money(item.cost)}
                  </Text>
                  <SearchablePicker
                    label="Vincular ao produto cadastrado *"
                    value=""
                    onChange={(productId) => mapXmlItem(item, productId)}
                    options={products.map((product) => ({
                      label: product.name,
                      value: String(product.id),
                      description: `${product.code || 'Sem código'} • saldo ${product.stock || 0} ${product.unit || 'un'}`,
                    }))}
                    placeholder="Buscar produto correspondente"
                    searchPlaceholder="Buscar por nome ou código"
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        <SearchablePicker
          label="Produto"
          value={line.productId}
          onChange={changeProduct}
          options={products.map(
            (product) => ({
              label: product.name,
              value: String(product.id),
              description: `${product.code || 'Sem código'} • saldo ${product.stock || 0} ${product.unit || 'un'}`,
            })
          )}
          placeholder="Selecione o produto"
          searchPlaceholder="Buscar por nome ou código"
        />

        <Field
          label="Quantidade"
          value={line.qty}
          onChangeText={(value) =>
            setLine((current) => ({
              ...current,
              qty: value,
            }))
          }
          keyboardType="decimal-pad"
        />

        <Field
          label="Custo unitário"
          value={line.cost}
          onChangeText={(value) =>
            setLine((current) => ({
              ...current,
              cost: value,
            }))
          }
          keyboardType="decimal-pad"
        />

        <ActionButton
          label="Adicionar item"
          tone="dark"
          onPress={addLine}
        />

        {lines.map((item, index) => {
          const product = products.find(
            (candidate) =>
              String(candidate.id) ===
              String(item.productId)
          );

          return (
            <View
              key={`${item.productId}-${index}`}
              style={s.row}
            >
              <View style={s.main}>
                <Text style={s.name}>
                  {product?.name ||
                    item.productId}
                </Text>

                <Text style={s.meta}>
                  {item.qty} ×{' '}
                  {money(item.cost)}
                </Text>
              </View>

              <ActionButton
                label="Remover"
                tone="danger"
                onPress={() =>
                  setLines((current) =>
                    current.filter(
                      (
                        _,
                        itemIndex
                      ) =>
                        itemIndex !==
                        index
                    )
                  )
                }
              />
            </View>
          );
        })}

        <Text style={s.amount}>
          Total: {money(total)}
        </Text>

        {form.source === 'xml' && xmlDocumentTotal !== null && (
          <Notice
            text={
              Math.abs(total - xmlDocumentTotal) <= 0.02
                ? `Conferência concluída: itens e NF-e totalizam ${money(xmlDocumentTotal)}.`
                : `Atenção: itens ${money(total)} • NF-e ${money(xmlDocumentTotal)}. Ajuste os itens antes de confirmar.`
            }
            tone={Math.abs(total - xmlDocumentTotal) <= 0.02 ? undefined : 'error'}
          />
        )}

        <Field
          label="Observações"
          value={form.notes}
          onChangeText={(value) =>
            set('notes', value)
          }
          multiline
        />
      </FormModal>
    </AdminShell>
  );
}
