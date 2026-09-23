import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { completePasswordSetup } from '../lib/api';
import { supabase } from '../lib/supabase';

export function InvitePasswordSetup({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      await completePasswordSetup();

      window.history.replaceState({}, document.title, window.location.pathname);
      onComplete();
      window.location.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card invite-password-card" onSubmit={submit}>
        <div className="login-icon"><ShieldCheck size={28}/></div>
        <h1>Set Your Password</h1>
        <p>Your account invitation is verified. Create your password to finish setup.</p>

        {error && <div className="alert">{error}</div>}

        <label>
          New Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>

        <label>
          Confirm Password
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </label>

        <button className="send-btn" disabled={saving}>
          <KeyRound size={17}/>
          {saving ? 'Saving…' : 'Set Password & Continue'}
        </button>
      </form>
    </div>
  );
}
