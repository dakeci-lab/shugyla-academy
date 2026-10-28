/** Происхождение заказа: «аналитический» — из планирования закупа, «простой» — созданный вручную. */
export const PROCUREMENT_WORKFLOW_MODE = {
  SIMPLE: 'simple',
  ANALYTICS: 'analytics',
}

export function getWorkflowMode(entity) {
  return entity?.workflowMode ?? entity?.workflow_mode ?? PROCUREMENT_WORKFLOW_MODE.ANALYTICS
}

export function isSimpleWorkflow(entity) {
  return getWorkflowMode(entity) === PROCUREMENT_WORKFLOW_MODE.SIMPLE
}
