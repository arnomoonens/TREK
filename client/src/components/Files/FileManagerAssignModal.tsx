import { useId, useState } from 'react'
import { MapPin, Receipt, Ticket, Check, Loader2, Paperclip } from 'lucide-react'
import { filesApi } from '../../api/client'
import type { BudgetItem, Place, Reservation, Day } from '../../types'
import type { FileManagerState } from './useFileManager'
import { TRANSPORT_TYPES } from './FileManager.constants'
import { transportIcon } from './FileManager.helpers'
import { DialogHeader, DialogShell, DialogTile, NEUTRAL_TINT } from '../shared/DialogShell'
import { EditorField, INPUT } from '../shared/dialogParts'

export function AssignModal(S: FileManagerState) {
  const { files, assignFileId, setAssignFileId, t, days, assignments, places, reservations, expenses, tripId, trip, can, toast, offline, handleAssign, refreshFiles } = S
  const [busyExpenseId, setBusyExpenseId] = useState<number | null>(null)
  const labelId = useId()
  const close = () => setAssignFileId(null)
  const canAttachExpenses = can('file_edit', trip)
  return (
    <DialogShell
      onClose={close}
      labelledBy={labelId}
      header={(
        <DialogHeader
          tile={<DialogTile><Paperclip size={20} strokeWidth={1.9} className="text-content-muted" /></DialogTile>}
          tint={NEUTRAL_TINT}
          labelId={labelId}
          onClose={close}
          eyebrow={t('files.assignTitle')}
          title={files.find(f => f.id === assignFileId)?.original_name || ''}
        />
      )}
    >
        <EditorField label={t('files.noteLabel') || 'Note'}>
          <input
            type="text"
            placeholder={t('files.notePlaceholder')}
            defaultValue={files.find(f => f.id === assignFileId)?.description || ''}
            onBlur={e => {
              const val = e.target.value.trim()
              const file = files.find(f => f.id === assignFileId)
              if (file && val !== (file.description || '')) {
                void handleAssign(file.id, { description: val } as any)
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className={INPUT}
          />
        </EditorField>
        <div className="rounded-[16px] bg-surface-secondary p-2">
          {(() => {
            const file = files.find(f => f.id === assignFileId)
            if (!file) return null
            const assignedPlaceIds = new Set<number>()
            const dayGroups: { day: Day; dayPlaces: Place[] }[] = []
            for (const day of days) {
              const da = assignments[String(day.id)] || []
              const dayPlaces = da.map(a => places.find(p => p.id === a.place?.id || p.id === a.place_id)).filter(Boolean) as Place[]
              if (dayPlaces.length > 0) {
                dayGroups.push({ day, dayPlaces })
                dayPlaces.forEach(p => assignedPlaceIds.add(p.id))
              }
            }
            const unassigned = places.filter(p => !assignedPlaceIds.has(p.id))
            const placeBtn = (p: Place, idx: number) => {
              const isLinked = file.place_id === p.id || (file.linked_place_ids || []).includes(p.id)
              return (
                <button type="button" key={`${p.id}-${idx}`} onClick={async () => {
                  if (isLinked) {
                    if (file.place_id === p.id) {
                      await handleAssign(file.id, { place_id: null })
                    } else {
                      try {
                        const linksRes = await filesApi.getLinks(tripId, file.id)
                        const link = (linksRes.links || []).find((l: any) => l.place_id === p.id)
                        if (link) await filesApi.removeLink(tripId, file.id, link.id)
                        refreshFiles()
                      } catch {}
                    }
                  } else {
                    if (!file.place_id) {
                      await handleAssign(file.id, { place_id: p.id })
                    } else {
                      try {
                        await filesApi.addLink(tripId, file.id, { place_id: p.id })
                        refreshFiles()
                      } catch {}
                    }
                  }
                }} style={{
                  width: '100%', textAlign: 'left', padding: '6px 10px 6px 20px', background: isLinked ? 'var(--bg-hover)' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: 'calc(13px * var(--fs-scale-body, 1))', color: 'var(--text-primary)',
                  borderRadius: 8, fontFamily: 'inherit', fontWeight: isLinked ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = isLinked ? 'var(--bg-hover)' : 'transparent'}>
                  <MapPin size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {isLinked && <Check size={14} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent)' }} />}
                </button>
              )
            }

            const placesSection = places.length > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-faint)', padding: '8px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('files.assignPlace')}
                </div>
                {dayGroups.map(({ day, dayPlaces }) => (
                  <div key={day.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-muted)', padding: '8px 10px 2px' }}>
                      <span>{day.title || t('dayplan.dayN', { n: day.day_number })}</span>
                      {(() => {
                        const badge = day.date || (day.title ? t('dayplan.dayN', { n: day.day_number }) : null)
                        return badge ? (
                          <span style={{
                            fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-faint)',
                            background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 999,
                          }}>{badge}</span>
                        ) : null
                      })()}
                    </div>
                    {dayPlaces.map((p, i) => placeBtn(p, i))}
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <div>
                    {dayGroups.length > 0 && <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-muted)', padding: '8px 10px 2px' }}>{t('files.unassigned')}</div>}
                    {unassigned.map((p, i) => placeBtn(p, i))}
                  </div>
                )}
              </div>
            )

            const bookingReservations = reservations.filter(r => !TRANSPORT_TYPES.has(r.type))
            const transportReservations = reservations.filter(r => TRANSPORT_TYPES.has(r.type))

            const reservationBtn = (r: Reservation) => {
              const isLinked = file.reservation_id === r.id || (file.linked_reservation_ids || []).includes(r.id)
              const Icon = TRANSPORT_TYPES.has(r.type) ? transportIcon(r.type) : Ticket
              return (
                <button type="button" key={r.id} onClick={async () => {
                  if (isLinked) {
                    if (file.reservation_id === r.id) {
                      await handleAssign(file.id, { reservation_id: null })
                    } else {
                      try {
                        const linksRes = await filesApi.getLinks(tripId, file.id)
                        const link = (linksRes.links || []).find((l: any) => l.reservation_id === r.id)
                        if (link) await filesApi.removeLink(tripId, file.id, link.id)
                        refreshFiles()
                      } catch {}
                    }
                  } else {
                    if (!file.reservation_id) {
                      await handleAssign(file.id, { reservation_id: r.id })
                    } else {
                      try {
                        await filesApi.addLink(tripId, file.id, { reservation_id: r.id })
                        refreshFiles()
                      } catch {}
                    }
                  }
                }} style={{
                  width: '100%', textAlign: 'left', padding: '6px 10px 6px 20px', background: isLinked ? 'var(--bg-hover)' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: 'calc(13px * var(--fs-scale-body, 1))', color: 'var(--text-primary)',
                  borderRadius: 8, fontFamily: 'inherit', fontWeight: isLinked ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = isLinked ? 'var(--bg-hover)' : 'transparent'}>
                  <Icon size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  {isLinked && <Check size={14} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent)' }} />}
                </button>
              )
            }

            const bookingsSection = reservations.length > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                {bookingReservations.length > 0 && (
                  <>
                    <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-faint)', padding: '8px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('files.assignBooking')}
                    </div>
                    {bookingReservations.map(reservationBtn)}
                  </>
                )}
                {transportReservations.length > 0 && (
                  <>
                    <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-faint)', padding: '8px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: bookingReservations.length > 0 ? 4 : 0 }}>
                      {t('files.assignTransport')}
                    </div>
                    {transportReservations.map(reservationBtn)}
                  </>
                )}
              </div>
            )

            const expenseButton = (expense: BudgetItem) => {
              const isLinked = (file.linked_budget_item_ids || []).includes(expense.id)
              const busy = busyExpenseId === expense.id
              return (
                <button
                  type="button"
                  key={expense.id}
                  aria-pressed={isLinked}
                  disabled={!canAttachExpenses || offline || busy}
                  onClick={async () => {
                    if (!canAttachExpenses || offline || busy) return
                    setBusyExpenseId(expense.id)
                    try {
                      if (isLinked) await S.detachExpenseFile(tripId, expense.id, file.id)
                      else await S.attachExpenseFile(tripId, expense.id, file.id)
                      await refreshFiles()
                    } catch {
                      toast.error(t('files.toast.assignError'))
                    } finally {
                      setBusyExpenseId(null)
                    }
                  }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '6px 10px 6px 20px', background: isLinked ? 'var(--bg-hover)' : 'none',
                    border: 'none', cursor: !canAttachExpenses || offline || busy ? 'default' : 'pointer', fontSize: 'calc(13px * var(--fs-scale-body, 1))', color: 'var(--text-primary)',
                    borderRadius: 8, fontFamily: 'inherit', fontWeight: isLinked ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: 6, opacity: canAttachExpenses && !offline ? 1 : 0.55,
                  }}
                  onMouseEnter={e => { if (canAttachExpenses && !offline) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isLinked ? 'var(--bg-hover)' : 'transparent' }}
                >
                  <Receipt size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.name || `#${expense.id}`}</span>
                  {busy ? <Loader2 size={14} className="animate-spin" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} /> : isLinked && <Check size={14} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent)' }} />}
                </button>
              )
            }

            const expensesSection = expenses.length > 0 && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-faint)', padding: '8px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('files.assignExpense')}
                </div>
                {expenses.map(expenseButton)}
              </div>
            )

            const hasBoth = placesSection && bookingsSection
            return (
              <>
                <div className={hasBoth ? 'md:flex' : ''}>
                  <div className={hasBoth ? 'md:w-1/2' : ''} style={{ overflowY: 'auto', maxHeight: '55vh', paddingRight: hasBoth ? 6 : 0 }}>{placesSection}</div>
                  {hasBoth && <div className="hidden md:block" style={{ width: 1, background: 'var(--border-primary)', flexShrink: 0 }} />}
                  {hasBoth && <div className="block md:hidden" style={{ height: 1, background: 'var(--border-primary)', margin: '8px 0' }} />}
                  <div className={hasBoth ? 'md:w-1/2' : ''} style={{ overflowY: 'auto', maxHeight: '55vh', paddingLeft: hasBoth ? 6 : 0 }}>{bookingsSection}</div>
                </div>
                {expensesSection && <div style={{ borderTop: placesSection || bookingsSection ? '1px solid var(--border-primary)' : undefined, marginTop: placesSection || bookingsSection ? 8 : 0, paddingTop: placesSection || bookingsSection ? 4 : 0 }}>{expensesSection}</div>}
              </>
            )
          })()}
        </div>
    </DialogShell>
  )
}
