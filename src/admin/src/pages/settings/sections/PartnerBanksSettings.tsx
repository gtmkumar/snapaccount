import { useState } from 'react'
import { Plus, Edit, Trash2, TestTube } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { AlertBanner } from '@/components/shared/AlertBanner'

const mockBanks = [
  { id: '1', name: 'HDFC Bank', type: 'Private', adapterType: 'REST JSON', status: 'Active', loanTypes: ['Business Loan', 'Working Capital'] },
  { id: '2', name: 'SBI', type: 'Public Sector', adapterType: 'REST XML', status: 'Active', loanTypes: ['Business Loan', 'MSME-Mudra'] },
  { id: '3', name: 'ICICI Bank', type: 'Private', adapterType: 'Manual Review', status: 'Inactive', loanTypes: ['Personal Loan'] },
]

export function PartnerBanksSettings() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [authType, setAuthType] = useState('api-key')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Partner Banks</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Configure partner bank integrations for loan applications. Adapter pattern — any bank added without code changes.
          </p>
        </div>
        <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowAddModal(true)}>
          Add Partner Bank
        </Button>
      </div>

      {/* Active banks */}
      <div className="space-y-4">
        {mockBanks.map((bank) => (
          <Card key={bank.id}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Bank logo placeholder */}
                <div className="h-12 w-20 rounded-lg bg-neutral-100 flex items-center justify-center border border-neutral-200">
                  <span className="text-xs font-bold text-neutral-500 truncate px-2">{bank.name}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-800">{bank.name}</span>
                    <Badge variant="neutral" size="sm">{bank.adapterType}</Badge>
                    <Badge variant={bank.status === 'Active' ? 'success' : 'neutral'} dot size="sm">
                      {bank.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-neutral-400">{bank.type}</span>
                    <span className="text-neutral-200">·</span>
                    <span className="text-xs text-neutral-500">
                      Loan types: {bank.loanTypes.join(', ')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" leftIcon={<TestTube className="h-3.5 w-3.5" />}>Test</Button>
                <Button variant="ghost" size="sm" leftIcon={<Edit className="h-3.5 w-3.5" />}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-error-600 hover:bg-error-50" leftIcon={<Trash2 className="h-3.5 w-3.5" />}>Remove</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AlertBanner
        type="info"
        title="Adding New Bank Adapters"
        description="Each bank uses the IPartnerBankAdapter interface. Contact the backend team to implement a new adapter for banks with non-standard APIs."
      />

      {/* Add bank modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Partner Bank"
        description="Configure a new partner bank for loan application integration"
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="secondary">Test Bank API</Button>
            <Button variant="primary">Save Bank</Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Bank identity */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 pb-2 border-b border-neutral-100">Bank Identity</h3>
            <div className="space-y-4">
              <Input label="Bank Name (display name for users)" placeholder="e.g., HDFC Bank" required />
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1.5">Bank Type</label>
                <select className="w-full h-11 rounded-lg border border-neutral-300 bg-white text-base px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none" aria-label="Bank type">
                  <option>Public Sector</option>
                  <option>Private</option>
                  <option>NBFC</option>
                  <option>Small Finance Bank</option>
                  <option>Cooperative</option>
                </select>
              </div>
              <Toggle checked={true} onChange={() => {}} label="Active" description="Visible to users for loan applications" />
            </div>
          </section>

          {/* API integration */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 pb-2 border-b border-neutral-100">API Integration</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1.5">Adapter Type</label>
                <select className="w-full h-11 rounded-lg border border-neutral-300 bg-white text-base px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none" aria-label="Adapter type">
                  <option>REST JSON (Standard)</option>
                  <option>REST XML</option>
                  <option>SOAP</option>
                  <option>Custom Webhook</option>
                  <option>Manual Review</option>
                </select>
              </div>
              <Input label="API Base URL" placeholder="https://api.bankname.com/loans/v1" />
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1.5">Authentication Type</label>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value)}
                  className="w-full h-11 rounded-lg border border-neutral-300 bg-white text-base px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                  aria-label="Authentication type"
                >
                  <option value="api-key">API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="basic">Basic Auth</option>
                  <option value="certificate">Certificate</option>
                </select>
              </div>

              {authType === 'api-key' && (
                <div className="space-y-3">
                  <Input label="API Key" type="password" placeholder="•••••••••" />
                  <Input label="API Key Header Name" placeholder="X-API-Key" />
                </div>
              )}
              {authType === 'oauth2' && (
                <div className="space-y-3">
                  <Input label="Client ID" placeholder="client_id" />
                  <Input label="Client Secret" type="password" placeholder="•••••••••" />
                  <Input label="Token URL" placeholder="https://auth.bank.com/token" />
                  <Input label="Scope" placeholder="loans:read loans:write" />
                </div>
              )}
              {authType === 'basic' && (
                <div className="space-y-3">
                  <Input label="Username" placeholder="api_user" />
                  <Input label="Password" type="password" placeholder="•••••••••" />
                </div>
              )}
            </div>
          </section>

          {/* Loan configuration */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-800 mb-4 pb-2 border-b border-neutral-100">Loan Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-2">Supported Loan Types</label>
                <div className="flex flex-wrap gap-3">
                  {['Business Loan', 'Working Capital', 'Personal Loan', 'MSME-Mudra'].map((type) => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="h-4 w-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500" aria-label={type} />
                      <span className="text-sm text-neutral-700">{type}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Min Loan Amount (₹)" type="number" placeholder="100000" />
                <Input label="Max Loan Amount (₹)" type="number" placeholder="50000000" />
                <Input label="Min Interest Rate (% p.a.)" type="number" step="0.1" placeholder="10.5" />
                <Input label="Max Interest Rate (% p.a.)" type="number" step="0.1" placeholder="18.0" />
              </div>
              <Input label="Average Decision Time" placeholder="e.g., 3-5 business days" />
            </div>
          </section>
        </div>
      </Modal>
    </div>
  )
}
