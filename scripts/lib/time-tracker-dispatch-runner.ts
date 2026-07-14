import { createClient } from 'npm:@supabase/supabase-js@2.110.1'
import {
  buildPlannedShiftWindow,
  evaluateTimeTrackerRule,
  dispatchTimeTrackerNotifications,
  type ExistingAttempt,
  type ShiftRow,
  type ShiftWithEmployee,
  type TimeTrackerRule,
} from '../../supabase/functions/_shared/timeTrackerNotificationDispatch.ts'
import type { WebPushSendInput, WebPushSendResult } from '../../supabase/functions/_shared/webPushSender.ts'

type RunnerInput = {
  action: string
  supabaseUrl?: string
  serviceRoleKey?: string
  shift?: ShiftRow
  shiftWithEmployee?: ShiftWithEmployee
  rule?: TimeTrackerRule
  runAt?: string
  existingAttempts?: Array<{ attempt: number; createdAt: string }>
  rules?: TimeTrackerRule[]
  dryRun?: boolean
  shiftIds?: string[]
  mockSender?: 'accepted' | 'retryable' | 'subscription_expired' | 'noop'
}

const input = JSON.parse(await Deno.readTextFile(Deno.args[0])) as RunnerInput

function createMockSender(mode: RunnerInput['mockSender']): {
  sender: (input: WebPushSendInput) => Promise<WebPushSendResult>
  getCalls: () => number
} {
  let calls = 0
  const sender = async (_sendInput: WebPushSendInput): Promise<WebPushSendResult> => {
    calls += 1
    if (mode === 'noop') {
      throw new Error('mock_sender_should_not_be_called')
    }
    if (mode === 'retryable') {
      return { ok: false, statusCode: 503, classification: 'retryable_failure' }
    }
    if (mode === 'subscription_expired') {
      return { ok: false, statusCode: 410, classification: 'subscription_expired' }
    }
    return { ok: true, statusCode: 201, classification: 'accepted' }
  }
  return { sender, getCalls: () => calls }
}

let output: unknown

switch (input.action) {
  case 'buildWindow': {
    const window = buildPlannedShiftWindow(input.shift!)
    output = window
      ? {
          plannedStartAt: window.plannedStartAt.toISOString(),
          plannedEndAt: window.plannedEndAt.toISOString(),
        }
      : null
    break
  }

  case 'evaluate': {
    const window = buildPlannedShiftWindow(input.shiftWithEmployee!)
    if (!window) {
      output = null
      break
    }
    const existingAttempts: ExistingAttempt[] = (input.existingAttempts ?? []).map((row) => ({
      attempt: row.attempt,
      createdAt: new Date(row.createdAt),
    }))
    const match = evaluateTimeTrackerRule({
      shift: input.shiftWithEmployee!,
      rule: input.rule!,
      window,
      runAt: new Date(input.runAt!),
      existingAttempts,
    })
    output = match
    break
  }

  case 'dispatch': {
    const mock = createMockSender(input.mockSender ?? 'accepted')
    const serviceClient = createClient(input.supabaseUrl!, input.serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const result = await dispatchTimeTrackerNotifications({
      serviceClient,
      runAt: new Date(input.runAt!),
      rules: input.rules!,
      dryRun: input.dryRun ?? false,
      sender: mock.sender,
      shiftIds: input.shiftIds,
    })
    output = {
      ...result,
      senderCalls: mock.getCalls(),
    }
    break
  }

  default:
    throw new Error(`unknown_action:${input.action}`)
}

await Deno.writeTextFile(Deno.args[1], JSON.stringify(output))
