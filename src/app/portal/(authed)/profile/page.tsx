import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal";
import { DetailItem } from "@/components/ui/page-header";
import { fmtDate } from "@/lib/domain/dates";
import { portalRequestProfileChange } from "../actions";

export const dynamic = "force-dynamic";

export default async function PortalProfilePage() {
  const session = await requirePortalSession();

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: {
      name: true,
      type: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zip: true,
      createdAt: true,
    },
  });

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Your profile</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Signed in as {session.email}. Contact details are managed by the agency — send a request
          to update anything.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">On file with the agency</h2>
          <dl className="grid grid-cols-2 gap-3">
            <DetailItem label="Name">{client?.name}</DetailItem>
            <DetailItem label="Type">{client?.type === "BUSINESS" ? "Business" : "Individual"}</DetailItem>
            <DetailItem label="Email">{client?.email}</DetailItem>
            <DetailItem label="Phone">{client?.phone}</DetailItem>
            <DetailItem label="Address">
              {client?.addressLine1
                ? `${client.addressLine1}${client.addressLine2 ? `, ${client.addressLine2}` : ""}, ${client.city ?? ""} ${client.state ?? ""} ${client.zip ?? ""}`
                : "—"}
            </DetailItem>
            <DetailItem label="Client since">{client ? fmtDate(client.createdAt) : "—"}</DetailItem>
          </dl>
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">Request a change</h2>
          <p className="mb-3 text-sm text-slate-600">
            Moved, new phone number, name change? Tell us and we&apos;ll update your records and any
            affected policies.
          </p>
          <form action={portalRequestProfileChange} className="space-y-4">
            <div>
              <label className="label" htmlFor="profile-message">What should we update?</label>
              <textarea
                id="profile-message"
                name="message"
                rows={5}
                className="input"
                minLength={5}
                required
                placeholder="e.g. New mailing address: 12 King St, Charleston SC 29401 effective July 1"
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center py-2.5 sm:w-auto">
              Send request
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
