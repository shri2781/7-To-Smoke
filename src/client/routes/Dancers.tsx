import { useState } from 'react';
import { useDancers, useCreateDancer, useDeleteDancer } from '../hooks/useDancers.js';
import { ApiClientError } from '../api/client.js';
import { PageHeader } from '../components/PageHeader.js';
import { TextInput } from '../components/Input.js';
import { Button } from '../components/Button.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import styles from './Dancers.module.css';

export function Dancers() {
  const [includeRetired, setIncludeRetired] = useState(false);
  const { data: dancers } = useDancers(includeRetired);
  const createDancer = useCreateDancer();
  const deleteDancer = useDeleteDancer();

  const [name, setName] = useState('');
  const [crew, setCrew] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  async function handleAdd() {
    if (!name.trim()) return;
    await createDancer.mutateAsync({ name: name.trim(), crew: crew.trim() || null });
    setName('');
    setCrew('');
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteDancer.mutateAsync(id);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'DANCER_IN_USE') {
        setError('This dancer is in the active tournament and cannot be removed right now.');
      } else {
        setError('Could not remove this dancer.');
      }
    }
    setToDelete(null);
  }

  return (
    <>
      <PageHeader eyebrow="Roster" title="Dancers" />
      <div className={styles.wrap}>
        <div className={styles.addRow}>
          <TextInput placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput placeholder="Crew (optional)" value={crew} onChange={(e) => setCrew(e.target.value)} />
          <Button type="button" onClick={handleAdd} disabled={!name.trim()} style={{ marginTop: 0 }}>
            Add
          </Button>
        </div>

        <label className={styles.toggle}>
          <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} />
          Show retired dancers
        </label>

        {error ? <p style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</p> : null}

        <div className={styles.list}>
          {(dancers ?? []).map((d) => (
            <div key={d.id} className={`${styles.item} ${d.deletedAt ? styles.itemRetired : ''}`}>
              <span className={styles.name}>{d.name}</span>
              {d.crew ? <span className={styles.crew}>{d.crew}</span> : null}
              {!d.deletedAt ? (
                <button className={styles.iconBtn} onClick={() => setToDelete({ id: d.id, name: d.name })}>
                  Retire
                </button>
              ) : (
                <span className={styles.crew}>Retired</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {toDelete ? (
        <ConfirmDialog
          title={`Retire ${toDelete.name}?`}
          body="They'll be hidden from new tournaments but every past recap and the leaderboard keep their name exactly as it was."
          confirmLabel="Retire"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => handleDelete(toDelete.id)}
        />
      ) : null}
    </>
  );
}
