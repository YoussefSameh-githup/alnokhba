"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Save, Loader2, KeyRound, FileText, Layers, Plus, Pencil, Archive } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/AppShell";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api, useGroups, type Group } from "@/lib/api";
import { renderTemplate, TEMPLATE_PLACEHOLDERS } from "@/lib/template";

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
  { id: "NONE", name: "يدوي (wa.me)", hint: "يفتح واتساب برسالة جاهزة — بدون API", idLabel: "", tokenLabel: "" },
  { id: "GREEN_API", name: "Green API", hint: "green-api.com", idLabel: "idInstance", tokenLabel: "apiTokenInstance" },
  { id: "ULTRAMSG", name: "UltraMsg", hint: "ultramsg.com", idLabel: "Instance ID", tokenLabel: "Token" },
  { id: "TWILIO", name: "Twilio", hint: "WhatsApp Business API", idLabel: "Account SID", tokenLabel: "Auth Token" },
];

const SAMPLE = { student_name: "أحمد محمد", subject: "فيزياء", group: "الصف الثالث الثانوي - فيزياء", time: "٤:٣٠ م", date: "2026-10-13", month: "أكتوبر ٢٠٢٦" };

export default function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<SettingsForm & Record<string, unknown>>("/api/settings")
      .then((s) =>
        setForm({
          centerName: s.centerName,
          provider: s.provider,
          autoSend: s.autoSend,
          apiUrl: (s.apiUrl as string) ?? "",
          instanceId: (s.instanceId as string) ?? "",
          apiToken: s.apiToken ?? "",
          senderNumber: (s.senderNumber as string) ?? "",
          attendanceTemplate: s.attendanceTemplate,
          unpaidNotice: s.unpaidNotice,
        }),
      )
      .catch((e) => toast(e.message, "error"));
  }, [toast]);

  if (!form) return <div className="grid place-items-center py-32"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>;

  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setForm((f) => f && { ...f, [k]: v });
  const provider = PROVIDERS.find((p) => p.id === form.provider)!;

  async function save() {
    setSaving(true);
    try {
      const s = await api<SettingsForm>("/api/settings", { method: "PUT", json: form });
      setForm((f) => f && { ...f, apiToken: s.apiToken ?? "" });
      toast("تم حفظ الإعدادات");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="الإعدادات"
        subtitle="بوابة واتساب، قوالب الرسائل، والمجموعات"
        actions={
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ الإعدادات
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* WhatsApp gateway */}
        <section className="card p-5">
          <SectionTitle icon={KeyRound} title="بوابة واتساب" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set("provider", p.id)}
                className={clsx(
                  "rounded-xl border-2 p-3 text-start transition",
                  form.provider === p.id ? "border-brand bg-brand-50" : "border-surface-line hover:bg-surface",
                )}
              >
                <p className="text-sm font-black">{p.name}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{p.hint}</p>
              </button>
            ))}
          </div>

          {form.provider !== "NONE" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {form.provider === "GREEN_API" && (
                <div className="sm:col-span-2">
                  <label className="label">API URL</label>
                  <input className="input font-mono" dir="ltr" placeholder="https://api.green-api.com" value={form.apiUrl} onChange={(e) => set("apiUrl", e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">{provider.idLabel}</label>
                <input className="input font-mono" dir="ltr" value={form.instanceId} onChange={(e) => set("instanceId", e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label className="label">{provider.tokenLabel}</label>
                <input
                  className="input font-mono"
                  dir="ltr"
                  type="password"
                  value={form.apiToken}
                  onFocus={(e) => e.target.value.startsWith("••••") && set("apiToken", "")}
                  onChange={(e) => set("apiToken", e.target.value)}
                  placeholder="اتركه فارغاً للإبقاء على الحالي"
                  autoComplete="new-password"
                />
              </div>
              {form.provider === "TWILIO" && (
                <div className="sm:col-span-2">
                  <label className="label">رقم المرسل (From)</label>
                  <input className="input" type="tel" value={form.senderNumber} onChange={(e) => set("senderNumber", e.target.value)} placeholder="+14155238886" />
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-surface p-4 sm:col-span-2">
                <span>
                  <span className="block font-bold">إرسال تلقائي عند المسح</span>
                  <span className="block text-xs text-ink-muted">يُرسل إشعار الحضور لولي الأمر فور مسح الكارت دون الضغط على أي زر</span>
                </span>
                <Toggle checked={form.autoSend} onChange={(v) => set("autoSend", v)} />
              </label>
            </div>
          )}
          <p className="mt-4 text-xs text-ink-muted">يتم تخزين رمز الـ API على الخادم فقط ولا يظهر كاملاً في المتصفح.</p>
        </section>

        {/* Templates */}
        <section className="card p-5">
          <SectionTitle icon={FileText} title="قوالب الرسائل" />
          <TemplateEditor label="رسالة تسجيل الحضور" value={form.attendanceTemplate} onChange={(v) => set("attendanceTemplate", v)} />
          <div className="mt-5">
            <TemplateEditor label="تنبيه عدم السداد" value={form.unpaidNotice} onChange={(v) => set("unpaidNotice", v)} />
          </div>
        </section>
      </div>

      <GroupsSection />
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
      <textarea ref={ref} className="input min-h-24 leading-relaxed" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEMPLATE_PLACEHOLDERS.map((p) => (
          <button key={p.key} type="button" onClick={() => insert(p.key)} className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-ink-soft hover:bg-brand-50 hover:text-brand">
            + {p.label}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-2xl rounded-ss-sm bg-[#DCF8C6] p-3 text-sm leading-relaxed text-ink shadow-sm">
        <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-paid"><MessageCircle className="h-3.5 w-3.5" /> معاينة</p>
        {renderTemplate(value, SAMPLE)}
      </div>
    </div>
  );
}

function GroupsSection() {
  const toast = useToast();
  const { groups, reload } = useGroups(true);
  const [editing, setEditing] = useState<Partial<Group> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const { id, _count, ...body } = editing as Group;
      void _count;
      await api(id ? `/api/groups/${id}` : "/api/groups", { method: id ? "PATCH" : "POST", json: body });
      toast("تم حفظ المجموعة");
      setEditing(null);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function archive(g: Group) {
    if (!confirm(`أرشفة مجموعة "${g.name}"؟`)) return;
    await api(`/api/groups/${g.id}`, { method: "DELETE" }).then(reload).catch((e) => toast(e.message, "error"));
  }

  return (
    <section className="card mt-5 p-5">
      <div className="flex items-center justify-between">
        <SectionTitle icon={Layers} title="المجموعات والمواد" />
        <button className="btn-ghost -mt-4" onClick={() => setEditing({ monthlyFee: 0, sessionsPerMonth: 4 })}>
          <Plus className="h-4 w-4" /> مجموعة جديدة
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="border-b border-surface-line">
            <tr>
              <th className="th">المجموعة</th><th className="th">الصف</th><th className="th">المادة</th>
              <th className="th">الاشتراك</th><th className="th">حصص/شهر</th><th className="th">المشتركين</th><th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-line">
            {groups.map((g) => (
              <tr key={g.id} className={clsx(!g.active && "opacity-50")}>
                <td className="td font-bold">{g.name}</td>
                <td className="td">{g.grade}</td>
                <td className="td">{g.subject}</td>
                <td className="td">{g.monthlyFee.toLocaleString("ar-EG")} ج.م</td>
                <td className="td">{g.sessionsPerMonth}</td>
                <td className="td">{g._count?.enrollments ?? 0}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <button className="rounded-lg p-2 text-ink-muted hover:bg-surface" onClick={() => setEditing(g)} aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                    {g.active && <button className="rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-brand" onClick={() => archive(g)} aria-label="أرشفة"><Archive className="h-4 w-4" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.id ? "تعديل المجموعة" : "مجموعة جديدة"}
        icon={<Layers className="h-5 w-5" />}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>إلغاء</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ</button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["grade", "الصف", "الصف الثالث الثانوي"],
              ["subject", "المادة", "فيزياء"],
            ] as const).map(([k, l, ph]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input
                  className="input"
                  placeholder={ph}
                  value={editing[k] ?? ""}
                  onChange={(e) => {
                    const next = { ...editing, [k]: e.target.value };
                    // Suggest the canonical "Grade - Subject" name while the admin hasn't customized it
                    const auto = `${editing.grade ?? ""} - ${editing.subject ?? ""}`;
                    if (!editing.name || editing.name === auto) next.name = `${next.grade ?? ""} - ${next.subject ?? ""}`;
                    setEditing(next);
                  }}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="label">اسم المجموعة (يظهر في الماسح)</label>
              <input className="input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="label">الاشتراك الشهري (ج.م)</label>
              <input className="input" type="number" min={0} value={editing.monthlyFee ?? 0} onChange={(e) => setEditing({ ...editing, monthlyFee: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">عدد الحصص في الشهر</label>
              <input className="input" type="number" min={1} max={31} value={editing.sessionsPerMonth ?? 4} onChange={(e) => setEditing({ ...editing, sessionsPerMonth: Number(e.target.value) })} />
            </div>
            {editing.id && !editing.active && (
              <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2">
                <input type="checkbox" className="accent-brand" checked={Boolean(editing.active)} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                إعادة تفعيل المجموعة
              </label>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-lg font-black">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand"><Icon className="h-4 w-4" /></span>
      {title}
    </h2>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-paid" : "bg-surface-line")}
    >
      <span className={clsx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "start-6" : "start-1")} />
    </button>
  );
}
