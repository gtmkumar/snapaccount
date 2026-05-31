/**
 * Maps backend navigation `iconKey` strings (lucide component names stored in
 * auth.navigation_item.icon_key) to the actual lucide-react components used by
 * the sidebar. Unknown / null keys fall back to a neutral dot icon so a new
 * menu item added in the DB still renders without a frontend change.
 */
import {
  LayoutDashboard, FileText, Receipt, FileSpreadsheet, CreditCard,
  MessageSquare, Users, Users2, Building2, BarChart3, PhoneCall,
  Settings, Shield, Globe, ListChecks, Database, ListTree, Circle,
} from 'lucide-react'

type IconComponent = React.FC<{ className?: string }>

const ICONS: Record<string, IconComponent> = {
  LayoutDashboard,
  FileText,
  Receipt,
  FileSpreadsheet,
  CreditCard,
  MessageSquare,
  Users,
  Users2,
  Building2,
  BarChart3,
  PhoneCall,
  Settings,
  Shield,
  Globe,
  ListChecks,
  Database,
  ListTree,
}

/** Resolves an icon key to a component, defaulting to a dot for unknown keys. */
export function navIcon(iconKey: string | null | undefined): IconComponent {
  return (iconKey && ICONS[iconKey]) || Circle
}

/** All known icon keys (for the Menu Management icon picker). */
export const NAV_ICON_KEYS = Object.keys(ICONS)
