import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { getSuppliers } from '../../services/academyDataService'
import {
  SUPPLIER_STATUS,
  filterSuppliers,
} from '../../utils/supplierData'
import { ChevronDownIcon, SearchIcon } from '../icons/PlatformIcons'
import './SearchableSupplierSelect.css'

/**
 * Выпадающий список поставщиков с мгновенным поиском.
 * @param {object} props
 * @param {Array} [props.suppliers] — массив поставщиков (по умолчанию getSuppliers())
 * @param {string} [props.value] — id выбранного поставщика
 * @param {(supplierId: string, supplier: object|null) => void} props.onChange
 */
export default function SearchableSupplierSelect({
  suppliers: suppliersProp,
  value = '',
  onChange,
  placeholder = 'Выберите поставщика',
  searchPlaceholder = 'Поиск поставщика...',
  disabled = false,
  required = false,
  id: idProp,
  activeOnly = true,
}) {
  const autoId = useId()
  const controlId = idProp || autoId
  const listboxId = `${controlId}-listbox`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)
  const ignoreNextTriggerClickRef = useRef(false)

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const allSuppliers = useMemo(() => {
    const list = suppliersProp ?? getSuppliers()
    if (!activeOnly) return list
    return list.filter(
      (supplier) =>
        supplier.status === SUPPLIER_STATUS.ACTIVE || supplier.id === value
    )
  }, [suppliersProp, activeOnly, value])

  const filteredSuppliers = useMemo(
    () => filterSuppliers(allSuppliers, { search, status: 'all' }),
    [allSuppliers, search]
  )

  const selectedSupplier = useMemo(
    () => allSuppliers.find((supplier) => supplier.id === value) || null,
    [allSuppliers, value]
  )

  const close = useCallback(() => {
    setIsOpen(false)
    setSearch('')
    setHighlightedIndex(-1)
    searchRef.current?.blur()
    triggerRef.current?.blur()
  }, [])

  const open = useCallback(() => {
    if (disabled) return
    setIsOpen(true)
    setHighlightedIndex(-1)
  }, [disabled])

  const selectSupplier = useCallback(
    (supplier) => {
      onChange?.(supplier?.id || '', supplier || null)
      ignoreNextTriggerClickRef.current = true
      close()
    },
    [onChange, close]
  )

  useEffect(() => {
    if (!isOpen) return
    searchRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        close()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen, close])

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) return
    const item = listRef.current?.children[highlightedIndex]
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, isOpen])

  function handleTriggerKeyDown(event) {
    if (disabled) return

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        if (!isOpen) {
          open()
          setHighlightedIndex(event.key === 'ArrowDown' ? 0 : filteredSuppliers.length - 1)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (isOpen) return
        open()
        break
      case 'Escape':
        if (isOpen) {
          event.preventDefault()
          close()
        }
        break
      default:
        break
    }
  }

  function handleSearchKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((prev) => {
          if (filteredSuppliers.length === 0) return -1
          if (prev < filteredSuppliers.length - 1) return prev + 1
          return 0
        })
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((prev) => {
          if (filteredSuppliers.length === 0) return -1
          if (prev > 0) return prev - 1
          return filteredSuppliers.length - 1
        })
        break
      case 'Enter':
        event.preventDefault()
        if (highlightedIndex >= 0 && filteredSuppliers[highlightedIndex]) {
          selectSupplier(filteredSuppliers[highlightedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
      default:
        break
    }
  }

  function handleTriggerClick() {
    if (ignoreNextTriggerClickRef.current) {
      ignoreNextTriggerClickRef.current = false
      return
    }
    if (isOpen) close()
    else open()
  }

  function handleOptionPointerDown(event, supplier) {
    event.preventDefault()
    event.stopPropagation()
    selectSupplier(supplier)
  }

  function handleListKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  function handleDropdownClick(event) {
    event.stopPropagation()
  }

  const displayValue = selectedSupplier?.name || placeholder
  const hasSelection = Boolean(selectedSupplier)

  return (
    <div
      ref={rootRef}
      className={`searchable-supplier-select${isOpen ? ' searchable-supplier-select--open' : ''}${disabled ? ' searchable-supplier-select--disabled' : ''}`}
    >
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        className="searchable-supplier-select__trigger"
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-required={required || undefined}
      >
        <span
          className={`searchable-supplier-select__value${hasSelection ? '' : ' searchable-supplier-select__value--placeholder'}`}
        >
          {displayValue}
        </span>
        <span className="searchable-supplier-select__chevron" aria-hidden="true">
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {isOpen && (
        <div
          className="searchable-supplier-select__dropdown"
          onMouseDown={handleDropdownClick}
          onClick={handleDropdownClick}
        >
          <div className="searchable-supplier-select__search">
            <SearchIcon size={16} />
            <input
              ref={searchRef}
              type="search"
              className="searchable-supplier-select__search-input"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setHighlightedIndex(0)
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              aria-label={searchPlaceholder}
            />
          </div>

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="searchable-supplier-select__list"
            aria-labelledby={controlId}
            onKeyDown={handleListKeyDown}
          >
            {filteredSuppliers.length === 0 ? (
              <li className="searchable-supplier-select__empty" role="presentation">
                Поставщики не найдены
              </li>
            ) : (
              filteredSuppliers.map((supplier, index) => {
                const isSelected = supplier.id === value
                const isHighlighted = index === highlightedIndex

                return (
                  <li key={supplier.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`searchable-supplier-select__option${isSelected ? ' searchable-supplier-select__option--selected' : ''}${isHighlighted ? ' searchable-supplier-select__option--highlighted' : ''}`}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onMouseDown={(event) => handleOptionPointerDown(event, supplier)}
                    >
                      {supplier.name}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
