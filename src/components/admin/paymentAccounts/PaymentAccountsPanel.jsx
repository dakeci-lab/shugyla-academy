import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'
import { DelayedLoadingSkeleton } from '../../loading/LoadingSkeleton'
import { usePaymentAccountsData } from './usePaymentAccountsData'
import { usePaymentAccountEditor } from './usePaymentAccountEditor'
import '../RolesAccessSection.css'
import '../admin-shared.css'
import './PaymentAccountsPanel.css'

export default function PaymentAccountsPanel() {
  const { accounts, loading, error, isMigrationError, reload } = usePaymentAccountsData()
  const editor = usePaymentAccountEditor({ accounts, onSaved: reload })

  return (
    <div className="payment-accounts-panel">
      <div className="roles-access__head">
        <div>
          <p className="admin-panel-card__desc">
            Способы оплаты поставщикам: наличные, переводы, отдельные счета. Используется в
            карточке поставщика.
          </p>
        </div>
        <Can permission={PERMISSION_CODES.PAYMENT_ACCOUNTS_MANAGE}>
          <button type="button" className="btn btn--primary" onClick={editor.openCreate}>
            Добавить счёт
          </button>
        </Can>
      </div>

      {loading ? (
        <DelayedLoadingSkeleton variant="table" count={4} />
      ) : error ? (
        <div className="roles-access__empty">
          <p className={isMigrationError ? 'roles-access__hint' : 'admin-form__error'}>{error}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={reload}>
            Повторить загрузку
          </button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="roles-access__empty">
          <p className="roles-access__hint">Счета оплаты пока не созданы.</p>
          <Can permission={PERMISSION_CODES.PAYMENT_ACCOUNTS_MANAGE}>
            <button type="button" className="btn btn--primary btn--sm" onClick={editor.openCreate}>
              Добавить счёт
            </button>
          </Can>
        </div>
      ) : (
        <div className="roles-access__table-wrap">
          <table className="admin-table roles-access__table">
            <thead>
              <tr>
                <th>Счёт</th>
                <th>Статус</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <div className="roles-access__role-name">{account.name}</div>
                    {account.description && (
                      <div className="roles-access__role-desc">{account.description}</div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`roles-access__status${account.isActive ? ' roles-access__status--active' : ''}`}
                    >
                      {account.isActive ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td>
                    <div className="roles-access__actions">
                      <Can permission={PERMISSION_CODES.PAYMENT_ACCOUNTS_MANAGE}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => editor.openEdit(account)}
                        >
                          Редактировать
                        </button>
                      </Can>
                      <Can permission={PERMISSION_CODES.PAYMENT_ACCOUNTS_MANAGE}>
                        {account.isActive ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => editor.handleDeactivate(account)}
                          >
                            Деактивировать
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => editor.handleActivate(account)}
                          >
                            Активировать
                          </button>
                        )}
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor.editorModal}
    </div>
  )
}
