"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, Field, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { todayInput } from "@/lib/format";
import { useText } from "@/lib/i18n";

type Rate = {
  id: number;
  code: string;
  name: string;
  rate_date: string;
  normal_rate: number;
  purchase_rate: number;
  sell_rate: number;
};

type Currency = { code: string; name: string };

function rateInput(value: number) {
  return String(value);
}

export default function RatesPage() {
  const { t } = useText();
  const { has } = useSession();
  const canWrite = has("finance.write");
  const [rows, setRows] = useState<Rate[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currency, setCurrency] = useState("");
  const [drafts, setDrafts] = useState<Record<number, { normal_rate: string; purchase_rate: string; sell_rate: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rateDate, setRateDate] = useState(todayInput);
  const [code, setCode] = useState("USD");
  const [normal, setNormal] = useState("");
  const [purchased, setPurchased] = useState("");
  const [sold, setSold] = useState("");

  function apply(items: Rate[]) {
    setRows(items);
    setDrafts(
      Object.fromEntries(
        items.map((row) => [
          row.id,
          { normal_rate: rateInput(row.normal_rate), purchase_rate: rateInput(row.purchase_rate), sell_rate: rateInput(row.sell_rate) },
        ]),
      ),
    );
  }

  function load(nextCurrency = currency) {
    const params = new URLSearchParams();
    if (nextCurrency) params.set("code", nextCurrency);
    const query = params.toString();
    return api<{ currencies: Currency[]; items: Rate[] }>(`/finance/rates${query ? `?${query}` : ""}`).then((page) => {
      setCurrencies(page.currencies);
      apply(page.items);
    });
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }, [t]);

  const fields = useMemo(
    () => [
      { key: "date", label: t("common.date"), value: (row: Rate) => row.rate_date },
      { key: "currency", label: t("common.currency"), value: (row: Rate) => `${row.code} · ${row.name}` },
      { key: "normal", label: t("finance.normal"), value: (row: Rate) => rateInput(row.normal_rate) },
      { key: "purchased", label: t("finance.purchased"), value: (row: Rate) => rateInput(row.purchase_rate) },
      { key: "sold", label: t("finance.sold"), value: (row: Rate) => rateInput(row.sell_rate) },
    ],
    [t],
  );
  const list = useListControls(rows, fields);

  function chooseCurrency(next: string) {
    setCurrency(next);
    setError(null);
    load(next).catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }

  function patchDraft(id: number, field: "normal_rate" | "purchase_rate" | "sell_rate", value: string) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function saveRow(row: Rate) {
    const draft = drafts[row.id];
    if (!draft) return;
    setBusy(String(row.id));
    setError(null);
    try {
      const saved = await api<Rate>(`/finance/rates/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          normal_rate: Number(draft.normal_rate),
          purchase_rate: Number(draft.purchase_rate),
          sell_rate: Number(draft.sell_rate),
        }),
      });
      setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setDrafts((current) => ({
        ...current,
        [saved.id]: { normal_rate: rateInput(saved.normal_rate), purchase_rate: rateInput(saved.purchase_rate), sell_rate: rateInput(saved.sell_rate) },
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function recordRate(event: FormEvent) {
    event.preventDefault();
    setBusy("new");
    setError(null);
    try {
      await api<Rate>("/finance/rates", {
        method: "POST",
        body: JSON.stringify({
          code,
          rate_date: rateDate,
          normal_rate: Number(normal),
          purchase_rate: Number(purchased),
          sell_rate: Number(sold),
        }),
      });
      setNormal("");
      setPurchased("");
      setSold("");
      if (currency && currency !== code) setCurrency("");
      await load(currency && currency !== code ? "" : currency);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title={t("nav.rates")} eyebrow={t("nav.finance")} />
      <p className="mb-2 text-xs text-ink/55">{t("finance.ratesBlurb")}</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar
        fields={fields}
        controls={list}
        leading={
          <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label={t("common.currency")} value={currency} onChange={(event) => chooseCurrency(event.target.value)}>
            <option value="">{t("finance.allCurrencies")}</option>
            {currencies.map((item) => (
              <option key={item.code} value={item.code}>{item.code} · {item.name}</option>
            ))}
          </select>
        }
      />
      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("common.date")}</th>
              <th>{t("common.currency")}</th>
              <th>{t("finance.normal")}</th>
              <th>{t("finance.purchased")}</th>
              <th>{t("finance.sold")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.pageRows.map((row) => {
              const draft = drafts[row.id];
              const dirty =
                draft &&
                (draft.normal_rate !== rateInput(row.normal_rate) ||
                  draft.purchase_rate !== rateInput(row.purchase_rate) ||
                  draft.sell_rate !== rateInput(row.sell_rate));
              return (
                <tr key={row.id}>
                  <td>{row.rate_date}</td>
                  <td>
                    <div className="font-medium">{row.code}</div>
                    <div className="text-xs text-ink/45">{row.name}</div>
                  </td>
                  {(["normal_rate", "purchase_rate", "sell_rate"] as const).map((field) => (
                    <td key={field} className="w-40">
                      {canWrite ? (
                        <input
                          className="field"
                          type="number"
                          min="0"
                          step="0.000001"
                          value={draft?.[field] || ""}
                          onChange={(event) => patchDraft(row.id, field, event.target.value)}
                        />
                      ) : (
                        draft?.[field]
                      )}
                    </td>
                  ))}
                  <td className="w-24 text-right">
                    {canWrite && dirty && (
                      <button className="text-sm text-brass" type="button" disabled={busy === String(row.id)} onClick={() => saveRow(row)}>
                        {busy === String(row.id) ? t("common.saving") : t("common.save")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.filtered.length && <Empty>{t("common.empty")}</Empty>}
      </div>
      {canWrite && (
        <form className="card mt-4 grid gap-3 p-4 md:grid-cols-6" onSubmit={recordRate}>
          <h2 className="font-serif text-xl md:col-span-6">{t("finance.recordRate")}</h2>
          <Field label={t("common.date")}>
            <input className="field" type="date" value={rateDate} onChange={(event) => setRateDate(event.target.value)} required />
          </Field>
          <Field label={t("common.currency")}>
            <select className="field" value={code} onChange={(event) => setCode(event.target.value)} required>
              {currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("finance.normal")}>
            <input className="field" type="number" min="0" step="0.000001" value={normal} onChange={(event) => setNormal(event.target.value)} required />
          </Field>
          <Field label={t("finance.purchased")}>
            <input className="field" type="number" min="0" step="0.000001" value={purchased} onChange={(event) => setPurchased(event.target.value)} required />
          </Field>
          <Field label={t("finance.sold")}>
            <input className="field" type="number" min="0" step="0.000001" value={sold} onChange={(event) => setSold(event.target.value)} required />
          </Field>
          <div className="flex items-end">
            <button className="btn-primary" type="submit" disabled={busy === "new"}>
              {busy === "new" ? t("common.saving") : t("common.add")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
