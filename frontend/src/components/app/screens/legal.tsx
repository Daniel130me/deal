"use client";

import { Logo } from "@/components/landing/logo";
import { useApp } from "@/components/app/context";

const EFFECTIVE_DATE = "10 November 2026";

const DOCUMENTS = {
  terms: {
    title: "Terms of Service",
    sections: [
      {
        heading: "Using DEAL",
        body: "DEAL provides tools for creators and clients to record project terms, payment schedules, approvals, delivery activity and disputes. You must provide accurate information, protect your account, and use the service only for lawful work.",
      },
      {
        heading: "Agreements between users",
        body: "A project agreement is between the creator and client identified in that agreement. DEAL records their instructions and activity but is not a party to the underlying creative-services contract. Each party remains responsible for scope, taxes, licences and delivery obligations.",
      },
      {
        heading: "Payments",
        body: "Flutterwave or Paystack processes checkout and payment credentials under its own terms. DEAL verifies provider responses and records payment status against the project. Unless DEAL expressly confirms a regulated custody or payout service in writing, an internal status such as held or released is a workflow record and is not a bank balance, wallet or promise that funds have settled to a creator.",
      },
      {
        heading: "Files and approvals",
        body: "Creators control the files they upload. Clients receive access according to the project workflow and approval state. Users must not upload malware, unlawful material, or content they lack permission to use. Keep an independent copy of important files.",
      },
      {
        heading: "Suspension and termination",
        body: "DEAL may restrict accounts or content to protect users, comply with law, investigate fraud, or address a material breach. You may stop using the service at any time, subject to unresolved payment, dispute, or record-retention obligations.",
      },
      {
        heading: "Liability",
        body: "The service is provided with reasonable care, but availability may be affected by payment, hosting, storage and network providers. Nothing in these terms excludes liability that applicable law does not permit us to exclude.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        heading: "Information we collect",
        body: "We collect account and profile details, project and client records, messages entered into project workflows, payment references and status, uploaded-file metadata, security logs, device and request information, and support communications. Payment card details are entered on the payment provider’s hosted checkout and are not stored by DEAL.",
      },
      {
        heading: "How we use information",
        body: "We use information to provide and secure accounts, run project workflows, verify payment events, control file access, prevent abuse, respond to support requests, meet legal obligations, and improve reliability. We do not sell personal information.",
      },
      {
        heading: "Service providers",
        body: "DEAL uses infrastructure and payment providers, including Render, Neon, Cloudflare R2, Flutterwave and Paystack. They process limited information needed to provide hosting, database, storage, fraud-prevention and payment services under their own security and privacy obligations.",
      },
      {
        heading: "Retention and security",
        body: "We use access controls, encryption in transit, private object storage and auditable payment references. We retain records for as long as needed to operate the service, resolve disputes, prevent fraud and meet legal obligations. No internet service can guarantee absolute security.",
      },
      {
        heading: "Your choices and rights",
        body: "You may request access, correction or deletion of personal information, subject to identity verification and records we must retain. You can also object to or restrict certain processing where applicable law provides that right.",
      },
      {
        heading: "Contact",
        body: "For privacy, account or legal requests, email hello@deal.ng. We may update this policy when the service or legal requirements change; the effective date above identifies the current version.",
      },
    ],
  },
} as const;

export default function LegalScreen({ document }: { document: keyof typeof DOCUMENTS }) {
  const { navigate } = useApp();
  const content = DOCUMENTS[document];

  return (
    <div className="min-h-screen bg-[#f4f7f5]">
      <header className="border-b border-border bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <button type="button" onClick={() => navigate("/")} aria-label="DEAL home">
            <Logo />
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-sm font-bold text-primary hover:underline"
          >
            Back to home
          </button>
        </div>
      </header>

      <main className="container-page py-12 sm:py-16">
        <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{content.title}</h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
          <div className="mt-8 space-y-8">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-extrabold text-foreground">{section.heading}</h2>
                <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>
          <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
            Questions? <a className="font-bold text-primary hover:underline" href="mailto:hello@deal.ng">hello@deal.ng</a>
          </p>
        </article>
      </main>
    </div>
  );
}
