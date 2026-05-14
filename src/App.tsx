import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  format,
  addMonths,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isWithinInterval,
  getDay,
  parseISO,
} from 'date-fns'
import { isHoliday, between } from '@holiday-jp/holiday_jp'
import './App.css'

type PeriodType = 1 | 3 | 6

interface Profile {
  id: string
  name: string
  oneWayFare: number
  passPrice: number
  periodType: PeriodType
  startDate: string
}

const STORAGE_PROFILES = 'teiki-checker-profiles'
const STORAGE_ACTIVE_PROFILE = 'teiki-checker-active-profile-id'
const STORAGE_ATTENDANCE_PREFIX = 'teiki-checker-attendance-'
const LEGACY_SETTINGS = 'teiki-checker-settings'
const LEGACY_ATTENDANCE = 'teiki-checker-attendance'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function saveProfiles(profiles: Profile[]) {
  localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles))
}

function saveActiveProfileId(id: string) {
  localStorage.setItem(STORAGE_ACTIVE_PROFILE, id)
}

function saveAttendance(profileId: string, dates: Set<string>) {
  localStorage.setItem(
    STORAGE_ATTENDANCE_PREFIX + profileId,
    JSON.stringify([...dates])
  )
}

function loadAttendance(profileId: string): Set<string> {
  const raw = localStorage.getItem(STORAGE_ATTENDANCE_PREFIX + profileId)
  if (raw) {
    try {
      const arr = JSON.parse(raw) as unknown
      if (Array.isArray(arr)) {
        return new Set(arr.filter((d): d is string => typeof d === 'string'))
      }
    } catch {
      // ignore
    }
  }
  return new Set()
}

function migrateLegacyData(): { profiles: Profile[]; activeId: string } {
  const legacyRaw = localStorage.getItem(LEGACY_SETTINGS)
  let defaultProfile: Profile

  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw) as unknown
      if (
        parsed &&
        typeof parsed === 'object' &&
        'oneWayFare' in parsed &&
        'passPrice' in parsed &&
        'periodType' in parsed &&
        'startDate' in parsed
      ) {
        const s = parsed as Omit<Profile, 'id' | 'name'>
        defaultProfile = {
          id: generateId(),
          name: '設定1',
          oneWayFare: s.oneWayFare,
          passPrice: s.passPrice,
          periodType: s.periodType as PeriodType,
          startDate: s.startDate,
        }
        // Migrate legacy attendance
        const legacyAttRaw = localStorage.getItem(LEGACY_ATTENDANCE)
        if (legacyAttRaw) {
          try {
            const arr = JSON.parse(legacyAttRaw) as unknown
            if (Array.isArray(arr)) {
              const attendance = new Set(
                arr.filter((d): d is string => typeof d === 'string')
              )
              saveAttendance(defaultProfile.id, attendance)
            }
          } catch {
            // ignore
          }
        }
        // Clean up legacy keys
        localStorage.removeItem(LEGACY_SETTINGS)
        localStorage.removeItem(LEGACY_ATTENDANCE)
      } else {
        throw new Error('Invalid legacy format')
      }
    } catch {
      defaultProfile = createDefaultProfile()
    }
  } else {
    defaultProfile = createDefaultProfile()
  }

  const profiles = [defaultProfile]
  saveProfiles(profiles)
  saveActiveProfileId(defaultProfile.id)
  return { profiles, activeId: defaultProfile.id }
}

function createDefaultProfile(): Profile {
  const today = new Date()
  return {
    id: generateId(),
    name: '設定1',
    oneWayFare: 300,
    passPrice: 12000,
    periodType: 1,
    startDate: format(today, 'yyyy-MM-dd'),
  }
}

function loadProfiles(): { profiles: Profile[]; activeId: string } {
  const profilesRaw = localStorage.getItem(STORAGE_PROFILES)
  const activeIdRaw = localStorage.getItem(STORAGE_ACTIVE_PROFILE)

  if (!profilesRaw) {
    return migrateLegacyData()
  }

  try {
    const profiles = JSON.parse(profilesRaw) as unknown
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return migrateLegacyData()
    }
    const activeId = activeIdRaw || (profiles[0] as Profile).id
    return { profiles: profiles as Profile[], activeId }
  } catch {
    return migrateLegacyData()
  }
}

function getEndDate(start: Date, period: PeriodType): Date {
  return subDays(addMonths(start, period), 1)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('ja-JP').format(n)
}

export default function App() {
  const { profiles: initialProfiles, activeId: initialActiveId } =
    loadProfiles()
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [activeId, setActiveId] = useState<string>(initialActiveId)

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeId) || profiles[0],
    [profiles, activeId]
  )

  const [attendance, setAttendance] = useState<Set<string>>(() =>
    loadAttendance(activeProfile.id)
  )
  const [oneWayFareInput, setOneWayFareInput] = useState(
    String(activeProfile.oneWayFare)
  )
  const [passPriceInput, setPassPriceInput] = useState(
    String(activeProfile.passPrice)
  )
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    if (isSettingsOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isSettingsOpen])

  const start = useMemo(
    () => parseISO(activeProfile.startDate),
    [activeProfile.startDate]
  )
  const end = useMemo(
    () => getEndDate(start, activeProfile.periodType),
    [start, activeProfile.periodType]
  )

  const months = useMemo(() => {
    const ms: Date[] = []
    let current = startOfMonth(start)
    while (current <= end) {
      ms.push(current)
      current = addMonths(current, 1)
    }
    return ms
  }, [start, end])

  const totalFare = activeProfile.oneWayFare * 2 * attendance.size
  const shouldBuy = activeProfile.passPrice <= totalFare
  const diff = Math.abs(activeProfile.passPrice - totalFare)
  const breakEvenDays = Math.ceil(
    activeProfile.passPrice / (activeProfile.oneWayFare * 2)
  )

  const switchProfile = useCallback(
    (id: string) => {
      setActiveId(id)
      saveActiveProfileId(id)
      const profile = profiles.find((p) => p.id === id)
      if (profile) {
        setAttendance(loadAttendance(id))
        setOneWayFareInput(String(profile.oneWayFare))
        setPassPriceInput(String(profile.passPrice))
      }
    },
    [profiles]
  )

  function updateProfile(next: Partial<Profile>) {
    setProfiles((prev) => {
      const updated = prev.map((p) =>
        p.id === activeId ? { ...p, ...next } : p
      )
      saveProfiles(updated)
      return updated
    })

    // Filter out attendance dates that fall outside the new range
    const nextProfile = { ...activeProfile, ...next }
    const newStart = parseISO(nextProfile.startDate)
    const newEnd = getEndDate(newStart, nextProfile.periodType)
    setAttendance((prev) => {
      const filtered = new Set(
        [...prev].filter((dateStr) => {
          const d = parseISO(dateStr)
          return isWithinInterval(d, { start: newStart, end: newEnd })
        })
      )
      if (filtered.size !== prev.size) {
        saveAttendance(activeId, filtered)
      }
      return filtered
    })
  }

  function addProfile() {
    const today = new Date()
    const newProfile: Profile = {
      id: generateId(),
      name: `設定${profiles.length + 1}`,
      oneWayFare: 300,
      passPrice: 12000,
      periodType: 1,
      startDate: format(today, 'yyyy-MM-dd'),
    }
    const updated = [...profiles, newProfile]
    setProfiles(updated)
    saveProfiles(updated)
    switchProfile(newProfile.id)
    setAttendance(new Set())
    saveAttendance(newProfile.id, new Set())
  }

  function deleteProfile(id: string) {
    if (profiles.length <= 1) return
    const updated = profiles.filter((p) => p.id !== id)
    setProfiles(updated)
    saveProfiles(updated)
    localStorage.removeItem(STORAGE_ATTENDANCE_PREFIX + id)
    if (activeId === id) {
      const nextId = updated[0].id
      switchProfile(nextId)
    }
  }

  function startRename(id: string, currentName: string) {
    setRenamingId(id)
    setRenameValue(currentName)
  }

  function confirmRename() {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null)
      return
    }
    setProfiles((prev) => {
      const updated = prev.map((p) =>
        p.id === renamingId ? { ...p, name: renameValue.trim() } : p
      )
      saveProfiles(updated)
      return updated
    })
    setRenamingId(null)
  }

  function toggleDate(dateStr: string) {
    setAttendance((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) {
        next.delete(dateStr)
      } else {
        next.add(dateStr)
      }
      saveAttendance(activeId, next)
      return next
    })
  }

  function autoSelectWeekdays() {
    const days = eachDayOfInterval({ start, end })
    const next = new Set<string>()
    for (const d of days) {
      const day = getDay(d)
      if (day !== 0 && day !== 6 && !isHoliday(d)) {
        next.add(format(d, 'yyyy-MM-dd'))
      }
    }
    setAttendance(next)
    saveAttendance(activeId, next)
  }

  function clearAll() {
    setAttendance(new Set())
    saveAttendance(activeId, new Set())
  }

  const settingsForm = (
    <>
      <div className="profile-bar">
        {renamingId === activeId ? (
          <div className="profile-rename">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename()
                if (e.key === 'Escape') setRenamingId(null)
              }}
              autoFocus
            />
          </div>
        ) : (
          <select
            className="profile-select"
            value={activeId}
            onChange={(e) => switchProfile(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <div className="profile-actions">
          <button
            type="button"
            onClick={() => startRename(activeId, activeProfile.name)}
          >
            名前変更
          </button>
          <button type="button" onClick={addProfile}>
            追加
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => deleteProfile(activeId)}
            disabled={profiles.length <= 1}
          >
            削除
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label>
          片道運賃（円）
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={oneWayFareInput}
            onChange={(e) => {
              const filtered = e.target.value.replace(/[^0-9]/g, '')
              setOneWayFareInput(filtered)
            }}
            onBlur={() => {
              updateProfile({
                oneWayFare:
                  oneWayFareInput === '' ? 0 : Number(oneWayFareInput),
              })
            }}
          />
        </label>
        <label>
          定期代（円）
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={passPriceInput}
            onChange={(e) => {
              const filtered = e.target.value.replace(/[^0-9]/g, '')
              setPassPriceInput(filtered)
            }}
            onBlur={() => {
              updateProfile({
                passPrice: passPriceInput === '' ? 0 : Number(passPriceInput),
              })
            }}
          />
        </label>
        <label>
          定期種別
          <select
            value={activeProfile.periodType}
            onChange={(e) =>
              updateProfile({
                periodType: Number(e.target.value) as PeriodType,
              })
            }
          >
            <option value={1}>1ヶ月</option>
            <option value={3}>3ヶ月</option>
            <option value={6}>6ヶ月</option>
          </select>
        </label>
        <label>
          開始日
          <input
            type="date"
            value={activeProfile.startDate}
            onChange={(e) =>
              updateProfile({ startDate: e.target.value })
            }
          />
        </label>
      </div>
    </>
  )

  return (
    <div className="container">
      <header>
        <h1>定期更新チェッカー</h1>
        <p>
          出勤予定日を選ぶだけで、定期を買うべきか即座に判定します
        </p>
      </header>

      {/* Desktop settings */}
      <section className="settings desktop-only">
        <h2>設定</h2>
        {settingsForm}
      </section>

      {/* Mobile summary */}
      <div className="settings-summary sp-only">
        <div className="summary-row">
          <span className="summary-profile">{activeProfile.name}</span>
          <span className="summary-detail">
            {formatCurrency(activeProfile.oneWayFare)}円×2 / {activeProfile.periodType}ヶ月 / {format(start, 'M/d')}〜{format(end, 'M/d')}
          </span>
        </div>
        <button
          type="button"
          className="summary-edit"
          onClick={() => setIsSettingsOpen(true)}
        >
          設定を編集
        </button>
      </div>

      {/* Mobile modal */}
      {isSettingsOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>設定</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            {settingsForm}
          </div>
        </div>
      )}

      <section className="result">
        <div className={`verdict ${shouldBuy ? 'buy' : 'skip'}`}>
          {shouldBuy ? '定期を買うべき' : '買わない方がいい'}
        </div>
        <div className="details">
          <div className="row">
            <span>定期代</span>
            <strong>{formatCurrency(activeProfile.passPrice)}円</strong>
          </div>
          <div className="row">
            <span>チャージ払い</span>
            <strong>{formatCurrency(totalFare)}円</strong>
          </div>
          <div className="row">
            <span>差額</span>
            <strong className={shouldBuy ? 'positive' : 'negative'}>
              {formatCurrency(diff)}円 {shouldBuy ? 'お得' : '損'}
            </strong>
          </div>
          <div className="row">
            <span>損益分岐日数</span>
            <strong>{breakEvenDays}日</strong>
          </div>
          <div className="row">
            <span>選択中出勤日数</span>
            <strong>{attendance.size}日</strong>
          </div>
        </div>
      </section>

      <section className="calendar-section">
        <div className="calendar-header">
          <h2>出勤予定カレンダー</h2>
          <div className="calendar-actions">
            <button type="button" onClick={autoSelectWeekdays}>
              平日を自動選択
            </button>
            <button
              type="button"
              className="secondary"
              onClick={clearAll}
            >
              すべて解除
            </button>
          </div>
        </div>
        <p className="range">
          対象期間: {format(start, 'yyyy/MM/dd')} 〜{' '}
          {format(end, 'yyyy/MM/dd')}
        </p>
        <div className="months">
          {months.map((monthStart) => (
            <MonthCalendar
              key={format(monthStart, 'yyyy-MM')}
              monthStart={monthStart}
              start={start}
              end={end}
              attendance={attendance}
              onToggle={toggleDate}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function MonthCalendar({
  monthStart,
  start,
  end,
  attendance,
  onToggle,
}: {
  monthStart: Date
  start: Date
  end: Date
  attendance: Set<string>
  onToggle: (dateStr: string) => void
}) {
  const calendarStart = startOfWeek(startOfMonth(monthStart), {
    weekStartsOn: 0,
  })
  const calendarEnd = endOfWeek(endOfMonth(monthStart), {
    weekStartsOn: 0,
  })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>()
    const monthEnd = endOfMonth(monthStart)
    const holidays = between(monthStart, monthEnd)
    for (const h of holidays) {
      map.set(format(h.date, 'yyyy-MM-dd'), h.name)
    }
    return map
  }, [monthStart])

  const holidaysInMonth = useMemo(() => {
    const monthEnd = endOfMonth(monthStart)
    return between(monthStart, monthEnd)
  }, [monthStart])

  return (
    <div className="month">
      <h3>{format(monthStart, 'yyyy年M月')}</h3>
      {holidaysInMonth.length > 0 && (
        <div className="holiday-list">
          {holidaysInMonth.map((h) => (
            <span key={format(h.date, 'yyyy-MM-dd')} className="holiday-chip">
              {format(h.date, 'M/d')} {h.name}
            </span>
          ))}
        </div>
      )}
      <div className="calendar-grid">
        {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
          <div key={d} className="weekday-header">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const str = format(d, 'yyyy-MM-dd')
          const inRange = isWithinInterval(d, { start, end })
          const isCurrentMonth = isSameMonth(d, monthStart)
          const selected = attendance.has(str)
          const day = getDay(d)
          const holidayName = holidayMap.get(str)
          const holiday = holidayName !== undefined

          if (!isCurrentMonth) {
            return <div key={str} className="day-cell empty" />
          }

          return (
            <button
              key={str}
              type="button"
              className={[
                'day-cell',
                !inRange && 'out-of-range',
                selected && 'selected',
                day === 0 && 'sunday',
                day === 6 && 'saturday',
                holiday && 'holiday',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!inRange}
              onClick={() => onToggle(str)}
            >
              <span className="day-number">{format(d, 'd')}</span>
              {holiday && <span className="holiday-badge">祝</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
