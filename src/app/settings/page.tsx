"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Save, Loader2, KeyRound, FileText, Layers, ArrowLeft, Check } from "lucide-react";
import clsx from "clsx";
import { PageHeader, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { renderTemplate, TEMPLATE_PLACEHOLDERS } from "@/lib/template";
import { syncEngine } from "@/lib/offline/sync";

type Provider = "NONE" | "GREEN_API" | "ULTRAMSG" | "TWILIO";
type SettingsForm = {
  centerName: string;
  provider: Provider;
  autoSend: boolean;
  apiUrl: string;
  instanceId: string;
  apiToken: string;
  senderNumber: string;
  attendanceTemplate: string;
  unpaidNotice: string;
};

const PROVIDERS: { id: Provider; name: string; hint: string; idLabel: string; tokenLabel: string }[] = [
  { id: "NONE", name: "يدوي", hint: "يفتح واتساب برسالة جاهزة", idLabel: "", tokenLabel: "" },
  { id: "GREEN_API", name: "Green API", hint: "green-api.com", idLabel: "idInstance", tokenLabel: "apiTokenInstance" },
  { id: "ULTRAMSG", name: "UltraMsg", hint: "ultramsg.com", idLabel: "Instance ID", tokenLabel: "Token" },
  { id: "TWILIO", name: "Twilio", hint: "WhatsApp Business", idLabel: "Account SID", tokenLabel: "Auth Token" },
];

const SAMPLE = { student_name: "أحمد محمد", subject: "فيزياء", group: "الصف الثالث الثانوي - فيزياء", time: "٤:٣٠ م", date: "2026-10-13", month: "أكتوبر ٢٠٢٦" };

export default function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<SettingsForm & Record<string, unknown>>("/api/settings")
      .then((s) => {
        const f: SettingsForm = {
          centerName: s.centerName,
          provider: s.provider,
          autoSend: s.autoSend,
          apiUrl: (s.apiUrl as string) ?? "",
          instanceId: (s.instanceId as string) ?? "",
          apiToken: s.apiToken ?? "",
          senderNumber: (s.senderNumber as string) ?? "",
          attendanceTemplate: s.attendanceTemplate,
          unpaidNotice: s.unpaidNotice,
        };
        setForm(f);
        setSaved(JSON.stringify(f));
      })
      .catch((e) => toast(e.message, "error"));
  }, [toast]);

  const dirty = form ? JSON.stringify(form) !== saved : false;

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const s = await api<SettingsForm>("/api/settings", { method: "PUT", json: form });
      const next = { ...form, apiToken: s.apiToken ?? "" };
      setForm(next);
      setSaved(JSON.stringify(next));
      toast("تم حفظ الإعدادات");
      void syncEngine.refreshSnapshot(); // scanners use the template & auto-send flag offline
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40" />
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="card h-80 skeleton" />
          <div className="card h-80 skeleton" />
        </div>
      </div>
    );
  }

  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setForm((f) => f && { ...f, [k]: v });
  const provider = PROVIDERS.find((p) => p.id === form.provider)!;

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="بوابة واتساب وقوالب رسائل أولياء الأمور"
        actions={
          <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {dirty ? "حفظ التغييرات" : "محفوظ"}
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* WhatsApp gateway */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title flex items-center gap-2"><KeyRound className="h-4 w-4 text-ink-muted" /> بوابة واتساب</h2>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="مزود واتساب">
              {PROVIDERS.map((p) => {
                const on = form.provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("provider", p.id)}
                    className={clsx(
                      "relative rounded-lg border p-3 text-start transition",
                      on ? "border-ink bg-ink text-white shadow-xs" : "border-surface-line bg-white hover:border-surface-strong",
                    )}
                  >
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className={clsx("mt-0.5 text-2xs", on ? "text-white/60" : "text-ink-muted")}>{p.hint}</p>
                    {on && <Check className="absolute end-2.5 top-2.5 h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>

            {form.provider === "NONE" ? (
              <p className="rounded-lg bg-surface-subtle px-4 py-3 text-sm text-ink-soft">
                بعد كل مسح يظهر زر «إرسال واتساب» يفتح المحادثة برسالة جاهزة. لإرسال تلقائي بدون أي ضغطة، اختر مزوداً.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {form.provider === "GREEN_API" && (
                  <Field label="API URL" className="sm:col-span-2" htmlFor="s-url">
                    <input id="s-url" className="input font-mono" dir="ltr" placeholder="https://api.green-api.com" value={form.apiUrl} onChange={(e) => set("apiUrl", e.target.value)} />
                  </Field>
                )}
                <Field label={provider.idLabel} htmlFor="s-id">
                  <input id="s-id" className="input font-mono" dir="ltr" value={form.instanceId} onChange={(e) => set("instanceId", e.target.value)} autoComplete="off" />
                </Field>
                <Field label={provider.tokenLabel} hint="يُخزن على الخادم فقط ولا يظهر كاملاً" htmlFor="s-token">
                  <input
                    id="s-token"
                    className="input font-mono"
                    dir="ltr"
                    type="password"
                    value={form.apiToken}
                    onFocus={(e) => e.target.value.startsWith("••••") && set("apiToken", "")}
                    onChange={(e) => set("apiToken", e.target.value)}
                    placeholder="اتركه فارغاً للإبقاء على الحالي"
                    autoComplete="new-password"
                  />
                </Field>
                {form.provider === "TWILIO" && (
                  <Field label="رقم المرسل (From)" className="sm:col-span-2" htmlFor="s-from">
                    <input id="s-from" className="input" type="tel" value={form.senderNumber} onChange={(e) => set("senderNumber", e.target.value)} placeholder="+14155238886" />
                  </Field>
                )}
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-surface-line p-4 sm:col-span-2">
                  <span>
                    <span className="block text-sm font-semibold text-ink">إرسال تلقائي عند المسح</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">يُرسل إشعار الحضور فور المسح — وللمسح بدون إنترنت عند عودة الاتصال</span>
                  </span>
                  <Toggle checked={form.autoSend} onChange={(v) => set("autoSend", v)} />
                </label>
              </div>
            )}
          </div>
        </section>

        {/* Templates */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title flex items-center gap-2"><FileText className="h-4 w-4 text-ink-muted" /> قوالب الرسائل</h2>
          </div>
          <div className="space-y-6 p-5">
            <TemplateEditor label="رسالة تسجيل الحضور" value={form.attendanceTemplate} onChange={(v) => set("attendanceTemplate", v)} />
            <TemplateEditor label="تنبيه عدم السداد" value={form.unpaidNotice} onChange={(v) => set("unpaidNotice", v)} />
          </div>
        </section>
      </div>

      <Link href="/groups" className="card mt-5 flex items-center gap-4 p-5 transition hover:border-surface-strong">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-subtle text-ink-soft"><Layers className="h-5 w-5" /></span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-ink">المواد والمجموعات</span>
          <span className="block text-xs text-ink-muted">الاشتراكات الشهرية وعدد الحصص لكل مادة أصبحت في صفحة مستقلة</span>
        </span>
        <ArrowLeft className="h-4 w-4 text-ink-faint" />
      </Link>
    </>
  );
}

function TemplateEditor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (key: string) => {
    const el = ref.current;
    const token = `{${key}}`;
    if (!el) return onChange(value + token);
    const { selectionStart: s, selectionEnd: e } = el;
    onChange(value.slice(0, s) + token + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };
  return (
    <div>
      <label className="label">{label}</label>
      <textarea ref={ref} className="input h-auto min-h-24 py-2.5 leading-relaxed" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEMPLATE_PLACEHOLDERS.map((p) => (
          <button key={p.key} type="button" onClick={() => insert(p.key)} className="chip border-surface-line bg-white text-ink-soft hover:border-ink hover:text-ink">
            + {p.label}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-[#E7FFDB] p-3 text-sm leading-relaxed text-ink shadow-xs">
        <p className="mb-1 flex items-center gap-1 text-2xs font-semibold text-paid"><MessageCircle className="h-3 w-3" /> معاينة الرسالة</p>
        {renderTemplate(value, SAMPLE)}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-paid" : "bg-surface-strong")}
    >
      <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "start-[1.375rem]" : "start-0.5")} />
    </button>
  );
}
