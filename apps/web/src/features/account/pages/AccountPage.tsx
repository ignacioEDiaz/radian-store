import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { updateProfileRequestSchema, type Profile } from '@radian/contracts';
import { ApiError } from '../../../shared/api/httpClient';
import { validate, type FieldErrors } from '../../../shared/forms/validate';
import { TextField } from '../../../shared/ui/TextField';
import { useSession, useUpdateProfile } from '../hooks/useSession';
import { AddressFields, emptyAddress, isBlankAddress, toAddressInput, type AddressValues } from '../components/AddressFields';
import styles from './AccountPage.module.css';

export function AccountPage() {
  const { profile } = useSession();
  if (!profile) return <p className="container" aria-busy="true">Cargando…</p>;

  return (
    <section className={styles.page} aria-labelledby="account-title">
      <header className={styles.head}>
        <h1 id="account-title">Mi cuenta</h1>
        <p className={styles.email}>{profile.email}</p>
        <nav aria-label="Secciones de la cuenta" className={styles.tabs}>
          <Link to="/cuenta">Perfil</Link>
          <Link to="/cuenta/pedidos">Mis pedidos</Link>
        </nav>
      </header>
      <ProfileForm key={profile.id} profile={profile} />
    </section>
  );
}

const fromProfile = (p: Profile): AddressValues =>
  p.defaultAddress ? { ...emptyAddress, ...p.defaultAddress, line2: p.defaultAddress.line2 ?? '' } : emptyAddress;

function ProfileForm({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const [name, setName] = useState(profile.name);
  const [address, setAddress] = useState<AddressValues>(() => fromProfile(profile));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const payload = { name, defaultAddress: isBlankAddress(address) ? null : toAddressInput(address) };
    const result = validate(updateProfileRequestSchema, payload);
    setErrors(result.errors ?? {});
    if (!result.data) return;
    update.mutate(result.data, {
      onSuccess: () => setSaved(true),
      onError: (err) => err instanceof ApiError && err.status === 400 && setErrors(err.fieldErrors),
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className={styles.form}>
      <h2>Datos personales</h2>
      <TextField label="Nombre" autoComplete="name" value={name} error={errors['name']} onChange={setName} />
      <h2>Dirección de envío predeterminada</h2>
      <AddressFields values={address} onChange={setAddress} errors={errors} prefix="defaultAddress" />
      <button type="submit" className="btn" disabled={update.isPending}>
        {update.isPending ? 'Guardando…' : 'Guardar cambios'}
      </button>
      {saved && (
        <p role="status" className={styles.saved}>
          Cambios guardados.
        </p>
      )}
      {update.error && !(update.error instanceof ApiError && update.error.status === 400) && (
        <p role="alert" className="field-error">
          {update.error.message}
        </p>
      )}
    </form>
  );
}
