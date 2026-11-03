import { useEffect, useRef, useState } from 'react'
import { CheckIcon, MoreIcon, TrashIcon } from '../../../components/icons/PlatformIcons'
import './PurchaseDocumentPhoneActions.css'

/**
 * Document actions in the phone header (like UMAG): a trash can and a check mark are always at hand for a draft,
 * everything else («Скачать», «Комментарий», «Отменить») sits in the «⋯» menu.
 * The handlers are read from `handlersRef` at click time, so the header node can stay stable between renders.
 */
export default function PurchaseDocumentPhoneActions({
  handlersRef,
  busy,
  showSave,
  showDelete,
  showCancel,
  canExport,
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

  const hasMenu = canExport || Boolean(commentLabel) || showCancel

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
              {canExport ? (
                <>
                  <button type="button" role="menuitem" disabled={busy} onClick={call('export', 'xlsx')}>
                    Скачать Excel
                  </button>
                  <button type="button" role="menuitem" disabled={busy} onClick={call('export', 'pdf')}>
                    Скачать PDF
                  </button>
                </>
              ) : null}
              {showCancel ? (
                <button
                  type="button"
                  role="menuitem"
                  className="pdoc-phone-actions__danger"
                  disabled={busy}
                  onClick={call('cancel')}
                >
                  Отменить заказ
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
