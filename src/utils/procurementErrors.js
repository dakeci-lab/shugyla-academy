import { toUserErrorMessage } from './userErrorMessage'

/**
 * Ошибки закупа → человеческий русский текст.
 *
 * Guard-триггеры и RLS-политики отвечают английскими техническими фразами
 * («procurement_snapshot_items: fact columns are immutable», «permission denied
 * for table …»). Показывать такое закупщику нельзя: он не поймёт, что делать,
 * и решит, что платформа сломалась. Каждое известное правило переводим в
 * действие, а не в констатацию.
 *
 * Новые RPC (procurement_cancel_order, procurement_return_order_to_draft) уже
 * отвечают по-русски — они проходят дальше без изменений.
 */

const RULES = [
  {
    test: /fact columns are immutable/i,
    message:
      'Фактические данные снимка изменить нельзя. Если остатки устарели — обновите снимок из UMAG.',
  },
  {
    test: /planning fields editable only|working snapshot|status is ready/i,
    message:
      'Этот снимок больше не рабочий: по нему уже сформированы заказы. Обновите снимок, чтобы менять количества.',
  },
  {
    test: /generated order rows are immutable|generated_purchase_order_id is immutable/i,
    message: 'По этому товару заказ уже создан — количество в нём изменить нельзя.',
  },
  {
    test: /permission denied for table procurement_snapshot/i,
    message: 'Недостаточно прав для изменения плана закупа. Обратитесь к администратору.',
  },
  {
    test: /permission denied for table (purchase_orders|receiving_documents)/i,
    message: 'Недостаточно прав для изменения заказа. Обратитесь к администратору.',
  },
  {
    test: /violates row-level security|row level security/i,
    message: 'Недостаточно прав для этого действия. Обратитесь к администратору.',
  },
  {
    test: /could not obtain lock|deadlock detected/i,
    message: 'Заказ сейчас изменяет кто-то другой. Обновите страницу и попробуйте снова.',
  },
]

function extract(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return [error.message, error.details, error.hint].filter(Boolean).join(' ')
}

export function toProcurementUserMessage(error, fallback = 'Не удалось выполнить действие.') {
  const raw = extract(error)

  for (const rule of RULES) {
    if (rule.test.test(raw)) {
      if (raw) console.error('[ProcurementError]', raw, error)
      return rule.message
    }
  }

  // Всё остальное — через общий фильтр: он пропускает русские бизнес-сообщения
  // и заменяет технические английские фразы на fallback.
  return toUserErrorMessage(error, fallback)
}
