import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { ApiClientError } from '../apiClient/client.js';
import { Field, TextInput } from '../components/Input.js';
import { Button } from '../components/Button.js';
import styles from './Login.module.css';

export function Login() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Fires the health check on mount to warm a suspended Neon instance
  // while the operator is typing — by the time they submit, the first
  // real query should no longer pay the cold-start latency.
  useEffect(() => {
    fetch('/healthz').catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync(passcode);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setError('Too many attempts. Wait a few minutes and try again.');
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Could not reach the server. Check your connection.');
      }
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.title}>
          7 <span>to</span> Smoke
        </p>
        <p className={styles.subtitle}>Enter the admin passcode</p>
        <form onSubmit={handleSubmit}>
          <Field label="Passcode">
            <TextInput
              type="password"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" disabled={login.isPending || !passcode} style={{ width: '100%' }}>
            {login.isPending ? 'Checking…' : 'Enter'}
          </Button>
        </form>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}
