/**
 * One place for the wording of the order documents and sheets — the order card, the PDF and the Excel export, the planner's delivery field and the orders list.
 * Change a term here and every screen and file follows; do not retype these words in components or exporters.
 */
export const ORDER_LABELS = Object.freeze({
  documentTitle: 'Заказ поставщику',
  docNumber: 'Номер заказа',
  orderNum: 'Номер',
  supplier: 'Поставщик',
  orderDate: 'Дата заказа',
  delivery: 'Ожидаемая доставка',
  /** Narrow table column in the orders list. */
  deliveryShort: 'Доставка',
  createdBy: 'Создал',
  comment: 'Комментарий',
  number: '№',
  product: 'Товар',
  barcode: 'Штрихкод',
  qty: 'Кол-во',
  price: 'Цена закупки',
  amount: 'Сумма',
  totalItems: 'Итого позиций',
  totalAmount: 'Сумма заказа',
})

/** The planning sheet (what to order, per supplier). Shared words come from ORDER_LABELS. */
export const PLAN_LABELS = Object.freeze({
  documentTitle: 'План закупок',
  sheetName: 'План',
  number: ORDER_LABELS.number,
  product: ORDER_LABELS.product,
  barcode: ORDER_LABELS.barcode,
  supplier: ORDER_LABELS.supplier,
  orderQty: 'Заказ',
  period: 'Период',
  positions: 'Позиций',
})

/** The warehouse stock sheet. Shared words come from ORDER_LABELS. */
export const WAREHOUSE_LABELS = Object.freeze({
  sheetName: 'Склад',
  number: ORDER_LABELS.number,
  product: ORDER_LABELS.product,
  barcode: ORDER_LABELS.barcode,
  category: 'Категория',
  subcategory: 'Подкатегория',
  stock: 'Остаток',
  unit: 'Ед. изм.',
  purchasePrice: 'Закупочная цена',
  sellingPrice: 'Продажная цена',
  purchaseSum: 'Сумма закупки',
  sellingSum: 'Сумма продажи',
  total: 'Итого:',
})

/** «Заказ поставщику №1048»; без номера (черновик) — просто название документа. */
export function formatOrderTitle(number) {
  return number ? `${ORDER_LABELS.documentTitle} №${number}` : ORDER_LABELS.documentTitle
}
