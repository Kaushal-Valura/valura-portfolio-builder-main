"use client";
// Client step: one sheet. Left (mint) is the mandate slip: who and how much. Right is the three rules that change the build.
import type { Client } from "@/lib/engine";

const RISKS = ["Low", "Medium-Low", "Medium", "Medium-High", "High"];
const words = new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 2 });

export const setupErrors = (client: Client) => [
  !client.name.trim() && "Enter the client name.",
  !(client.amount > 0) && "Enter how much the client will invest.",
].filter(Boolean) as string[];

// A rule row: the question and what the current answer means, with its control.
function Rule({ id, title, note, children, stacked }: { id: string; title: string; note: string; children: React.ReactNode; stacked?: boolean }) {
  return (
    <div role="radiogroup" aria-labelledby={id} className={`py-6 ${stacked ? "" : "flex flex-wrap items-center justify-between gap-x-6 gap-y-3"}`}>
      <div className="min-w-0 max-w-[46ch]">
        <h3 id={id} className="text-[15px] font-bold">{title}</h3>
        <p className="mt-1 text-[13px] leading-snug text-muted">{note}</p>
      </div>
      <div className={stacked ? "mt-4" : ""}>{children}</div>
    </div>
  );
}

function YesNo({ name, value, order, onChange }: { name: string; value: "Yes" | "No"; order: ("Yes" | "No")[]; onChange: (v: "Yes" | "No") => void }) {
  return (
    <div className="inline-grid grid-cols-2 rounded-full bg-surface-2 p-1">
      {order.map((v) => (
        <label key={v} className="relative cursor-pointer">
          <input type="radio" name={name} className="peer sr-only" checked={value === v} onChange={() => onChange(v)} />
          <span className="block min-w-16 rounded-full px-5 py-1.5 text-center text-sm font-semibold text-muted transition-colors peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-[var(--shadow)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{v}</span>
        </label>
      ))}
    </div>
  );
}

export default function Setup({ client, onChange, onNext }: { client: Client; onChange: (c: Client) => void; onNext: () => void }) {
  const set = <K extends keyof Client>(k: K, v: Client[K]) => onChange({ ...client, [k]: v });
  const errors = setupErrors(client);
  const level = RISKS.indexOf(client.riskProfile);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!errors.length) onNext(); }}
      className="max-w-[1200px] overflow-hidden rounded-[28px] border border-line bg-surface shadow-[var(--shadow)]"
    >
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* the mandate slip */}
        <div className="flex flex-col justify-center border-b border-line bg-mint px-6 py-8 sm:px-10 sm:py-10 lg:border-b-0 lg:border-r">
          <label className="block">
            <span className="text-sm font-semibold text-accent-deep">Client name or ID</span>
            <input
              value={client.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. CL-003 Mehta family"
              className="mt-2 w-full border-0 border-b-2 border-accent/25 bg-transparent! pb-2 text-[26px] font-bold tracking-tight text-ink outline-none placeholder:font-medium placeholder:text-faint focus:border-accent focus-visible:outline-none"
            />
          </label>

          <label className="mt-10 block">
            <span className="text-sm font-semibold text-accent-deep">Amount to invest</span>
            <span className="mt-1 flex items-baseline gap-2 border-b-2 border-accent/25 pb-1 focus-within:border-accent">
              <span aria-hidden className="num text-[clamp(32px,4vw,48px)] font-semibold text-accent">$</span>
              <input
                inputMode="numeric" placeholder="1,000,000" aria-label="Amount to invest, US dollars"
                value={client.amount ? client.amount.toLocaleString("en-US") : ""}
                onChange={(e) => set("amount", Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
                className="num w-full min-w-0 border-0 bg-transparent! text-[clamp(40px,5.2vw,68px)] font-bold leading-tight tracking-tight text-accent-deep outline-none placeholder:text-accent/25 focus-visible:outline-none"
              />
              <span className="text-sm font-bold text-muted">USD</span>
            </span>
            <span className="mt-3 block text-[15px] text-ink-2" aria-live="polite">
              {client.amount > 0 ? `${words.format(client.amount)} US dollars` : "Type the full amount. We'll read it back in words."}
            </span>
          </label>
        </div>

        {/* the rules */}
        <div className="divide-y divide-line px-6 sm:px-10">
          <Rule id="rule-risk" title="Risk profile" note="How much risk the client has agreed to. It appears on the client report." stacked>
            <div className="grid grid-cols-5 gap-1.5">
              {RISKS.map((r, i) => (
                <label key={r} className="relative cursor-pointer">
                  <input type="radio" name="risk" className="peer sr-only" checked={i === level} onChange={() => onChange({ ...client, riskProfile: r })} />
                  <span aria-hidden className="block h-3 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2"
                    style={{ background: i <= level ? `color-mix(in srgb, var(--accent-deep) ${30 + i * 17}%, var(--mint))` : "var(--surface-2)" }} />
                  <span className={`mt-2 block text-[12.5px] leading-tight ${i === level ? "font-bold text-ink" : "text-muted"}`}>{r}</span>
                </label>
              ))}
            </div>
          </Rule>

          <Rule id="rule-cert" title="Accredited certificate on file?"
            note={client.accreditedVerified === "Yes" ? "Private funds can be recommended without a hold." : "Private funds are flagged until the certificate is on file."}>
            <YesNo name="cert" value={client.accreditedVerified} order={["Yes", "No"]} onChange={(v) => set("accreditedVerified", v)} />
          </Rule>

          <Rule id="rule-us" title="US person (citizen or green card)?"
            note={client.usPerson === "Yes" ? "The US estate-tax limit doesn't apply to this client." : "US-domiciled holdings stay under the $60k US estate-tax limit."}>
            <YesNo name="us" value={client.usPerson} order={["No", "Yes"]} onChange={(v) => set("usPerson", v)} />
          </Rule>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 sm:px-10">
        <p className="text-sm text-ink-2" role="status">{errors[0] ?? "Next, set the client's wishes and let the optimiser build the portfolio."}</p>
        <button type="submit" disabled={errors.length > 0} className="btn btn-primary">Continue to portfolio builder</button>
      </div>
    </form>
  );
}
