/**
 * Backend-driven navigation menu (gap #1 of the enhanced authz model).
 * The sidebar is served from auth.navigation_item + auth.menu_permission and
 * permission-filtered server-side; the frontend is a pure consumer. See
 * `GET /auth/me/menu` (AuthService GetMyMenuQuery).
 */
import { z } from 'zod'
import api from './api'

// Recursive tree schema. z.lazy handles the self-reference for nested children.
export interface MenuNode {
  key: string
  label: string
  iconKey: string | null
  url: string
  children: MenuNode[]
}

export const MenuNodeSchema: z.ZodType<MenuNode> = z.lazy(() =>
  z.object({
    key: z.string(),
    label: z.string(),
    iconKey: z.string().nullable(),
    url: z.string(),
    children: z.array(MenuNodeSchema),
  }),
)

const MenuTreeSchema = z.array(MenuNodeSchema)

/** Fetches the current user's permission-filtered navigation tree. */
export async function getMyMenu(): Promise<MenuNode[]> {
  const res = await api.get('/auth/me/menu')
  return MenuTreeSchema.parse(res.data)
}

// ── Menu Management (admin CRUD over the navigation catalog) ────────────────

export const NavigationItemAdminSchema = z.object({
  id: z.string(),
  key: z.string(),
  parentId: z.string().nullable(),
  label: z.string(),
  iconKey: z.string().nullable(),
  url: z.string(),
  displayOrder: z.number().int(),
  isActive: z.boolean(),
  permissionIds: z.array(z.string()),
})
export type NavigationItemAdmin = z.infer<typeof NavigationItemAdminSchema>

export interface NavigationItemInput {
  label: string
  url: string
  iconKey?: string | null
  displayOrder: number
  parentId?: string | null
  isActive?: boolean
  permissionIds: string[]
}

export async function listNavigationAdmin(): Promise<NavigationItemAdmin[]> {
  const res = await api.get('/auth/admin/navigation')
  return z.array(NavigationItemAdminSchema).parse(res.data)
}

export async function createNavigationItem(params: NavigationItemInput & { key: string }): Promise<{ id: string }> {
  const res = await api.post('/auth/admin/navigation', params)
  return res.data as { id: string }
}

export async function updateNavigationItem(id: string, params: NavigationItemInput): Promise<void> {
  await api.put(`/auth/admin/navigation/${id}`, params)
}

export async function deleteNavigationItem(id: string): Promise<void> {
  await api.delete(`/auth/admin/navigation/${id}`)
}
