import { useState, type FormEvent } from "react";

const CONTACT_EMAIL = "kumardevanshu3001@gmail.com";
const APP_NAME = "JobSeen";
const FROM_NAME = `Arigato Labs · ${APP_NAME}`;

function buildPlainMessage(name: string, email: string, subject: string, message: string): string {
  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "  ARIGATO LABS · CONTACT",
    `  Product: ${APP_NAME}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `From:     ${name}`,
    `Email:    ${email}`,
    `Subject:  ${subject}`,
    "",
    "Message",
    "-------",
    message,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `Sent from ${APP_NAME} contact form`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}

function buildHtmlMessage(name: string, email: string, subject: string, message: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `
<div style="font-family:ui-monospace,Menlo,Consolas,monospace;max-width:560px;color:#201d1d;line-height:1.5">
  <div style="border-bottom:1px solid #d0cccc;padding-bottom:12px;margin-bottom:16px">
    <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8585">Arigato Labs · Contact</div>
    <div style="font-size:18px;font-weight:700;margin-top:4px">Product: ${esc(APP_NAME)}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
    <tr><td style="padding:4px 0;color:#8a8585;width:88px">From</td><td style="padding:4px 0">${esc(name)}</td></tr>
    <tr><td style="padding:4px 0;color:#8a8585">Email</td><td style="padding:4px 0"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
    <tr><td style="padding:4px 0;color:#8a8585">Subject</td><td style="padding:4px 0">${esc(subject)}</td></tr>
  </table>
  <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#8a8585;margin-bottom:8px">Message</div>
  <div style="background:#f8f7f7;border:1px solid #d0cccc;border-radius:4px;padding:12px 14px;white-space:pre-wrap;font-size:13px;color:#424245">${esc(message)}</div>
  <p style="margin-top:18px;font-size:11px;color:#8a8585">Sent from ${esc(APP_NAME)} contact form</p>
</div>`.trim();
}

type Status = "idle" | "sending" | "ok" | "error";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const key = import.meta.env.PUBLIC_WEB3FORMS_KEY as string | undefined;
    if (!key || key === "your_access_key_here") {
      setStatus("error");
      setErrorText(
        `Contact form is not configured yet. Email ${CONTACT_EMAIL} directly, or set PUBLIC_WEB3FORMS_KEY.`
      );
      return;
    }

    setStatus("sending");
    setErrorText("");

    const plain = buildPlainMessage(name.trim(), email.trim(), subject.trim(), message.trim());
    const html = buildHtmlMessage(name.trim(), email.trim(), subject.trim(), message.trim());

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: key,
          from_name: FROM_NAME,
          subject: `[${APP_NAME}] ${subject.trim()}`,
          name: name.trim(),
          email: email.trim(),
          replyto: email.trim(),
          message: plain,
          html,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || data.success === false) {
        throw new Error(data.message || "Send failed");
      }
      setStatus("ok");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setStatus("error");
      setErrorText("Could not send the message. Please try again, or email us directly.");
    }
  }

  if (status === "ok") {
    return (
      <div className="legal-contact-ok" role="status">
        <p>Message sent — we’ll get back to you by email.</p>
        <button type="button" className="btn btn-ghost" onClick={() => setStatus("idle")}>
          Send another
        </button>
      </div>
    );
  }

  return (
    <form className="legal-contact-form" onSubmit={onSubmit} noValidate>
      <label className="form-label">
        Name
        <input
          className="form-input"
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="form-label">
        Email
        <input
          className="form-input"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="form-label">
        Subject
        <input
          className="form-input"
          name="subject"
          required
          maxLength={160}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <label className="form-label">
        Message
        <textarea
          className="form-textarea"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      {status === "error" && (
        <p className="legal-contact-error" role="alert">
          {errorText}
        </p>
      )}

      <div className="legal-contact-actions">
        <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send message"}
        </button>
        <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>
          Or email directly
        </a>
      </div>
    </form>
  );
}
