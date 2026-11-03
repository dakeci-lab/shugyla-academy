import { CancelDocIcon, CheckIcon, TrashIcon } from '../../../components/icons/PlatformIcons'
import './PurchaseDocumentPhoneActions.css'

/**
 * Document actions in the phone header (like UMAG): a draft has a trash can and a check mark, a saved document a
 * «cancel» icon. Nothing else: the comment is its own collapsible block in the document, «Скачать» is the green
 * button of the bottom bar. The handlers are read from `handlersRef` at click time, so the header node stays stable.
 */
export default function PurchaseDocumentPhoneActions({ handlersRef, busy, showSave, showDelete, showCancel }) {
  const call = (name) => () => handlersRef.current?.[name]?.()

  return (
    <div className="pdoc-phone-actions">
      {showDelete ? (
        <button
          type="button"
          className="platform-mobile-header__icon-btn pdoc-phone-actions__delete"
          aria-label="Удалить"
          disabled={busy}
          onClick={call('remove')}
        >
          <TrashIcon size={20} />
        </button>
      ) : null}
      {showSave ? (
        <button
          type="button"
          className="platform-mobile-header__icon-btn pdoc-phone-actions__save"
          aria-label="Сохранить"
          disabled={busy}
          onClick={call('save')}
        >
          <CheckIcon size={22} />
        </button>
      ) : null}
      {showCancel ? (
        <button
          type="button"
          className="platform-mobile-header__icon-btn pdoc-phone-actions__cancel"
          aria-label="Отменить заказ"
          disabled={busy}
          onClick={call('cancel')}
        >
          <CancelDocIcon size={22} />
        </button>
      ) : null}
    </div>
  )
}
