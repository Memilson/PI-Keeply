'use client'

import { useAuth } from '@/contexts/AuthContext'

import { NavbarDashboard } from './NavbarDashboard'

export const DashboardNavbar = () => {
  const { user, signOut } = useAuth()

  return <NavbarDashboard user={user} signOut={signOut} />
}

