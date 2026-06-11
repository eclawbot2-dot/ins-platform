import Link from "next/link";
import { BarChart3, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { fmtMoney, toNum } from "@/lib/money";
import { fmtDate, startOfYear } from "@/lib/domain/dates";
import { producerProduction } from "@/lib/reports/production";
import { createUser, setUserPassword, toggleUserActive, updateUser } from "./actions";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  const [users, production] = await Promise.all([
    prisma.user.findMany({
      // Portal CLIENT logins are managed on the client pages, not here.
      where: { role: { not: "CLIENT" } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        phone: true,
        npn: true,
        defaultSplitPct: true,
        lastLoginAt: true,
        _count: { select: { producedPolicies: true, producedClients: true } },
      },
    }),
    producerProduction({ from: startOfYear(new Date()) }),
  ]);
  const productionByUser = new Map(production.map((p) => [p.producerId, p]));

  return (
    <>
      <PageHeader
        title="Team"
        description="Producers, CSRs, and admins — YTD production alongside each producer."
        actions={
          <Link href="/reports/production" className="btn">
            <BarChart3 className="h-4 w-4" /> Full production report
          </Link>
        }
      />

      <div className="space-y-4">
        {users.map((u) => {
          const prod = productionByUser.get(u.id);
          return (
            <div key={u.id} className="card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {u.name}
                    <Badge tone={u.role === "ADMIN" ? "violet" : u.role === "PRODUCER" ? "blue" : "slate"}>{u.role}</Badge>
                    {!u.active ? <Badge tone="red">Inactive</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ""}
                    {u.npn ? ` · NPN ${u.npn}` : ""} · default split {toNum(u.defaultSplitPct)}% · last login{" "}
                    {u.lastLoginAt ? fmtDate(u.lastLoginAt) : "never"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-right text-xs text-slate-600">
                  <div>
                    <div className="font-semibold text-slate-900">{u._count.producedPolicies}</div>
                    policies of record
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{u._count.producedClients}</div>
                    clients
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{prod ? fmtMoney(prod.writtenPremium) : "$0"}</div>
                    YTD written premium
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{prod ? fmtMoney(prod.commission) : "$0"}</div>
                    YTD commission
                  </div>
                </div>
              </div>

              {isAdmin ? (
                <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-3">
                  <form action={updateUser.bind(null, u.id)} className="flex flex-wrap items-end gap-2">
                    <Field label="Name">
                      <input name="name" defaultValue={u.name} className="input w-36" />
                    </Field>
                    <Field label="Role">
                      <Select
                        name="role"
                        defaultValue={u.role}
                        options={["ADMIN", "PRODUCER", "CSR"].map((r) => ({ value: r, label: r }))}
                      />
                    </Field>
                    <Field label="Split %">
                      <input
                        name="defaultSplitPct"
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        defaultValue={toNum(u.defaultSplitPct)}
                        className="input w-20"
                      />
                    </Field>
                    <Field label="NPN">
                      <input name="npn" defaultValue={u.npn ?? ""} className="input w-28" />
                    </Field>
                    <input type="hidden" name="phone" value={u.phone ?? ""} />
                    <button type="submit" className="btn btn-sm">Save</button>
                  </form>
                  <form action={setUserPassword.bind(null, u.id)} className="flex items-end gap-2">
                    <Field label="New password" hint="8+ chars — revokes sessions">
                      <input name="password" type="password" minLength={8} required className="input w-44" />
                    </Field>
                    <button type="submit" className="btn btn-sm">Set</button>
                  </form>
                  <div className="flex items-end justify-end">
                    {u.id !== session.userId ? (
                      <form action={toggleUserActive.bind(null, u.id)}>
                        {u.active ? (
                          <ConfirmButton message={`Deactivate ${u.name}? They will no longer be able to sign in.`}>
                            Deactivate
                          </ConfirmButton>
                        ) : (
                          <button type="submit" className="btn btn-sm">
                            Reactivate
                          </button>
                        )}
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">This is you</span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {isAdmin ? (
        <div className="card-pad mt-6 max-w-3xl">
          <h2 className="section-title mb-3">
            <Plus className="mr-1 inline h-4 w-4" /> Add user
          </h2>
          <form action={createUser} className="space-y-4">
            <FormGrid cols={3}>
              <Field label="Name" required>
                <input name="name" required className="input" />
              </Field>
              <Field label="Email" required>
                <input name="email" type="email" required className="input" />
              </Field>
              <Field label="Password" required hint="8+ characters">
                <input name="password" type="password" minLength={8} required className="input" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="PRODUCER" options={["ADMIN", "PRODUCER", "CSR"].map((r) => ({ value: r, label: r }))} />
              </Field>
              <Field label="Phone">
                <input name="phone" className="input" />
              </Field>
              <Field label="Default split %">
                <input name="defaultSplitPct" type="number" step="0.5" min="0" max="100" defaultValue={100} className="input" />
              </Field>
              <Field label="NPN">
                <input name="npn" className="input" />
              </Field>
            </FormGrid>
            <button type="submit" className="btn-primary">Create user</button>
          </form>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">User management requires the ADMIN role.</p>
      )}
    </>
  );
}
