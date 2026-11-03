import { useEffect, useRef, useState } from 'react'
import { CancelDocIcon, CheckIcon, MoreIcon, TrashIcon } from '../../../components/icons/PlatformIcons'
import './PurchaseDocumentPhoneActions.css'

/**
 * Document actions in the phone header (like UMAG): a draft has a trash can and a check mark, a saved document a
 * «cancel» icon; the comment sits in the «⋯» menu. «Скачать» is not here: it is the green button of the bottom bar.
 * The handlers are read from `handlersRef` at click time, so the header node can stay stable between renders.
 */
export default function PurchaseDocumentPhoneActions({
  handlersRef,
  busy,
  showSave,
  showDelete,
  showCancel,
  commentLabel,
  hasComment,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const call = (name, ...args) => () => {
    setOpen(false)
    handlersRef.current?.[name]?.(...args)
  }

  const hasMenu = Boolean(commentLabel)

  return (
    <div className="pdoc-phone-actions" ref={rootRef}>
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
      {hasMenu ? (
        <div className="pdoc-phone-actions__menu-wrap">
          <button
            type="button"
            className="platform-mobile-header__icon-btn"
            aria-label="Ещё"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <MoreIcon size={20} />
            {hasComment ? <span className="pdoc-phone-actions__dot" aria-hidden="true" /> : null}
          </button>
          {open ? (
            <div className="pdoc-phone-actions__menu" role="menu">
              {commentLabel ? (
                <button type="button" role="menuitem" disabled={busy} onClick={call('comment')}>
                  {commentLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
