"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fStr, fStrOpt, fNum, fNumOpt, fDate, fEnum } from "@/lib/form";
import { fromCsv } from "@/lib/csv";
import { reconcileLine } from "@/lib/domain/commissions";
import { toNum } from "@/lib/money";
import type { TransactionType } from "@prisma/client";

const TXN_TYPES: TransactionType[] = ["NEW_BUSINESS", "RENEWAL", "ENDORSEMENT", "CANCELLATION", "AUDIT"];

export async function createStatement(formData: FormData) {
  const session = await requireSession();
  const statement = await prisma.commissionStatement.create({
    data: {
      carrierId: fStr(formData, "carrierId"),
      statementDate: fDate(formData, "statementDate") ?? new Date(),
      periodLabel: fStrOpt(formData, "periodLabel"),
      totalAmount: fNum(formData, "totalAmount"),
      notes: fStrOpt(formData, "notes"),
    },
  });
  await audit({ userId: session.userId, action: "STATEMENT_CREATE", entityType: "CommissionStatement", entityId: statement.id });
  redirect(`/commissions/${statement.id}?toast=${encodeURIComponent("Statement created — add lines or import CSV")}`);
}

export async function addStatementLine(statementId: string, formData: FormData) {
  await requireSession();
  await prisma.commissionStatementLine.create({
    data: {
      statementId,
      policyNumber: fStr(formData, "policyNumber"),
      insuredName: fStrOpt(formData, "insuredName"),
      transactionType: fEnum(formData, "transactionType", TXN_TYPES, "NEW_BUSINESS"),
      premium: fNumOpt(formData, "premium"),
      commissionAmount: fNum(formData, "commissionAmount"),
    },
  });
  revalidatePath(`/commissions/${statementId}`);
  redirect(`/commissions/${statementId}?toast=${encodeURIComponent("Line added")}`);
}

/**
 * CSV import. Expected headers (case-insensitive, flexible):
 *   policyNumber, insuredName, transactionType, premium, commissionAmount
 */
export async function importStatementCsv(statementId: string, formData: FormData) {
  await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/commissions/${statementId}?toastError=${encodeURIComponent("Choose a CSV file")}`);
  }
  const text = await file.text();
  const rows = fromCsv(text);
  if (rows.length === 0) {
    redirect(`/commissions/${statementId}?toastError=${encodeURIComponent("CSV has no data rows")}`);
  }

  const pick = (row: Record<string, string>, ...names: string[]): string => {
    for (const key of Object.keys(row)) {
      if (names.some((n) => key.trim().toLowerCase().replace(/[\s_]/g, "") === n)) return row[key] ?? "";
    }
    return "";
  };

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const policyNumber = pick(row, "policynumber", "policy", "policyno", "policy#").trim();
    const commissionRaw = pick(row, "commissionamount", "commission", "commission$", "amount").replace(/[$,]/g, "");
    const commissionAmount = Number(commissionRaw);
    if (!policyNumber || !Number.isFinite(commissionAmount)) {
      skipped += 1;
      continue;
    }
    const premiumRaw = pick(row, "premium", "writtenpremium").replace(/[$,]/g, "");
    const txnRaw = pick(row, "transactiontype", "type", "txn").trim().toUpperCase().replace(/[\s-]/g, "_");
    const transactionType = (TXN_TYPES as string[]).includes(txnRaw) ? (txnRaw as TransactionType) : txnRaw.startsWith("REN") ? "RENEWAL" : "NEW_BUSINESS";
    await prisma.commissionStatementLine.create({
      data: {
        statementId,
        policyNumber,
        insuredName: pick(row, "insuredname", "insured", "client", "name") || null,
        transactionType,
        premium: Number.isFinite(Number(premiumRaw)) && premiumRaw !== "" ? Number(premiumRaw) : null,
        commissionAmount,
      },
    });
    imported += 1;
  }
  revalidatePath(`/commissions/${statementId}`);
  redirect(
    `/commissions/${statementId}?toast=${encodeURIComponent(`Imported ${imported} line(s)${skipped ? `, skipped ${skipped}` : ""}`)}`,
  );
}

/**
 * Reconcile every line on the statement against expected policy
 * commissions (policy lookup scoped to the statement's carrier).
 */
export async function reconcileStatement(statementId: string) {
  const session = await requireSession();
  const statement = await prisma.commissionStatement.findUnique({
    where: { id: statementId },
    include: { lines: true },
  });
  if (!statement) redirect(`/commissions?toastError=${encodeURIComponent("Statement not found")}`);

  const policies = await prisma.policy.findMany({
    where: { carrierId: statement.carrierId },
    select: { id: true, policyNumber: true, commissionAmount: true },
  });
  const reconcilable = policies.map((p) => ({
    id: p.id,
    policyNumber: p.policyNumber,
    expectedCommission: toNum(p.commissionAmount),
  }));

  let matched = 0;
  let variance = 0;
  let unmatched = 0;
  for (const line of statement.lines) {
    const result = reconcileLine(
      { policyNumber: line.policyNumber, commissionAmount: toNum(line.commissionAmount) },
      reconcilable,
    );
    await prisma.commissionStatementLine.update({
      where: { id: line.id },
      data: {
        policyId: result.policyId,
        matchStatus: result.matchStatus,
        varianceAmount: result.varianceAmount,
      },
    });
    if (result.matchStatus === "MATCHED") matched += 1;
    else if (result.matchStatus === "VARIANCE") variance += 1;
    else unmatched += 1;
  }

  await prisma.commissionStatement.update({
    where: { id: statementId },
    data: { status: unmatched === 0 && variance === 0 ? "RECONCILED" : "RECONCILING" },
  });
  await audit({ userId: session.userId, action: "STATEMENT_RECONCILE", entityType: "CommissionStatement", entityId: statementId });
  revalidatePath(`/commissions/${statementId}`);
  redirect(
    `/commissions/${statementId}?toast=${encodeURIComponent(`Reconciled: ${matched} matched, ${variance} variance, ${unmatched} unmatched`)}`,
  );
}

export async function markStatementReconciled(statementId: string) {
  await requireSession();
  await prisma.commissionStatement.update({ where: { id: statementId }, data: { status: "RECONCILED" } });
  redirect(`/commissions/${statementId}?toast=${encodeURIComponent("Statement marked reconciled")}`);
}

export async function deleteStatementLine(statementId: string, lineId: string) {
  await requireSession();
  await prisma.commissionStatementLine.delete({ where: { id: lineId } });
  revalidatePath(`/commissions/${statementId}`);
  redirect(`/commissions/${statementId}?toast=${encodeURIComponent("Line removed")}`);
}
