import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDancers, useCreateDancer } from '../hooks/useDancers.js';
import { useCreateTournament } from '../hooks/useTournament.js';
import { ApiClientError } from '../apiClient/client.js';
import { PosterHeader } from '../components/PosterHeader.js';
import { Field, TextInput } from '../components/Input.js';
import { Button } from '../components/Button.js';
import type { Dancer } from '../apiClient/types.js';
import styles from './NewGame.module.css';

const MIN_DANCERS = 3;
const MAX_DANCERS = 12;

export function NewGame() {
  const { data: dancers } = useDancers();
  const createDancer = useCreateDancer();
  const createTournament = useCreateTournament();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Dancer[]>([]);
  const [name, setName] = useState('Festember Battle');
  const [targetScore, setTargetScore] = useState(7);
  const [maxMatches, setMaxMatches] = useState(27);
  const [quickName, setQuickName] = useState('');
  const [quickCrew, setQuickCrew] = useState('');
  const [error, setError] = useState<string | null>(null);

  function addSelected(d: Dancer) {
    if (selected.some((s) => s.id === d.id) || selected.length >= MAX_DANCERS) return;
    setSelected((prev) => [...prev, d]);
  }

  function removeSelected(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  function move(index: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function handleQuickAdd() {
    if (!quickName.trim()) return;
    const dancer = await createDancer.mutateAsync({ name: quickName.trim(), crew: quickCrew.trim() || null });
    setQuickName('');
    setQuickCrew('');
    addSelected(dancer);
  }

  async function handleStart() {
    setError(null);
    if (selected.length < MIN_DANCERS) {
      setError(`Pick at least ${MIN_DANCERS} dancers.`);
      return;
    }
    try {
      const state = await createTournament.mutateAsync({
        name,
        targetScore,
        maxMatches,
        participants: selected.map((s) => ({ dancerId: s.id })),
      });
      navigate(`/game/${state.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'ACTIVE_TOURNAMENT_EXISTS') {
        setError('A tournament is already in progress — finish, abandon, or resume it from Scoreboard first.');
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Could not start the tournament. Check your connection.');
      }
    }
  }

  const available = (dancers ?? []).filter((d) => !selected.some((s) => s.id === d.id));

  return (
    <>
      <PosterHeader subtitle="Set up the next battle" />
      <div className={styles.layout}>
        <div className={styles.panel}>
          <h2 className={styles.panelHeading}>1. Pick the roster</h2>
          <div className={styles.rosterGrid}>
            {available.map((d) => (
              <button
                key={d.id}
                type="button"
                className={styles.rosterItem}
                onClick={() => addSelected(d)}
                disabled={selected.length >= MAX_DANCERS}
              >
                <span>{d.name}</span>
                {d.crew ? <span className={styles.crewTag}>{d.crew}</span> : null}
              </button>
            ))}
            {available.length === 0 ? <p className={styles.hint}>Everyone in the roster is already picked.</p> : null}
          </div>
          <div className={styles.inlineAdd}>
            <TextInput placeholder="New dancer name" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
            <TextInput placeholder="Crew (optional)" value={quickCrew} onChange={(e) => setQuickCrew(e.target.value)} />
            <Button type="button" onClick={handleQuickAdd} disabled={!quickName.trim()}>
              Add
            </Button>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelHeading}>2. Set the order &amp; rules</h2>

          <Field label="Tournament name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div className={styles.selectedList}>
            {selected.map((s, i) => (
              <div key={s.id} className={styles.selectedItem}>
                <span className={styles.seedNumber}>{i + 1}</span>
                <span className={styles.selectedName}>{s.name}</span>
                <button type="button" className={styles.moveBtn} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className={styles.moveBtn} onClick={() => move(i, 1)} aria-label="Move down">
                  ↓
                </button>
                <button type="button" className={styles.removeBtn} onClick={() => removeSelected(s.id)} aria-label="Remove">
                  ×
                </button>
              </div>
            ))}
            {selected.length === 0 ? <p className={styles.hint}>Pick dancers from the roster on the left.</p> : null}
          </div>
          <p className={styles.hint}>
            #1 is the opening king, #2 the first challenger. {selected.length}/{MAX_DANCERS} selected (minimum{' '}
            {MIN_DANCERS}).
          </p>

          <div className={styles.settingsRow}>
            <Field label="First to (target score)">
              <TextInput
                type="number"
                min={1}
                value={targetScore}
                onChange={(e) => setTargetScore(Number(e.target.value))}
              />
            </Field>
            <Field label="Max bouts (regulation)">
              <TextInput
                type="number"
                min={1}
                value={maxMatches}
                onChange={(e) => setMaxMatches(Number(e.target.value))}
              />
            </Field>
          </div>
          <p className={styles.hint}>
            If the cap is reached with nobody at the target, the app stops and asks you to tap the champion — it never
            guesses a tiebreak for you.
          </p>

          <Button type="button" onClick={handleStart} disabled={createTournament.isPending} style={{ width: '100%' }}>
            {createTournament.isPending ? 'Starting…' : 'Start Tournament'}
          </Button>
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </div>
    </>
  );
}
