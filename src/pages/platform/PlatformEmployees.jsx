import { useSession } from '../../context/SessionContext'
import { canManageAdmin } from '../../utils/auth'
import ModulePlaceholder from './ModulePlaceholder'

/** Сотрудники — заготовка с ссылкой на управление для админов */
export default function PlatformEmployees() {
  const { user } = useSession()
  const isAdmin = canManageAdmin(user?.role)

  return (
    <ModulePlaceholder
      title="Список сотрудников"
      description="Добавление, редактирование и деактивация сотрудников магазина."
      hint={
        isAdmin
          ? 'Полное управление сотрудниками доступно в админ-панели Academy. Раздел платформы будет расширен позже.'
          : 'Раздел в разработке'
      }
      actionLabel={isAdmin ? 'Управление сотрудниками' : undefined}
      actionTo={isAdmin ? '/admin' : undefined}
    />
  )
}
