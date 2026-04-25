/**
 * TallySettings — Phase 6F
 *
 * SEC-056 (LOW): Save action currently calls toast.success with a "local only — API endpoint
 * pending" message. This is intentional — AccountingService does not yet expose
 * PATCH /accounting/config/tally. When that endpoint ships, replace the toast.success
 * stub on the Save button with a useMutation calling settingsApi.updateTallySettings().
 * Track in backlog: "Wire TallySettings save to AccountingService API".
 */
import { useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'

export function TallySettings() {
  const [enabled, setEnabled] = useState(false)
  const [includeGst, setIncludeGst] = useState(true)
  const [includeOpeningBalances, setIncludeOpeningBalances] = useState(true)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Tally Integration</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Configure Tally XML export feature. Feature-flagged off by default.
        </p>
      </div>

      {/* Master toggle */}
      <Card>
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label="Enable Tally Export"
          description="Allow users to export financial data in Tally-compatible XML format. When enabled, export options appear in user-facing Reports section."
          size="lg"
        />
      </Card>

      {/* Export configuration */}
      <Card className={!enabled ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader title="Export Configuration" />
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Tally Export Format Version</label>
            <select
              disabled={!enabled}
              className="w-full h-11 rounded-lg border border-neutral-300 bg-white text-base px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
              aria-label="Tally format version"
            >
              <option>Tally ERP 9 (XML)</option>
              <option>Tally Prime (XML)</option>
              <option>Both</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Default Journal Format</label>
            <select
              disabled={!enabled}
              className="w-full h-11 rounded-lg border border-neutral-300 bg-white text-base px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
              aria-label="Journal format"
            >
              <option>Double Entry</option>
              <option>Single Entry</option>
            </select>
          </div>

          <Toggle
            checked={includeGst}
            onChange={setIncludeGst}
            label="Include GST data in Tally XML"
            disabled={!enabled}
          />

          <Toggle
            checked={includeOpeningBalances}
            onChange={setIncludeOpeningBalances}
            label="Include opening balances"
            disabled={!enabled}
          />

          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Default company name in export</label>
            <select
              disabled={!enabled}
              className="w-full h-11 rounded-lg border border-neutral-300 bg-white text-base px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
              aria-label="Company name source"
            >
              <option>From business profile</option>
              <option>Manual override</option>
            </select>
          </div>
        </div>
      </Card>

      {/* File naming */}
      <Card className={!enabled ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader title="Export File Naming" />
        <div className="space-y-4">
          <Input
            label="File Name Prefix"
            defaultValue="SnapAccount_Tally_Export"
            disabled={!enabled}
            hint="Files will be named: SnapAccount_Tally_Export_YYYYMMDD.xml"
          />
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Date Format in Filename</label>
            <select
              disabled={!enabled}
              className="w-full h-11 rounded-lg border border-neutral-300 bg-white text-base px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none disabled:bg-neutral-50 disabled:text-neutral-400"
              aria-label="Date format in filename"
            >
              <option>YYYYMMDD</option>
              <option>DD-MM-YYYY</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary" onClick={() => toast.success('Tally settings saved (local only — API endpoint pending)')}>
          Save Tally Settings
        </Button>
      </div>
    </div>
  )
}
