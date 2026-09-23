/**
 * The Full Year table's last page, kept whole. Dragon's July page ended on a
 * sheet carrying only the repeated header and Net Profit; Urban Road's opened on
 * Operating Profit. Calxa's opens on four accounts and then the closing rows.
 */
import { describe, it, expect } from 'vitest'
import { tablePageStarts, closingRowsBreak, keepWithNextStarts, lastPageWidowBreak } from '../full-year-page-break'

// 10 units a page after the header, rows 1 unit tall.
const flow = { firstY: 0, continuationY: 0, bottom: 10 }
const rows = (n: number) => Array(n).fill(1)

describe('tablePageStarts', () => {
  it('moves a row that does not fit, whole, to the next page', () => {
    expect(tablePageStarts(rows(25), flow)).toEqual([10, 20])
    expect(tablePageStarts([4, 4, 4], flow)).toEqual([2])
  })

  it('starts the first page lower when a title and a note sit above the table', () => {
    expect(tablePageStarts(rows(12), { ...flow, firstY: 3 })).toEqual([7])
  })
})

describe('closingRowsBreak', () => {
  it("does not leave Net Profit alone on the last page (Dragon, July)", () => {
    // 21 rows: the closing rows are 16-20 (Total Expense … Net Profit), and
    // autoTable's own break would put row 20 alone on page 3.
    expect(tablePageStarts(rows(21), flow)).toEqual([10, 20])
    expect(closingRowsBreak(rows(21), 16, flow)).toBe(12)
  })

  it('does not open a page on the expense total either', () => {
    expect(closingRowsBreak(rows(15), 10, flow)).toBe(6)
  })

  it('never empties the page before', () => {
    // Page 2 begins at 10; carrying four rows would reach back past it.
    expect(closingRowsBreak(rows(21), 13, flow)).toBe(11)
  })

  it("leaves autoTable's break alone when the closing rows already share a page", () => {
    expect(closingRowsBreak(rows(18), 12, flow)).toBeNull()
    expect(closingRowsBreak(rows(8), 4, flow)).toBeNull()
  })

  it('gives up rather than overflow when the carried rows cannot fit one page', () => {
    expect(closingRowsBreak([...rows(10), 4, 4, 4, 4], 12, flow)).toBeNull()
  })
})

describe('keepWithNextStarts', () => {
  const none = (n: number) => Array(n).fill(false)

  it("is autoTable's own flow when no row asks to travel with the next", () => {
    expect(keepWithNextStarts(rows(25), none(25), flow)).toEqual(tablePageStarts(rows(25), flow))
  })

  it('does not end a page on a group row whose accounts are on the next (Urban Road cashflow, Employment Expense)', () => {
    const keep = none(25)
    keep[9] = true
    expect(keepWithNextStarts(rows(25), keep, flow)).toEqual([9, 19])
  })

  it('carries a section heading and its first group row together', () => {
    const keep = none(25)
    keep[8] = true // "Expense"
    keep[9] = true // "Employment Expense"
    expect(keepWithNextStarts(rows(25), keep, flow)).toEqual([8, 18])
  })

  it('never empties the page before', () => {
    const keep = Array(25).fill(true)
    expect(keepWithNextStarts(rows(25), keep, flow)).toEqual([10, 20])
  })
})

describe('lastPageWidowBreak', () => {
  it("does not leave one name alone on the last page (JDS, April Wages Analysis)", () => {
    expect(tablePageStarts(rows(11), flow)).toEqual([10])
    expect(lastPageWidowBreak(rows(11), flow)).toBe(8)
    expect(lastPageWidowBreak(rows(12), flow)).toBe(9)
  })

  it('leaves a last page that already carries three rows alone, and a one-page table', () => {
    expect(lastPageWidowBreak(rows(13), flow)).toBeNull()
    expect(lastPageWidowBreak(rows(10), flow)).toBeNull()
  })

  it('only moves the last break, and never takes the page before below three rows', () => {
    // Pages begin at 10 and 20; row 20 alone on page 3.
    expect(lastPageWidowBreak(rows(21), flow)).toBe(18)
    // A continuation page that holds only three rows cannot give any away.
    expect(tablePageStarts([...rows(10), 3, 3, 3, 2], flow)).toEqual([10, 13])
    expect(lastPageWidowBreak([...rows(10), 3, 3, 3, 2], flow)).toBeNull()
  })
})
