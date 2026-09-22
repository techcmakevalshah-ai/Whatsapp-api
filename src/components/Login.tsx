import { useState, type FormEvent } from 'react';
import { LockKeyhole, MessageCircleMore } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return setError('Supabase frontend environment variables are missing.');
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setLoading(false);
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-icon"><MessageCircleMore size={28} /></div>
        <h1>WhatsApp Campaign</h1>
        <p>Staff login</p>
        {error && <div className="alert">{error}</div>}
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <button className="send-btn" disabled={loading}><LockKeyhole size={17} />{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
