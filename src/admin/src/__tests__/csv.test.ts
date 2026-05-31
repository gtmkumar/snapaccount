/**
 * csv util tests — escaping, serialization, and date-stamped filenames.
 */
import { describe, it, expect } from 'vitest'
import { escapeCsvField, toCsv, csvFilename } from '@/lib/csv'

describe('escapeCsvField', () => {
  it('leaves plain values unquoted', () => {
    expect(escapeCsvField('Riya')).toBe('Riya')
    expect(escapeCsvField(42)).toBe('42')
  })

  it('renders null/undefined as empty', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('quotes and escapes fields with commas, quotes or newlines', () => {
    expect(escapeCsvField('Sharma, Riya')).toBe('"Sharma, Riya"')
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
  })
})

describe('toCsv', () => {
  interface Row { name: string; open: number; note?: string }
  const cols = [
    { header: 'Name', value: (r: Row) => r.name },
    { header: 'Open', value: (r: Row) => r.open },
    { header: 'Note', value: (r: Row) => r.note },
  ]

  it('builds a header row plus one CRLF-separated line per row', () => {
    const csv = toCsv<Row>(
      [{ name: 'Riya', open: 5, note: 'ok' }, { name: 'Arjun', open: 0 }],
      cols,
    )
    expect(csv).toBe('Name,Open,Note\r\nRiya,5,ok\r\nArjun,0,')
  })

  it('escapes values inside the body', () => {
    const csv = toCsv<Row>([{ name: 'Sharma, R', open: 1, note: 'a "b"' }], cols)
    expect(csv).toBe('Name,Open,Note\r\n"Sharma, R",1,"a ""b"""')
  })

  it('emits just the header for empty input', () => {
    expect(toCsv<Row>([], cols)).toBe('Name,Open,Note')
  })
})

describe('csvFilename', () => {
  it('date-stamps the prefix', () => {
    expect(csvFilename('team-workload', new Date('2026-05-31T10:00:00Z')))
      .toBe('team-workload-2026-05-31.csv')
  })
})
