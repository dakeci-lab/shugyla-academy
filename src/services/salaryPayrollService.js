import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import {
  computePayrollEarnedBase,
  computeSalaryTotals,
  isPayrollShiftBased,
  toMoneyNumber,
} from '../utils/salaryPayroll'

const PERIOD_SELECT = 'id, year, month, status, created_at, updated_at'
const RECORD_SELECT =
  'id, period_id, employee_id, status, base_salary, shift_rate, work_hours, work_shifts, total_allowances, total_deductions, total_payable, paid_amount, notes, created_at, updated_at'
const LINE_SELECT = 'id, record_id, kind, title, amount, comment, sort_order, created_at, updated_at'

function assertCloudReady() {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    throw new Error('Подсчёт зарплаты доступен только в облачном режиме')
  }
}

function normalizePeriod(row) {
  if (!row) return null
  return {
    id: row.id,
    year: Number(row.year),
    month: Number(row.month),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeLine(row) {
  if (!row) return null
  return {
    id: row.id,
    recordId: row.record_id,
    kind: row.kind,
    title: row.title,
    amount: toMoneyNumber(row.amount),
    comment: row.comment ?? '',
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    periodId: row.period_id,
    employeeId: Number(row.employee_id),
    status: row.status,
    baseSalary: toMoneyNumber(row.base_salary),
    shiftRate: toMoneyNumber(row.shift_rate),
    workHours: toMoneyNumber(row.work_hours),
    workShifts: toMoneyNumber(row.work_shifts),
    totalAllowances: toMoneyNumber(row.total_allowances),
    totalDeductions: toMoneyNumber(row.total_deductions),
    totalPayable: toMoneyNumber(row.total_payable),
    paidAmount: toMoneyNumber(row.paid_amount),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function ensureSalaryPeriod(year, month) {
  assertCloudReady()
  const y = Number(year)
  const m = Number(month)

  const { data: existing, error: selectError } = await supabase
    .from('salary_periods')
    .select(PERIOD_SELECT)
    .eq('year', y)
    .eq('month', m)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message || 'Не удалось загрузить период')
  if (existing) return normalizePeriod(existing)

  const { data: created, error: insertError } = await supabase
    .from('salary_periods')
    .insert({ year: y, month: m, status: 'open' })
    .select(PERIOD_SELECT)
    .single()

  if (insertError) {
    // Race: another admin created the period
    const { data: again, error: againError } = await supabase
      .from('salary_periods')
      .select(PERIOD_SELECT)
      .eq('year', y)
      .eq('month', m)
      .maybeSingle()
    if (againError || !again) {
      throw new Error(insertError.message || 'Не удалось создать период')
    }
    return normalizePeriod(again)
  }

  return normalizePeriod(created)
}

export async function listSalaryRecordsForPeriod(periodId) {
  assertCloudReady()
  const { data, error } = await supabase
    .from('salary_records')
    .select(RECORD_SELECT)
    .eq('period_id', periodId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message || 'Не удалось загрузить расчёты')
  return (data ?? []).map(normalizeRecord).filter(Boolean)
}

/**
 * Авансы по списку record id: Map<recordId, { lineId, amount }>
 * Аванс хранится как salary_deductions.kind = 'advance'.
 */
export async function listAdvanceLinesForRecords(recordIds) {
  assertCloudReady()
  const byRecordId = new Map()
  const ids = (recordIds || []).filter(Boolean)
  if (ids.length === 0) return byRecordId

  const { data, error } = await supabase
    .from('salary_deductions')
    .select(LINE_SELECT)
    .in('record_id', ids)
    .eq('kind', 'advance')

  if (error) throw new Error(error.message || 'Не удалось загрузить авансы')

  for (const row of data ?? []) {
    const line = normalizeLine(row)
    if (!line) continue
    const prev = byRecordId.get(line.recordId)
    if (!prev) {
      byRecordId.set(line.recordId, { lineId: line.id, amount: line.amount })
      continue
    }
    byRecordId.set(line.recordId, {
      lineId: prev.lineId,
      amount: toMoneyNumber(prev.amount + line.amount),
    })
  }

  return byRecordId
}

export async function listAdvanceLinesByPeriod(periodId) {
  const records = await listSalaryRecordsForPeriod(periodId)
  return listAdvanceLinesForRecords(records.map((row) => row.id))
}

export async function ensureSalaryRecord(periodId, employeeId) {
  assertCloudReady()
  const empId = Number(employeeId)

  const { data: existing, error: selectError } = await supabase
    .from('salary_records')
    .select(RECORD_SELECT)
    .eq('period_id', periodId)
    .eq('employee_id', empId)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message || 'Не удалось загрузить расчёт')
  if (existing) return normalizeRecord(existing)

  const { data: created, error: insertError } = await supabase
    .from('salary_records')
    .insert({
      period_id: periodId,
      employee_id: empId,
      status: 'draft',
      base_salary: 0,
      shift_rate: 0,
      work_hours: 0,
      work_shifts: 0,
      total_allowances: 0,
      total_deductions: 0,
      total_payable: 0,
      paid_amount: 0,
    })
    .select(RECORD_SELECT)
    .single()

  if (insertError) {
    const { data: again, error: againError } = await supabase
      .from('salary_records')
      .select(RECORD_SELECT)
      .eq('period_id', periodId)
      .eq('employee_id', empId)
      .maybeSingle()
    if (againError || !again) {
      throw new Error(insertError.message || 'Не удалось создать расчёт')
    }
    return normalizeRecord(again)
  }

  return normalizeRecord(created)
}

export async function getSalaryRecordBundle(recordId) {
  assertCloudReady()

  const { data: record, error: recordError } = await supabase
    .from('salary_records')
    .select(RECORD_SELECT)
    .eq('id', recordId)
    .maybeSingle()

  if (recordError) throw new Error(recordError.message || 'Не удалось загрузить расчёт')
  if (!record) throw new Error('Расчёт не найден')

  const { data: period, error: periodError } = await supabase
    .from('salary_periods')
    .select(PERIOD_SELECT)
    .eq('id', record.period_id)
    .maybeSingle()

  if (periodError) throw new Error(periodError.message || 'Не удалось загрузить период')

  const [{ data: allowances, error: allowError }, { data: deductions, error: dedError }] =
    await Promise.all([
      supabase
        .from('salary_allowances')
        .select(LINE_SELECT)
        .eq('record_id', recordId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('salary_deductions')
        .select(LINE_SELECT)
        .eq('record_id', recordId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

  if (allowError) throw new Error(allowError.message || 'Не удалось загрузить начисления')
  if (dedError) throw new Error(dedError.message || 'Не удалось загрузить удержания')

  return {
    record: normalizeRecord(record),
    period: normalizePeriod(period),
    allowances: (allowances ?? []).map(normalizeLine).filter(Boolean),
    deductions: (deductions ?? []).map(normalizeLine).filter(Boolean),
  }
}

async function recalculateAndPersistTotals(recordId) {
  const [{ data: allowances }, { data: deductions }, { data: record, error: recordError }] =
    await Promise.all([
      supabase.from('salary_allowances').select('amount').eq('record_id', recordId),
      supabase.from('salary_deductions').select('amount').eq('record_id', recordId),
      supabase.from('salary_records').select('base_salary').eq('id', recordId).single(),
    ])

  if (recordError) throw new Error(recordError.message || 'Не удалось пересчитать итог')

  const totals = computeSalaryTotals({
    baseSalary: record.base_salary,
    allowances: allowances ?? [],
    deductions: deductions ?? [],
  })

  const { data: updated, error } = await supabase
    .from('salary_records')
    .update({
      total_allowances: totals.totalAllowances,
      total_deductions: totals.totalDeductions,
      total_payable: totals.totalPayable,
    })
    .eq('id', recordId)
    .select(RECORD_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось сохранить итог')
  return normalizeRecord(updated)
}

export async function updateSalaryRecordFields(recordId, patch) {
  assertCloudReady()
  const payload = {}
  if (patch.status != null) payload.status = patch.status
  if (patch.baseSalary != null) payload.base_salary = toMoneyNumber(patch.baseSalary)
  if (patch.shiftRate != null) payload.shift_rate = toMoneyNumber(patch.shiftRate)
  if (patch.workHours != null) payload.work_hours = toMoneyNumber(patch.workHours)
  if (patch.workShifts != null) payload.work_shifts = toMoneyNumber(patch.workShifts)
  if (patch.paidAmount != null) payload.paid_amount = toMoneyNumber(patch.paidAmount)
  if (patch.notes != null) payload.notes = patch.notes

  if (Object.keys(payload).length === 0) {
    return getSalaryRecordBundle(recordId).then((b) => b.record)
  }

  const { error } = await supabase
    .from('salary_records')
    .update(payload)
    .eq('id', recordId)

  if (error) throw new Error(error.message || 'Не удалось сохранить расчёт')

  if (patch.baseSalary != null) {
    return recalculateAndPersistTotals(recordId)
  }

  const { data, error: selectError } = await supabase
    .from('salary_records')
    .select(RECORD_SELECT)
    .eq('id', recordId)
    .single()

  if (selectError) throw new Error(selectError.message || 'Не удалось загрузить расчёт')
  return normalizeRecord(data)
}

/**
 * Для сменщиков: base_salary = ставка × подтверждённые смены, work_shifts = completed.
 * Окладники не трогаем (полный оклад уже в base_salary).
 */
export async function syncShiftBasedEarnedBase(record, employee, shiftStats) {
  assertCloudReady()
  if (!record?.id || !isPayrollShiftBased(employee)) return record

  const earnedBase = computePayrollEarnedBase(record, employee, shiftStats)
  const completed = Number(shiftStats?.completed) || 0
  const sameBase = toMoneyNumber(record.baseSalary) === earnedBase
  const sameShifts = toMoneyNumber(record.workShifts) === completed
  if (sameBase && sameShifts) return record

  return updateSalaryRecordFields(record.id, {
    baseSalary: earnedBase,
    workShifts: completed,
  })
}

export async function addSalaryAllowance(recordId, { kind, title, amount, comment }) {
  assertCloudReady()
  const { data: maxRow } = await supabase
    .from('salary_allowances')
    .select('sort_order')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('salary_allowances')
    .insert({
      record_id: recordId,
      kind: kind || 'custom',
      title: String(title || '').trim() || 'Начисление',
      amount: toMoneyNumber(amount),
      comment: comment?.trim() || null,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select(LINE_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось добавить начисление')
  await recalculateAndPersistTotals(recordId)
  return normalizeLine(data)
}

export async function updateSalaryAllowance(lineId, recordId, patch) {
  assertCloudReady()
  const payload = {}
  if (patch.title != null) payload.title = String(patch.title).trim() || 'Начисление'
  if (patch.amount != null) payload.amount = toMoneyNumber(patch.amount)
  if (patch.comment != null) payload.comment = String(patch.comment).trim() || null
  if (patch.kind != null) payload.kind = patch.kind

  const { data, error } = await supabase
    .from('salary_allowances')
    .update(payload)
    .eq('id', lineId)
    .select(LINE_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось обновить начисление')
  await recalculateAndPersistTotals(recordId)
  return normalizeLine(data)
}

export async function deleteSalaryAllowance(lineId, recordId) {
  assertCloudReady()
  const { error } = await supabase.from('salary_allowances').delete().eq('id', lineId)
  if (error) throw new Error(error.message || 'Не удалось удалить начисление')
  return recalculateAndPersistTotals(recordId)
}

export async function addSalaryDeduction(recordId, { kind, title, amount, comment }) {
  assertCloudReady()
  const { data: maxRow } = await supabase
    .from('salary_deductions')
    .select('sort_order')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('salary_deductions')
    .insert({
      record_id: recordId,
      kind: kind || 'custom',
      title: String(title || '').trim() || 'Удержание',
      amount: toMoneyNumber(amount),
      comment: comment?.trim() || null,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select(LINE_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось добавить удержание')
  await recalculateAndPersistTotals(recordId)
  return normalizeLine(data)
}

export async function updateSalaryDeduction(lineId, recordId, patch) {
  assertCloudReady()
  const payload = {}
  if (patch.title != null) payload.title = String(patch.title).trim() || 'Удержание'
  if (patch.amount != null) payload.amount = toMoneyNumber(patch.amount)
  if (patch.comment != null) payload.comment = String(patch.comment).trim() || null
  if (patch.kind != null) payload.kind = patch.kind

  const { data, error } = await supabase
    .from('salary_deductions')
    .update(payload)
    .eq('id', lineId)
    .select(LINE_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Не удалось обновить удержание')
  await recalculateAndPersistTotals(recordId)
  return normalizeLine(data)
}

export async function deleteSalaryDeduction(lineId, recordId) {
  assertCloudReady()
  const { error } = await supabase.from('salary_deductions').delete().eq('id', lineId)
  if (error) throw new Error(error.message || 'Не удалось удалить удержание')
  return recalculateAndPersistTotals(recordId)
}

/** Создать / обновить / удалить аванс и вернуть пересчитанный record */
export async function upsertSalaryAdvance(recordId, amount) {
  assertCloudReady()
  const nextAmount = toMoneyNumber(amount)

  const { data: existing, error: selectError } = await supabase
    .from('salary_deductions')
    .select(LINE_SELECT)
    .eq('record_id', recordId)
    .eq('kind', 'advance')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message || 'Не удалось загрузить аванс')

  if (nextAmount <= 0) {
    if (existing?.id) {
      return deleteSalaryDeduction(existing.id, recordId)
    }
    return recalculateAndPersistTotals(recordId)
  }

  if (existing?.id) {
    await updateSalaryDeduction(existing.id, recordId, {
      kind: 'advance',
      title: 'Аванс',
      amount: nextAmount,
    })
  } else {
    await addSalaryDeduction(recordId, {
      kind: 'advance',
      title: 'Аванс',
      amount: nextAmount,
      comment: '',
    })
  }

  const { data, error } = await supabase
    .from('salary_records')
    .select(RECORD_SELECT)
    .eq('id', recordId)
    .single()

  if (error) throw new Error(error.message || 'Не удалось загрузить расчёт')
  return normalizeRecord(data)
}

export async function saveSalaryRecordFull(recordId, {
  status,
  baseSalary,
  workHours,
  workShifts,
  notes,
}) {
  assertCloudReady()
  const { error } = await supabase
    .from('salary_records')
    .update({
      status,
      base_salary: toMoneyNumber(baseSalary),
      work_hours: toMoneyNumber(workHours),
      work_shifts: toMoneyNumber(workShifts),
      notes: notes?.trim() || null,
    })
    .eq('id', recordId)

  if (error) throw new Error(error.message || 'Не удалось сохранить расчёт')
  return recalculateAndPersistTotals(recordId)
}
