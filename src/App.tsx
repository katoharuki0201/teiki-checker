import { useState, useMemo } from 'react'
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

interface Settings {
  oneWayFare: number
  passPrice: number
  periodType: PeriodType
  startDate: string
}

const STORAGE_SETTINGS = 'teiki-checker-settings'
const STORAGE_ATTENDANCE = 'teiki-checker-attendance'

function loadSettings(): Settings {
  const raw = localStorage.getItem(STORAGE_SETTINGS)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (
        parsed &&
        typeof parsed === 'object' &&
        'oneWayFare' in parsed &&
        'passPrice' in parsed &&
        'periodType' in parsed &&
        'startDate' in parsed
      ) {
        return parsed as Settings
      }
    } catch {
      // ignore
    }
  }
  const today = new Date()
  return {
    oneWayFare: 300,
    passPrice: 12000,
    periodType: 1,
    startDate: format(today, 'yyyy-MM-dd'),
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(s))
}

function loadAttendance(): Set<string> {
  const raw = localStorage.getItem(STORAGE_ATTENDANCE)
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

function saveAttendance(dates: Set<string>) {
  localStorage.setItem(STORAGE_ATTENDANCE, JSON.stringify([...dates]))
}

function getEndDate(start: Date, period: PeriodType): Date {
  return subDays(addMonths(start, period), 1)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('ja-JP').format(n)
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [attendance, setAttendance] = useState<Set<string>>(loadAttendance)
  const [oneWayFareInput, setOneWayFareInput] = useState(String(settings.oneWayFare))
  const [passPriceInput, setPassPriceInput] = useState(String(settings.passPrice))

  const start = useMemo(() => parseISO(settings.startDate), [settings.startDate])
  const end = useMemo(
    () => getEndDate(start, settings.periodType),
    [start, settings.periodType]
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

  const totalFare = settings.oneWayFare * 2 * attendance.size
  const shouldBuy = settings.passPrice <= totalFare
  const diff = Math.abs(settings.passPrice - totalFare)
  const breakEvenDays = Math.ceil(
    settings.passPrice / (settings.oneWayFare * 2)
  )

  function updateSettings(next: Partial<Settings>) {
    setSettings((prev) => {
      const updated = { ...prev, ...next }
      saveSettings(updated)
      return updated
    })

    // Filter out attendance dates that fall outside the new range
    const nextSettings = { ...settings, ...next }
    const newStart = parseISO(nextSettings.startDate)
    const newEnd = getEndDate(newStart, nextSettings.periodType)
    setAttendance((prev) => {
      const filtered = new Set(
        [...prev].filter((dateStr) => {
          const d = parseISO(dateStr)
          return isWithinInterval(d, { start: newStart, end: newEnd })
        })
      )
      if (filtered.size !== prev.size) {
        saveAttendance(filtered)
      }
      return filtered
    })
  }

  function toggleDate(dateStr: string) {
    setAttendance((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) {
        next.delete(dateStr)
      } else {
        next.add(dateStr)
      }
      saveAttendance(next)
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
    saveAttendance(next)
  }

  function clearAll() {
    setAttendance(new Set())
    saveAttendance(new Set())
  }

  return (
    <div className="container">
      <header>
        <h1>定期更新チェッカー</h1>
        <p>
          出勤予定日を選ぶだけで、定期を買うべきか即座に判定します
        </p>
      </header>

      <section className="settings">
        <h2>設定</h2>
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
                updateSettings({ oneWayFare: oneWayFareInput === '' ? 0 : Number(oneWayFareInput) })
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
                updateSettings({ passPrice: passPriceInput === '' ? 0 : Number(passPriceInput) })
              }}
            />
          </label>
          <label>
            定期種別
            <select
              value={settings.periodType}
              onChange={(e) =>
                updateSettings({
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
              value={settings.startDate}
              onChange={(e) =>
                updateSettings({ startDate: e.target.value })
              }
            />
          </label>
        </div>
      </section>

      <section className="result">
        <div className={`verdict ${shouldBuy ? 'buy' : 'skip'}`}>
          {shouldBuy ? '定期を買うべき' : '買わない方がいい'}
        </div>
        <div className="details">
          <div className="row">
            <span>定期代</span>
            <strong>{formatCurrency(settings.passPrice)}円</strong>
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

  return (
    <div className="month">
      <h3>{format(monthStart, 'yyyy年M月')}</h3>
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
              title={holidayName}
              onClick={() => onToggle(str)}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
