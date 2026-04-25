import { type ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

interface StubPageProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  features?: string[]
}

export function StubPage({ title, subtitle, icon, features }: StubPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<Badge variant="warning">Coming Soon</Badge>}
      />
      <Card className="text-center py-16">
        <div className="flex flex-col items-center gap-4">
          {icon && (
            <div className="h-16 w-16 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-500">
              {icon}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-neutral-800">{title}</p>
            <p className="text-sm text-neutral-500 mt-1 max-w-md">
              {subtitle ?? `The ${title} module is under active development. API integration and full implementation coming soon.`}
            </p>
          </div>
          {features && features.length > 0 && (
            <div className="text-left mt-4">
              <p className="text-sm font-medium text-neutral-700 mb-2">Planned features:</p>
              <ul className="space-y-1.5">
                {features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-neutral-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
