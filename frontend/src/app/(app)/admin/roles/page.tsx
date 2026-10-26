"use client";

import { useEffect, useState } from "react";
import { Banner, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Page, Row } from "@/lib/types";

export default function RolesPage() {
  const { options, refresh } = useSession();
  const [roles, setRoles] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "", description: "" });

  async function reload() {
    const page = await api<Page<Row>>("/users/roles");
    setRoles(page.items);
    return page.items;
  }

  useEffect(() => {
    reload()
      .then((items) => {
        if (items[0]) {
          setSelected(items[0].id);
          setChecked(items[0].permission_ids || []);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load roles"));
  }, []);

  const role = roles.find((item) => item.id === selected);
  const modules = Array.from(new Set(options.permissions.map((item) => item.module)));

  function choose(next: Row) {
    setSelected(next.id);
    setChecked(next.permission_ids || []);
    setMessage(null);
  }

  async function save() {
    if (!role) return;
    setError(null);
    try {
      await api(`/users/roles/${role.id}/permissions`, { method: "PUT", body: JSON.stringify({ permission_ids: checked }) });
      await reload();
      await refresh();
      setMessage("Permissions saved. They apply on the next request.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function createRole() {
    setError(null);
    try {
      const created = await api<Row>("/users/roles", { method: "POST", body: JSON.stringify(draft) });
      const items = await reload();
      const next = items.find((item) => item.id === created.id) || created;
      choose(next);
      setDraft({ code: "", name: "", description: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the role");
    }
  }

  return (
    <div>
      <PageHeader title="Roles" eyebrow="Administration" />
      <p className="mb-2 text-xs text-ink/55">A role is both a person’s title and their permission bundle. Assign roles on user accounts.</p>
      {error && <Banner>{error}</Banner>}
      {message && <Banner tone="ok">{message}</Banner>}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="card p-2">
          {roles.map((item) => (
            <button key={item.id} className={`block w-full rounded-md px-3 py-2 text-left text-sm ${item.id === selected ? "bg-bone" : ""}`} onClick={() => choose(item)} type="button">
              <span className="block">{item.name}</span>
              <span className="text-xs text-ink/40">{item.code}</span>
            </button>
          ))}
        </aside>
        <section className="card p-4">
          {role ? (
            <>
              <h2 className="font-serif text-2xl">{role.name}</h2>
              <p className="text-sm text-ink/55">{role.description}</p>
              <div className="mt-4 space-y-4">
                {modules.map((module) => (
                  <div key={module}>
                    <div className="label">{module}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.permissions.filter((item) => item.module === module).map((perm) => (
                        <label key={perm.id} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked.includes(perm.id)}
                            onChange={() => setChecked((current) => (current.includes(perm.id) ? current.filter((id) => id !== perm.id) : [...current, perm.id]))}
                          />
                          <span><span className="block">{perm.name}</span><span className="text-xs text-ink/40">{perm.code}</span></span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-primary mt-4" onClick={save} type="button">Save permissions</button>
            </>
          ) : (
            <p className="text-sm text-ink/50">Select a role.</p>
          )}
        </section>
      </div>
      <form
        className="card mt-4 grid gap-3 p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          createRole();
        }}
      >
        <h2 className="font-serif text-2xl md:col-span-4">New role</h2>
        <input className="field" placeholder="Code" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} required />
        <input className="field" placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        <input className="field md:col-span-2" placeholder="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        <div className="md:col-span-4"><button className="btn-ghost" type="submit">Create role</button></div>
      </form>
    </div>
  );
}
