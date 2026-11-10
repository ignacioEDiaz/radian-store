import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { registerRequestSchema } from '@radian/contracts';
import { ApiError } from '../../../shared/api/httpClient';
import { validate, type FieldErrors } from '../../../shared/forms/validate';
import { TextField } from '../../../shared/ui/TextField';
import { useRegister } from '../hooks/useSession';
import { safeRedirect } from './safeRedirect';
import styles from './AuthLayout.module.css';

export function RegisterPage() {
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const register = useRegister();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'), '/cuenta');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validate(registerRequestSchema, values);
    setErrors(result.errors ?? {});
    if (!result.data) return;
    register.mutate(result.data, {
      onSuccess: () => void navigate(redirect, { replace: true }),
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
        else if (err instanceof ApiError && err.status === 400) setErrors(err.fieldErrors);
      },
    });
  }

  const formError =
    register.error && !(register.error instanceof ApiError && (register.error.code === 'EMAIL_TAKEN' || register.error.status === 400))
      ? register.error.message
      : null;

  const set = (field: keyof typeof values) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  return (
    <section className={styles.page} aria-labelledby="register-title">
      <h1 id="register-title" className={styles.title}>
        Crear cuenta
      </h1>
      <p className={styles.lead}>Guardá tu carrito y seguí tus pedidos.</p>
      {formError && (
        <div role="alert" className={styles.alert}>
          {formError}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        <TextField label="Nombre" autoComplete="name" value={values.name} error={errors['name']} onChange={set('name')} />
        <TextField label="Email" type="email" autoComplete="email" value={values.email} error={errors['email']} onChange={set('email')} />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={values.password}
          error={errors['password']}
          onChange={set('password')}
          placeholder="Mínimo 10 caracteres"
        />
        <button type="submit" className="btn btn--block" disabled={register.isPending}>
          {register.isPending ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
      <p className={styles.alt}>
        ¿Ya tenés cuenta? <Link to="/cuenta/ingresar">Ingresá</Link>
      </p>
    </section>
  );
}
