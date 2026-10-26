"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, DetailHeader, Field, Loading } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { money, num, todayInput } from "@/lib/format";
import { useText } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { GoodsLink } from "./goods-link";
import { GoodsPicker, type TradeProduct } from "./goods-picker";
import { PersonPicker, type Person } from "./person-picker";
import { SupplierPicker, type Supplier } from "./supplier-picker";

type Product = TradeProduct;
type Customer = { id: number; name: string; kind: string; contact_name?: string | null; phone?: string | null; is_active: boolean };
type Warehouse = { id: number; name: string; unit_name?: string | null };
type Seller = Person;
type Line = { product_id: string; quantity: string; unit_price: string; line_amount: string };

function amountInput(quantity: string, unitPrice: string) {
  const amount = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  return String(Math.round(amount * 100) / 100);
}

type Order = {
  id: number;
  order_no: string;
  direction: string;
  counterparty: string;
  currency: string;
  status: string;
  trade_date: string;
  unit_id?: number | null;
  customer_id?: number | null;
  seller_employee_id?: number | null;
  seller_name?: string | null;
  assignee_employee_id?: number | null;
  assignee_name?: string | null;
  transport_mode?: string | null;
  location_id?: number | null;
  shipping_fee: number;
  procedure_fee: number;
  goods_amount: number;
  consumed: number;
  amount: number;
  note?: string | null;
  lines: { product_id: number; quantity: number; unit_price: number; line_amount: number; name?: string; uom?: string; variety?: string; category?: string }[];
};

const emptyLine = (): Line => ({ product_id: "", quantity: "1", unit_price: "", line_amount: "0" });

export function OrderForm({ id, mode }: { id: string; mode: "buy" | "sell" }) {
  const isNew = id === "new";
  const { t } = useText();
  const { defaultCurrency } = useSettings();
  const { has, options, me } = useSession();
  const canWrite = has("trading.write");
  const ownOrders = !me?.roles.some((role) => role.code === "ceo");
  const router = useRouter();
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [placed, setPlaced] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [status, setStatus] = useState("open");
  const [currency, setCurrency] = useState("USD");
  const currencyTouched = useRef(false);
  const [tradeDate, setTradeDate] = useState(todayInput());
  const [unitId, setUnitId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [transport, setTransport] = useState("truck");
  const [locationId, setLocationId] = useState("");
  const [shippingFee, setShippingFee] = useState("0");
  const [procedureFee, setProcedureFee] = useState("0");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  useEffect(() => {
    if (!isNew || currencyTouched.current) return;
    setCurrency(defaultCurrency);
  }, [defaultCurrency, isNew]);

  useEffect(() => {
    if (!ownOrders || !me?.employee) return;
    setAssigneeId(String(me.employee.id));
    setAssigneeName(me.employee.full_name);
  }, [ownOrders, me]);

  useEffect(() => {
    api<{ products: Product[]; customers: Customer[]; sellers: Seller[]; suppliers: Supplier[]; warehouses: Warehouse[] }>("/trades/lookups")
      .then((data) => {
        setProducts(data.products);
        setCustomers(data.customers);
        setSellers(data.sellers);
        setSuppliers(data.suppliers || []);
        setWarehouses(data.warehouses || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }, [t]);

  useEffect(() => {
    if (isNew) return;
    api<Order>(`/trades/${id}`)
      .then((row) => {
        if (row.direction !== mode) {
          setPlaced(false);
          router.replace(row.direction === "sell" ? `/trading/sales/${id}` : `/trading/${id}`);
          return;
        }
        setOrderNo(row.order_no);
        setStatus(row.status);
        setCurrency(row.currency);
        setTradeDate(String(row.trade_date).slice(0, 10));
        setUnitId(row.unit_id ? String(row.unit_id) : "");
        setSupplier(row.direction === "buy" ? row.counterparty : "");
        setCustomerId(row.customer_id ? String(row.customer_id) : "");
        setSellerId(row.seller_employee_id ? String(row.seller_employee_id) : "");
        setSellerName(row.seller_name || "");
        setAssigneeId(row.assignee_employee_id ? String(row.assignee_employee_id) : "");
        setAssigneeName(row.assignee_name || "");
        setTransport(row.transport_mode || "truck");
        setLocationId(row.location_id ? String(row.location_id) : "");
        setShippingFee(String(row.shipping_fee ?? 0));
        setProcedureFee(String(row.procedure_fee ?? 0));
        setNote(row.note || "");
        setLines(
          row.lines.length
            ? row.lines.map((line) => ({
                product_id: String(line.product_id),
                quantity: String(line.quantity),
                unit_price: String(line.unit_price),
                line_amount: String(line.line_amount),
              }))
            : [emptyLine()],
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")))
      .finally(() => setLoading(false));
  }, [id, isNew, mode, router, t]);

  const selectedProducts = useMemo(() => new Set(lines.map((line) => line.product_id)), [lines]);
  const productChoices = products.filter((item) => item.is_active || selectedProducts.has(String(item.id)));
  const customerChoices = customers.filter((item) => item.is_active || String(item.id) === customerId);
  const buy = mode === "buy";
  const listHref = buy ? "/trading" : "/trading/sales";

  const goodsAmount = lines.reduce((sum, line) => sum + (Number(line.line_amount) || 0), 0);
  const shipping = buy ? Number(shippingFee) || 0 : 0;
  const procedure = buy ? Number(procedureFee) || 0 : 0;
  const total = goodsAmount + shipping + procedure;

  function updateLine(index: number, patch: Partial<Line>, recalc = false) {
    setLines((current) =>
      current.map((line, item) => {
        if (item !== index) return line;
        const next = { ...line, ...patch };
        if (recalc) next.line_amount = amountInput(next.quantity, next.unit_price);
        return next;
      }),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        order_no: buy ? orderNo.trim() : isNew ? null : orderNo,
        direction: mode,
        status,
        currency,
        trade_date: tradeDate,
        unit_id: unitId ? Number(unitId) : null,
        counterparty: buy ? supplier.trim() : null,
        customer_id: buy ? null : customerId ? Number(customerId) : null,
        seller_employee_id: buy ? null : sellerId ? Number(sellerId) : null,
        assignee_employee_id: assigneeId ? Number(assigneeId) : null,
        transport_mode: buy ? transport : null,
        location_id: locationId ? Number(locationId) : null,
        shipping_fee: shipping,
        procedure_fee: procedure,
        note: note.trim() || null,
        lines: lines
          .filter((line) => line.product_id)
          .map((line) => ({
            product_id: Number(line.product_id),
            quantity: Number(line.quantity),
            unit_price: Number(line.unit_price),
            line_amount: Number(line.line_amount) || 0,
          })),
      };
      if (!body.lines.length) throw new Error(t("trading.addLine"));
      const saved = await api<Order>(isNew ? "/trades" : `/trades/${id}`, {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify(body),
      });
      toast.success(t("common.saved"));
      if (isNew) router.replace(`${listHref}/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(t("common.removeConfirm"))) return;
    setSaving(true);
    try {
      await api(`/trades/${id}`, { method: "DELETE" });
      router.push(listHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.removeFailed"));
      setSaving(false);
    }
  }

  if (loading || !placed) return <Loading />;

  return (
    <form onSubmit={onSubmit}>
      <DetailHeader
        backHref={listHref}
        backLabel={buy ? t("nav.orders") : t("nav.sales")}
        title={isNew ? (buy ? t("trading.newOrder") : t("trading.newSale")) : orderNo || (buy ? t("nav.orders") : t("nav.sales"))}
        action={
          canWrite ? (
            <div className="flex gap-2">
              {!isNew && (
                <button className="btn-danger" type="button" disabled={saving} onClick={remove}>
                  {t("common.delete")}
                </button>
              )}
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          ) : null
        }
      />
      <p className="mb-4 max-w-3xl text-sm text-ink/60">{buy ? t("trading.ordersBlurb") : t("trading.sellBlurb")}</p>
      {error && <Banner>{error}</Banner>}
      <div className="card grid gap-4 p-4 md:grid-cols-3">
        {buy && (
          <Field label={t("trading.orderNo")}>
            <input className="field" value={orderNo} onChange={(event) => setOrderNo(event.target.value)} required disabled={!canWrite} />
          </Field>
        )}
        <Field label={t("common.date")}>
          <input className="field" type="date" value={tradeDate} onChange={(event) => setTradeDate(event.target.value)} required disabled={!canWrite} />
        </Field>
        <Field label={t("common.status")}>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value)} disabled={!canWrite}>
            <option value="draft">{t("tradeStatus.draft")}</option>
            <option value="open">{t("tradeStatus.open")}</option>
            <option value="settled">{t("tradeStatus.settled")}</option>
          </select>
        </Field>
        <Field label={t("common.currency")}>
          <select
            className="field"
            value={currency}
            onChange={(event) => {
              currencyTouched.current = true;
              setCurrency(event.target.value);
            }}
            disabled={!canWrite}
          >
            <option value="USD">USD</option>
            <option value="RMB">RMB</option>
          </select>
        </Field>
        <Field label={t("common.unit")}>
          <select className="field" value={unitId} onChange={(event) => setUnitId(event.target.value)} disabled={!canWrite}>
            <option value="">{t("common.none")}</option>
            {options.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("trading.warehouse")}>
          <select className="field" value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={!canWrite}>
            <option value="">{t("trading.unassigned")}</option>
            {warehouses.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
                {place.unit_name ? ` · ${place.unit_name}` : ""}
              </option>
            ))}
          </select>
        </Field>
        {buy ? (
          <>
            <Field label={t("trading.supplier")}>
              <SupplierPicker
                suppliers={
                  supplier && !suppliers.some((item) => item.name.toLowerCase() === supplier.toLowerCase())
                    ? [{ id: null, name: supplier }, ...suppliers]
                    : suppliers
                }
                value={supplier}
                disabled={!canWrite}
                canAdd={canWrite}
                onChange={setSupplier}
                onCreated={(created) =>
                  setSuppliers((current) =>
                    current.some((item) => item.name.toLowerCase() === created.name.toLowerCase()) ? current : [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
                  )
                }
              />
            </Field>
            <Field label={t("trading.transport")}>
              <select className="field" value={transport} onChange={(event) => setTransport(event.target.value)} disabled={!canWrite}>
                <option value="ship">{t("trading.ship")}</option>
                <option value="truck">{t("trading.truck")}</option>
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
              <Field label={t("trading.shippingFee")}>
                <input className="field" type="number" min="0" step="0.01" value={shippingFee} onChange={(event) => setShippingFee(event.target.value)} disabled={!canWrite} />
              </Field>
              <Field label={t("trading.procedureFee")}>
                <input className="field" type="number" min="0" step="0.01" value={procedureFee} onChange={(event) => setProcedureFee(event.target.value)} disabled={!canWrite} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label={t("trading.customer")}>
              <select className="field" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required disabled={!canWrite}>
                <option value="">{t("common.select")}</option>
                {customerChoices.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {t(`customerKind.${customer.kind}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("trading.seller")}>
              <select className="field" value={sellerId} onChange={(event) => setSellerId(event.target.value)} required disabled={!canWrite}>
                <option value="">{t("common.select")}</option>
                {(sellers.some((seller) => String(seller.id) === sellerId) || !sellerId
                  ? sellers
                  : [{ id: Number(sellerId), full_name: sellerName || t("trading.seller"), employee_no: "", unit_name: null }, ...sellers]
                ).map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.full_name}
                    {seller.employee_no ? ` · ${seller.employee_no}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label={t("trading.assignee")}>
          <PersonPicker
            people={
              ownOrders && me?.employee
                ? [{ id: me.employee.id, full_name: me.employee.full_name, employee_no: me.employee.employee_no, unit_name: null }]
                : assigneeId && !sellers.some((person) => String(person.id) === assigneeId)
                  ? [{ id: Number(assigneeId), full_name: assigneeName || t("trading.assignee"), employee_no: "", unit_name: null }, ...sellers]
                  : sellers
            }
            value={assigneeId}
            disabled={!canWrite || ownOrders}
            onChange={setAssigneeId}
          />
        </Field>
        <Field label={t("common.note")}>
          <input className="field" value={note} onChange={(event) => setNote(event.target.value)} disabled={!canWrite} />
        </Field>
      </div>

      <section className="card mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl">{t("trading.lines")}</h2>
          {canWrite && (
            <button className="btn-ghost" type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>
              {t("trading.addLine")}
            </button>
          )}
        </div>
        {!productChoices.length && (
          <p className="mb-3 text-sm text-ink/60">
            <a className="text-brass" href="/trading/goods">
              {t("trading.catalog")}
            </a>
          </p>
        )}
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("trading.lines")}</th>
                <th>{t("trading.qty")}</th>
                <th>{buy ? t("trading.originalPrice") : t("trading.salePrice")}</th>
                <th>{t("trading.lineAmount")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const product = productChoices.find((item) => String(item.id) === line.product_id);
                return (
                  <tr key={index}>
                    <td className="min-w-64">
                      <GoodsPicker
                        products={productChoices}
                        value={line.product_id}
                        disabled={!canWrite}
                        canAdd={canWrite}
                        onChange={(productId) => updateLine(index, { product_id: productId })}
                        onCreated={(product) => setProducts((current) => (current.some((item) => item.id === product.id) ? current : [...current, product]))}
                      />
                      {product && (
                        <GoodsLink className="mt-1 inline-block text-xs" productId={product.id} name={product.name} />
                      )}
                    </td>
                    <td className="w-28">
                      <input className="field" type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value }, true)} disabled={!canWrite} />
                    </td>
                    <td className="w-36">
                      <input className="field" type="number" min="0" step="0.01" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.target.value }, true)} disabled={!canWrite} />
                    </td>
                    <td className="w-36">
                      <input className="field" type="number" min="0" step="0.01" value={line.line_amount} onChange={(event) => updateLine(index, { line_amount: event.target.value })} disabled={!canWrite} />
                    </td>
                    <td className="w-16">
                      {canWrite && lines.length > 1 && (
                        <button className="text-sm text-clay" type="button" onClick={() => setLines((current) => current.filter((_, item) => item !== index))}>
                          {t("common.remove")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:ml-auto sm:max-w-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink/50">{t("trading.goodsAmount")}</dt>
            <dd>{money(goodsAmount, currency, 2)}</dd>
          </div>
          {buy && (
            <>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
                <div className="flex gap-3">
                  <dt className="text-ink/50">{t("trading.shippingFee")}</dt>
                  <dd>{money(shipping, currency, 2)}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-ink/50">{t("trading.procedureFee")}</dt>
                  <dd>{money(procedure, currency, 2)}</dd>
                </div>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-2 font-medium">
                <dt>{t("trading.consumed")}</dt>
                <dd>{money(total, currency, 2)}</dd>
              </div>
            </>
          )}
          {!buy && (
            <div className="flex justify-between gap-4 border-t border-line pt-2 font-medium">
              <dt>{t("trading.total")}</dt>
              <dd>{money(total, currency, 2)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-xs text-ink/45">{t("trading.lineAmountHint")}</p>
        {buy && <p className="mt-1 text-xs text-ink/45">{num(lines.filter((line) => line.product_id).length)} {t("trading.lines")}</p>}
      </section>
    </form>
  );
}
