import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { loginRequestSchema } from '@radian/contracts';
import { ApiError } from '../../../shared/api/httpClient';
import { validate, type FieldErrors } from '../../../shared/forms/validate';
import { TextField } from '../../../shared/ui/TextField';
import { useLogin } from '../hooks/useSession';
import { safeRedirect } from './safeRedirect';
import styles from './AuthLayout.module.css';

export function LoginPage() {
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'), '/cuenta');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validate(loginRequestSchema, values);
    setErrors(result.errors ?? {});
    if (!result.data) return;
    login.mutate(result.data, { onSuccess: () => void navigate(redirect, { replace: true }) });
  }

  const apiError = login.error instanceof ApiError ? login.error.message : login.error ? 'No se pudo iniciar sesión' : null;

  return (
    <section className={styles.page} aria-labelledby="login-title">
      <h1 id="login-title" className={styles.title}>
        Ingresar
      </h1>
      <p className={styles.lead}>Accedé a tus pedidos y a tu carrito guardado.</p>
      {apiError && (
        <div role="alert" className={styles.alert}>
          {apiError}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        <TextField label="Email" type="email" autoComplete="email" value={values.email} error={errors['email']} onChange={(email) => setValues((v) => ({ ...v, email }))} />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={values.password}
          error={errors['password']}
          onChange={(password) => setValues((v) => ({ ...v, password }))}
        />
        <button type="submit" className="btn btn--block" disabled={login.isPending}>
          {login.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className={styles.alt}>
        ¿No tenés cuenta? <Link to={`/cuenta/registro${params.get('redirect') ? `?redirect=${encodeURIComponent(redirect)}` : ''}`}>Creá una</Link>
      </p>
    </section>
  );
}
