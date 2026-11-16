'use client';

import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { getDictionary, type Locale } from '@/lib/i18n';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type State = 'idle' | 'loading' | 'success' | 'error';

/** "Subscribe now": validated on the client, then checked again (format + mail domain) by the API */
export function NewsletterForm({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).newsletter;
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setState('error');
      setMessage(t.invalid);
      return;
    }
    setState('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, locale }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setState('success');
        setMessage(t.success);
        setEmail('');
        return;
      }
      setState('error');
      if (res.status === 429) setMessage(t.tooMany);
      else if (res.status === 400 && /domain|real email/i.test(json.error || '')) setMessage(t.domain);
      else if (res.status === 400) setMessage(t.invalid);
      else setMessage(t.error);
    } catch {
      setState('error');
      setMessage(t.error);
    }
  };

  return (
    <form className="newsletter" onSubmit={submit} noValidate data-reveal>
      <label htmlFor="newsletter-email" className="newsletter-title">
        {t.title}
      </label>
      <div className="newsletter-field-wrap">
        <div className="newsletter-field" data-state={state}>
          <input
            id="newsletter-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state === 'error') setState('idle');
            }}
            placeholder={t.placeholder}
            aria-invalid={state === 'error'}
            aria-describedby="newsletter-status"
            maxLength={254}
            required
          />
          <button
            type="submit"
            className="newsletter-submit"
            disabled={state === 'loading'}
            aria-label={t.submit}
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
        <p
          id="newsletter-status"
          className="newsletter-status"
          data-state={state}
          role={state === 'error' ? 'alert' : 'status'}
        >
          {state === 'success' || state === 'error' ? message : ''}
        </p>
      </div>
    </form>
  );
}
