import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Link2, Pencil, Plus, Trash2, Users, XCircle } from 'lucide-react'
import { Badge, Button, Empty, Field, Modal, cx } from '../../components/ui'
import { EXAMPLE_TEAM } from '../../lib/pokemon/examples'
import { emptyTally, matchesOf, played, recordText, tally, winRate } from '../../lib/pokemon/stats'
import { STATS, STAT_LABELS, finalStats, formatTeam, natureLabel, natureOf, parseTeam, pokepasteId, type ParsedTeam, type SpreadSystem, type TeamMon } from '../../lib/pokemon/team'
import type { VgcTeam } from '../../lib/types'
import { useData } from '../../state/data'
import { useToast } from '../../state/toast'
import { useChampions, type Champions } from './data'
import { SpeciesSprite, fmtRate } from './parts'

const TYPE_COLORS: Record<string, string> = {
  Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Electric: '#fac000', Grass: '#3fa129', Ice: '#3dcef3', Fighting: '#ff8000', Poison: '#9141cb', Ground: '#915121',
  Flying: '#81b9ef', Psychic: '#ef4179', Bug: '#91a119', Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1', Dark: '#624d4e', Steel: '#60a1b8', Fairy: '#ef70ef',
}
const TYPE_ES: Record<string, string> = {
  Normal: 'Normal', Fire: 'Fuego', Water: 'Agua', Electric: 'Eléctrico', Grass: 'Planta', Ice: 'Hielo', Fighting: 'Lucha', Poison: 'Veneno', Ground: 'Tierra', Flying: 'Volador',
  Psychic: 'Psíquico', Bug: 'Bicho', Rock: 'Roca', Ghost: 'Fantasma', Dragon: 'Dragón', Dark: 'Siniestro', Steel: 'Acero', Fairy: 'Hada',
}

export function Teams({ initialId = null }: { initialId?: string | null }) {
  const { data, create } = useData()
  const champions = useChampions()
  const [openId, setOpenId] = useState<string | null>(initialId)
  const [editing, setEditing] = useState<VgcTeam | 'new' | null>(null)
  const open = data.vgc_teams.find((t) => t.id === openId)
  const records = useMemo(() => {
    const ms = matchesOf(data.tournaments, data.tournament_rounds)
    return new Map(data.vgc_teams.map((d) => [d.id, tally(ms.filter((m) => m.t.team_id === d.id))]))
  }, [data.tournaments, data.tournament_rounds, data.vgc_teams])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Equipos de 6 en formato Showdown o Pokepaste.</p>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Nuevo equipo
        </Button>
      </div>
      {data.vgc_teams.length === 0 ? (
        <Empty icon={<Users className="size-6 text-faint" />}>
          <p>Aún no hay equipos.</p>
          <Button className="mt-1" onClick={() => void create('vgc_teams', { ...EXAMPLE_TEAM })}>
            Cargar el equipo de ejemplo
          </Button>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.vgc_teams.map((t) => {
            const p = parseTeam(t.paste, champions ?? undefined)
            const rec = records.get(t.id) ?? emptyTally()
            return (
              <li key={t.id} className="min-w-0">
                <button type="button" onClick={() => setOpenId(t.id)} className="card w-full p-4 text-left transition hover:border-line-strong">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {t.regulation}
                        {p.valid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" /> Válido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                            <XCircle className="size-3.5" /> {p.errors.length} {p.errors.length === 1 ? 'error' : 'errores'}
                          </span>
                        )}
                      </span>
                    </span>
                    {played(rec) > 0 && (
                      <span className="shrink-0 text-right">
                        <span className="num block text-sm font-semibold">{recordText(rec)}</span>
                        <span className="num text-xs text-muted">{fmtRate(winRate(rec))}</span>
                      </span>
                    )}
                  </span>
                  <span className="mt-3 grid grid-cols-6 gap-1">
                    {p.mons.slice(0, 6).map((m, i) => (
                      <span key={i} className="flex flex-col items-center">
                        <SpeciesSprite species={champions?.mega(m.species, m.item) ?? m.species} label={m.species} size={44} />
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open && !editing && <TeamViewer team={open} champions={champions} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
      {editing && (
        <TeamEditor
          team={editing === 'new' ? null : editing}
          champions={champions}
          onClose={() => setEditing(null)}
          onDeleted={() => {
            setEditing(null)
            setOpenId(null)
          }}
        />
      )}
    </>
  )
}

function TeamProblems({ team }: { team: ParsedTeam }) {
  if (!team.errors.length && !team.warnings.length)
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-400">
        <CheckCircle2 className="size-4 shrink-0" /> Equipo válido{team.system === 'sp' ? ' (Stat Points de Pokémon Champions)' : ' (EVs clásicos)'}.
      </p>
    )
  return (
    <ul className="space-y-1 text-sm">
      {team.errors.map((e) => (
        <li key={e} className="flex items-start gap-2 text-rose-700 dark:text-rose-400">
          <XCircle className="mt-0.5 size-4 shrink-0" /> {e}
        </li>
      ))}
      {team.warnings.map((e) => (
        <li key={e} className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {e}
        </li>
      ))}
    </ul>
  )
}

function MonCard({ mon, system, champions }: { mon: TeamMon; system: SpreadSystem; champions: Champions | null }) {
  const info = champions?.get(mon.species)
  const mega = champions?.mega(mon.species, mon.item) ?? null
  const megaInfo = mega ? champions?.get(mega) : null
  const [showMega, setShowMega] = useState(false)
  const active = showMega && megaInfo ? megaInfo : info
  const stats = active ? finalStats(active.base, mon, system) : null
  const nature = natureOf(mon.nature)
  return (
    <article className="min-w-0 rounded-xl border border-line p-3">
      <div className="flex items-start gap-3">
        <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-surface-2">
          <SpeciesSprite species={showMega && mega ? mega : mon.species} size={58} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {mon.nickname || (showMega && mega ? mega : mon.species)}
            {mon.nickname && <span className="ml-1 text-xs font-normal text-muted">({mon.species})</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {active?.types.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px]">
                <span className="size-2 rounded-full" style={{ background: TYPE_COLORS[t] }} /> {TYPE_ES[t] ?? t}
              </span>
            ))}
          </div>
          <div className="mt-1 text-xs text-muted">
            {mon.item || 'Sin objeto'} · {showMega && megaInfo ? megaInfo.abilities[0] : mon.ability || 'Sin habilidad'}
          </div>
        </div>
        {mega && (
          <button type="button" aria-pressed={showMega} onClick={() => setShowMega((x) => !x)} className={cx('min-h-8 shrink-0 rounded-lg border px-2 text-xs font-medium', showMega ? 'border-accent bg-accent/10' : 'border-line text-muted hover:text-fg')}>
            Mega
          </button>
        )}
      </div>

      <div className="mt-3 space-y-1">
        {STATS.map((k) => {
          const up = nature?.[2] === k
          const down = nature?.[3] === k
          const v = stats?.[k] ?? null
          return (
            <div key={k} className="grid grid-cols-[34px_40px_minmax(0,1fr)_40px] items-center gap-2 text-xs">
              <span className={cx(up ? 'font-semibold text-fg' : 'text-muted')}>
                {STAT_LABELS[k]}
                {up ? '↑' : down ? '↓' : ''}
              </span>
              <span className="num text-right text-faint">{mon.evs[k] ? `+${mon.evs[k]}` : ''}</span>
              <span className="block h-1.5 rounded-full bg-line" aria-hidden>
                {v !== null && <span className="block h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (v / 260) * 100)}%` }} />}
              </span>
              <span className="num text-right font-semibold">{v ?? '—'}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-xs text-muted">
        {mon.nature ? natureLabel(mon.nature) : 'Sin naturaleza'} · Nv. {mon.level}
        {mon.teraType && ` · Tera ${TYPE_ES[mon.teraType] ?? mon.teraType}`}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1">
        {mon.moves.map((m, i) => (
          <li key={i} className="truncate rounded-md bg-surface-2 px-2 py-1 text-xs" title={m}>
            {m}
          </li>
        ))}
      </ul>
    </article>
  )
}

const TeamGrid = ({ team, champions }: { team: ParsedTeam; champions: Champions | null }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
    {team.mons.map((m, i) => (
      <MonCard key={`${i}-${m.species}-${m.item}`} mon={m} system={team.system} champions={champions} />
    ))}
  </div>
)

function TeamViewer({ team, champions, onClose, onEdit }: { team: VgcTeam; champions: Champions | null; onClose: () => void; onEdit: () => void }) {
  const toast = useToast()
  const p = useMemo(() => parseTeam(team.paste, champions ?? undefined), [team.paste, champions])
  async function copy() {
    try {
      await navigator.clipboard.writeText(formatTeam(p.mons))
      toast('success', 'Equipo copiado en formato Showdown')
    } catch {
      toast('error', 'No se ha podido copiar el equipo')
    }
  }
  return (
    <Modal
      open
      full
      onClose={onClose}
      title={team.name}
      footer={
        <>
          <Button className="mr-auto" onClick={() => void copy()}>
            <Copy className="size-4" /> Copiar <span className="max-sm:sr-only">para Showdown</span>
          </Button>
          <Button variant="primary" onClick={onEdit}>
            <Pencil className="size-4" /> Editar
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-line-strong text-muted">{team.regulation || 'Sin regulación'}</Badge>
          <Badge className="border-line-strong text-muted">{p.system === 'sp' ? 'Stat Points (Champions)' : 'EVs clásicos'}</Badge>
        </div>
        <TeamProblems team={p} />
        <TeamGrid team={p} champions={champions} />
        {team.notes && <p className="text-sm whitespace-pre-wrap text-muted">{team.notes}</p>}
      </div>
    </Modal>
  )
}

function TeamEditor({ team, champions, onClose, onDeleted }: { team: VgcTeam | null; champions: Champions | null; onClose: () => void; onDeleted: () => void }) {
  const { create, update, remove } = useData()
  const toast = useToast()
  const [name, setName] = useState(team?.name ?? '')
  const [regulation, setRegulation] = useState(team?.regulation ?? 'Regulación M-C')
  const [text, setText] = useState(team?.paste ?? '')
  const [notes, setNotes] = useState(team?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const link = pokepasteId(text)
  const p = useMemo(() => parseTeam(link ? '' : text, champions ?? undefined), [text, link, champions])

  async function importLink() {
    if (!link) return
    setBusy(true)
    try {
      const r = await fetch(`https://pokepast.es/${link}/json`, { referrerPolicy: 'no-referrer' })
      if (!r.ok) throw new Error(String(r.status))
      const j = (await r.json()) as { title?: string; paste?: string }
      if (!j.paste) throw new Error('vacío')
      setText(j.paste.replace(/[ \t]+\r?\n/g, '\n').replace(/\r/g, '').trim().slice(0, 10000))
      if (!name.trim() && j.title) setName(j.title.slice(0, 120))
    } catch {
      toast('error', 'No se ha podido descargar el Pokepaste. Pega el texto del equipo.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!name.trim()) return toast('error', 'Ponle un nombre al equipo.')
    if (!p.mons.length) return toast('error', link ? 'Descarga primero el Pokepaste.' : 'Pega el equipo en formato Showdown.')
    const row = { name: name.trim(), regulation: regulation.trim(), paste: text.trim(), notes }
    onClose()
    if (team) await update('vgc_teams', team.id, row)
    else await create('vgc_teams', row)
    if (!p.valid) toast('error', `Guardado, pero el equipo no es legal: ${p.errors[0]}`)
  }

  return (
    <Modal
      open
      full
      onClose={onClose}
      title={team ? 'Editar equipo' : 'Nuevo equipo'}
      footer={
        <>
          {team && (
            <Button variant="danger" className="mr-auto" onClick={() => (confirm ? (onDeleted(), void remove('vgc_teams', team.id)) : setConfirm(true))}>
              <Trash2 className="size-4" /> {confirm ? '¿Seguro? Eliminar' : <span className="max-sm:sr-only">Eliminar</span>}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Field label="Nombre">
            <input className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Regulación">
            <input className="field" value={regulation} maxLength={60} onChange={(e) => setRegulation(e.target.value)} />
          </Field>
          <Field label="Equipo (Showdown) o enlace de Pokepaste">
            <textarea
              className="field min-h-[360px] font-mono text-xs leading-relaxed"
              spellCheck={false}
              value={text}
              maxLength={10000}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Glimmora @ Life Orb\nAbility: Toxic Debris\nEVs: 1 HP / 32 SpA / 1 SpD / 32 Spe\nModest Nature\n- Sludge Bomb\n…\n\nhttps://pokepast.es/…'}
            />
          </Field>
          {link && (
            <Button className="w-full" disabled={busy} onClick={() => void importLink()}>
              <Link2 className="size-4" /> {busy ? 'Descargando…' : 'Descargar el equipo del enlace'}
            </Button>
          )}
          <Field label="Notas">
            <textarea className="field min-h-16" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div className="min-w-0 space-y-4 lg:border-l lg:border-line lg:pl-6">
          {p.mons.length ? (
            <>
              <TeamProblems team={p} />
              <TeamGrid team={p} champions={champions} />
            </>
          ) : (
            <Empty>
              La vista previa aparecerá aquí.
              <button type="button" className="text-accent hover:underline" onClick={() => setText(EXAMPLE_TEAM.paste)}>
                Pegar el equipo de ejemplo
              </button>
            </Empty>
          )}
        </div>
      </div>
    </Modal>
  )
}
