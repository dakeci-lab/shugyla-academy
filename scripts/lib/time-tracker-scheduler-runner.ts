import { createClient } from 'npm:@supabase/supabase-js@2.110.1'
import { runTimeTrackerNotificationScheduler } from '../../supabase/functions/_shared/timeTrackerNotificationScheduler.ts'
import type { TimeTrackerRule } from '../../supabase/functions/_shared/timeTrackerNotificationDispatch.ts'
import type { WebPushSendInput, WebPushSendResult } from '../../supabase/functions/_shared/webPushSender.ts'

type RunnerInput = {
  action: string
  supabaseUrl?: string
  serviceRoleKey?: string
  runAt?: string
  dryRun?: boolean
  rulesOverride?: TimeTrackerRule[]
  shiftIds?: string[]
  mockSender?: 'accepted' | 'noop'
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
    return { ok: true, statusCode: 201, classification: 'accepted' }
  }
  return { sender, getCalls: () => calls }
}

let output: unknown

switch (input.action) {
  case 'scheduler': {
    const mock = createMockSender(input.mockSender ?? 'noop')
    const serviceClient = createClient(input.supabaseUrl!, input.serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const useMockSender = input.mockSender === 'accepted' || input.mockSender === 'noop'
    const result = await runTimeTrackerNotificationScheduler({
      serviceClient,
      runAt: new Date(input.runAt!),
      dryRun: input.dryRun ?? false,
      rulesOverride: input.rulesOverride,
      shiftIds: input.shiftIds,
      sender: useMockSender ? mock.sender : undefined,
    })
    output = {
      ...result,
      senderCalls: mock.getCalls(),
    }
    break
  }

  case 'loadEnabledRules': {
    const serviceClient = createClient(input.supabaseUrl!, input.serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const result = await runTimeTrackerNotificationScheduler({
      serviceClient,
      runAt: new Date(input.runAt ?? new Date().toISOString()),
      dryRun: true,
    })
    output = result
    break
  }

  default:
    throw new Error(`unknown_action:${input.action}`)
}

await Deno.writeTextFile(Deno.args[1], JSON.stringify(output))
