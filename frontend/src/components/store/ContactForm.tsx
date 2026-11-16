'use client';

import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { getDictionary, type Locale } from '@/lib/i18n';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type State = 'idle' | 'loading' | 'success' | 'error';

/** Footer "Send us a message": email + message, delivered to the dashboard's Messages tab */
export function ContactForm({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).footer;
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<State>('idle');
  const [status, setStatus] = useState('');

  const fail = (text: string) => {
    setState('error');
    setStatus(text);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanMessage = message.trim();
    if (!EMAIL.test(cleanEmail)) return fail(t.invalidEmail);
    if (cleanMessage.length < 10) return fail(t.shortMessage);

    setState('loading');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, message: cleanMessage, locale }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setState('success');
        setStatus(t.sent);
        setEmail('');
        setMessage('');
      } else if (res.status === 429) fail(t.tooMany);
      else if (res.status === 400 && /domain|real email/i.test(json.error || '')) fail(t.domain);
      else if (res.status === 400) fail(t.invalidEmail);
      else fail(t.error);
    } catch {
      fail(t.error);
    }
  };

  const reset = () => state === 'error' && setState('idle');

  return (
    <form id="contact" className="contact-form" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="contact-email">
        {t.emailPlaceholder}
      </label>
      <input
        id="contact-email"
        className="contact-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        maxLength={254}
        placeholder={t.emailPlaceholder}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          reset();
        }}
        required
      />
      <label className="sr-only" htmlFor="contact-message">
        {t.messagePlaceholder}
      </label>
      <div className="contact-message-row">
        <textarea
          id="contact-message"
          className="contact-input contact-textarea"
          rows={3}
          maxLength={2000}
          placeholder={t.messagePlaceholder}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            reset();
          }}
          dir="auto"
          required
        />
        <button
          type="submit"
          className="contact-submit"
          disabled={state === 'loading'}
          aria-label={state === 'loading' ? t.sending : t.send}
        >
          {state === 'loading' ? (
            <Loader2 className="track-spin" aria-hidden="true" />
          ) : state === 'success' ? (
            <Check aria-hidden="true" />
          ) : (
            <ArrowRight className="flip-rtl" aria-hidden="true" />
          )}
        </button>
      </div>
      <p className="newsletter-status" data-state={state} role={state === 'error' ? 'alert' : 'status'}>
        {state === 'success' || state === 'error' ? status : ''}
      </p>
    </form>
  );
}
