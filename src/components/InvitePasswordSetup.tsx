import { KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { completePasswordSetup } from '../lib/api';
import { supabase } from '../lib/supabase';

export function InvitePasswordSetup({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const prepareInvitation = async () => {
      if (!supabase) {
        if (mounted) {
          setError('Supabase is not configured.');
          setChecking(false);
        }
        return;
      }

      try {
        const search = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

        const callbackError =
          hash.get('error_description') ||
          search.get('error_description') ||
          hash.get('error') ||
          search.get('error');

        if (callbackError) {
          throw new Error(decodeURIComponent(callbackError.replace(/\+/g, ' ')));
        }

        let { data: sessionData } = await supabase.auth.getSession();
        let currentSession = sessionData.session;

        if (!currentSession) {
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
            currentSession = data.session;
          }
        }

        if (!currentSession) {
          const code = search.get('code');
          if (code) {
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
            currentSession = data.session;
          }
        }

        if (!currentSession) {
          // Supabase may finish URL-session detection just after the first getSession call.
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          const { data } = await supabase.auth.getSession();
          currentSession = data.session;
        }

        if (!currentSession) {
          throw new Error(
            'This invitation link has expired or was already used. Ask an administrator to send a new invitation.',
          );
        }

        if (mounted) {
          setSessionReady(true);
          setError('');
        }
      } catch (err) {
        if (mounted) {
          setSessionReady(false);
          setError(err instanceof Error ? err.message : 'Unable to verify this invitation.');
        }
      } finally {
        if (mounted) setChecking(false);
      }
    };

    void prepareInvitation();

    const { data: subscription } = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted || !nextSession) return;
      setSessionReady(true);
      setError('');
      setChecking(false);
    }) || { data: { subscription: null } };

    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!sessionReady) {
      setError('Your invitation session is not ready. Please reopen the invitation email.');
      return;
    }
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

      window.history.replaceState({}, document.title, '/');
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
        <h1>{checking ? 'Verifying Invitation…' : 'Create Your Password'}</h1>
        <p>
          {checking
            ? 'Please wait while we securely verify your Jai Dholera team invitation.'
            : sessionReady
              ? 'Invitation verified. Create a password to finish setting up your account.'
              : 'We could not open this invitation.'}
        </p>

        {error && <div className="alert">{error}</div>}

        {!checking && sessionReady && (
          <>
            <label>
              New Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                autoFocus
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
          </>
        )}
      </form>
    </div>
  );
}
