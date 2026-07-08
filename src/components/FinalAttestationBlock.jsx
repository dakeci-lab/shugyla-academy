import { useState } from 'react'
import { getFinalAttestationStatus } from '../utils/testProgress'
import { TEST_TYPE } from '../utils/testData'
import TestRunner from './TestRunner'
import StatusBadge from './admin/StatusBadge'
import './FinalAttestationBlock.css'

/** Блок финальной аттестации в личном кабинете */
export default function FinalAttestationBlock({ userId, role }) {
  const [started, setStarted] = useState(false)
  const att = getFinalAttestationStatus(userId, role)

  if (!att.test && att.status === 'not_available') {
    return null
  }

  const test = att.test

  return (
    <section className="dashboard-page__section final-attestation">
      <h2 className="dashboard-page__heading">Финальная аттестация</h2>

      <div className="final-attestation__card">
        <div className="final-attestation__header">
          <div>
            <h3 className="final-attestation__title">{test?.title || 'Финальная аттестация'}</h3>
            {test?.description && (
              <p className="final-attestation__desc">{test.description}</p>
            )}
            {test && (
              <p className="final-attestation__meta">Проходной балл: {test.passingScore}%</p>
            )}
          </div>
          <StatusBadge label={att.label} type={att.type} />
        </div>

        {att.status === 'not_available' && (
          <p className="final-attestation__reason">
            {att.reason || 'Завершите все назначенные курсы, чтобы открыть аттестацию.'}
          </p>
        )}

        {att.status === 'passed' && (
          <div className="final-attestation__success">
            <p>Поздравляем! Вы прошли финальную аттестацию.</p>
            {att.best && <p>Ваш результат: {att.best.scorePercent}%</p>}
          </div>
        )}

        {(att.status === 'available' || att.status === 'failed') && !started && (
          <button type="button" className="btn btn--primary" onClick={() => setStarted(true)}>
            Начать аттестацию
          </button>
        )}

        {started && test && att.status !== 'passed' && (
          <TestRunner
            test={test}
            userId={userId}
            testType={TEST_TYPE.FINAL}
            disabled={att.status === 'not_available'}
            lockedMessage={att.reason}
            onComplete={() => setStarted(false)}
          />
        )}
      </div>
    </section>
  )
}
