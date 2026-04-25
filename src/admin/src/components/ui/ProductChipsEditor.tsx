/**
 * ProductChipsEditor — Phase 6C
 * List + add modal for loan products attached to a partner bank.
 * Each chip shows product name + min/max range; tap opens edit modal.
 */
import { useState } from 'react'
import { Plus, X, Edit2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Modal } from './Modal'
import { Input } from './Input'
import { Button } from './Button'
import { AmountDisplay } from './AmountDisplay'

export interface ProductChip {
  id?: string
  productName: string
  minAmount: number
  maxAmount: number
  tenureMonthsMin?: number
  tenureMonthsMax?: number
  interestRateMin?: number
  interestRateMax?: number
}

interface ProductChipItemProps {
  product: ProductChip
  onEdit: (p: ProductChip) => void
  onRemove: (p: ProductChip) => void
  readOnly?: boolean
}

function ProductChipItem({ product, onEdit, onRemove, readOnly }: ProductChipItemProps) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs group"
    >
      <span className="font-medium text-neutral-800">{product.productName}</span>
      <span className="text-neutral-400">·</span>
      <span className="text-neutral-600">
        <AmountDisplay amount={product.minAmount} format="compact" size="sm" /> – <AmountDisplay amount={product.maxAmount} format="compact" size="sm" />
      </span>
      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => onEdit(product)}
            aria-label={`Edit ${product.productName}`}
            className="ml-1 text-neutral-400 hover:text-brand-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-full"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(product)}
            aria-label={`Remove ${product.productName}`}
            className="text-neutral-400 hover:text-error-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500 rounded-full"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  )
}

interface ProductModalProps {
  initial?: ProductChip
  onSave: (p: ProductChip) => void
  onClose: () => void
}

function ProductModal({ initial, onSave, onClose }: ProductModalProps) {
  const [form, setForm] = useState<ProductChip>(
    initial ?? {
      productName: '',
      minAmount: 100000,
      maxAmount: 5000000,
      tenureMonthsMin: 12,
      tenureMonthsMax: 60,
      interestRateMin: 0,
      interestRateMax: 0,
    }
  )

  function setField<K extends keyof ProductChip>(key: K, value: ProductChip[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!form.productName.trim()) return
    onSave(form)
    onClose()
  }

  return (
    <Modal
      open
      title={initial ? t('admin.partnerBanks.product.edit') : t('admin.partnerBanks.product.add')}
      onClose={onClose}
    >
      <div className="space-y-4 p-1">
        <Input
          label={t('admin.partnerBanks.product.name')}
          value={form.productName}
          onChange={e => setField('productName', e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('admin.partnerBanks.product.minAmount')}
            type="number"
            value={form.minAmount}
            onChange={e => setField('minAmount', Number(e.target.value))}
          />
          <Input
            label={t('admin.partnerBanks.product.maxAmount')}
            type="number"
            value={form.maxAmount}
            onChange={e => setField('maxAmount', Number(e.target.value))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('admin.partnerBanks.product.tenureMin')}
            type="number"
            value={form.tenureMonthsMin ?? ''}
            onChange={e => setField('tenureMonthsMin', e.target.value ? Number(e.target.value) : undefined)}
          />
          <Input
            label={t('admin.partnerBanks.product.tenureMax')}
            type="number"
            value={form.tenureMonthsMax ?? ''}
            onChange={e => setField('tenureMonthsMax', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('admin.partnerBanks.product.rateMin')}
            type="number"
            step="0.01"
            value={form.interestRateMin ?? ''}
            onChange={e => setField('interestRateMin', e.target.value ? Number(e.target.value) : undefined)}
          />
          <Input
            label={t('admin.partnerBanks.product.rateMax')}
            type="number"
            step="0.01"
            value={form.interestRateMax ?? ''}
            onChange={e => setField('interestRateMax', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={!form.productName.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

interface ProductChipsEditorProps {
  products: ProductChip[]
  onChange: (products: ProductChip[]) => void
  readOnly?: boolean
  className?: string
}

export function ProductChipsEditor({ products, onChange, readOnly = false, className }: ProductChipsEditorProps) {
  const [editingProduct, setEditingProduct] = useState<ProductChip | null>(null)
  const [adding, setAdding] = useState(false)

  function handleEdit(p: ProductChip) {
    setEditingProduct(p)
  }

  function handleRemove(p: ProductChip) {
    onChange(products.filter(x => x !== p))
  }

  function handleSaveEdit(updated: ProductChip) {
    if (editingProduct) {
      onChange(products.map(x => (x === editingProduct ? updated : x)))
    }
    setEditingProduct(null)
  }

  function handleSaveAdd(newProduct: ProductChip) {
    onChange([...products, newProduct])
    setAdding(false)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-2">
        {products.map((p, i) => (
          <ProductChipItem
            key={p.id ?? i}
            product={p}
            onEdit={handleEdit}
            onRemove={handleRemove}
            readOnly={readOnly}
          />
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 py-1.5 text-xs text-brand-600',
              'hover:border-brand-500 hover:bg-brand-50 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
            )}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {t('admin.partnerBanks.product.addProduct')}
          </button>
        )}
      </div>

      {editingProduct && (
        <ProductModal
          initial={editingProduct}
          onSave={handleSaveEdit}
          onClose={() => setEditingProduct(null)}
        />
      )}
      {adding && (
        <ProductModal
          onSave={handleSaveAdd}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
