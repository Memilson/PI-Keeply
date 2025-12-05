import { redirect } from 'next/navigation'

export default function Home() {
  // Send the root route to the main marketing page
  redirect('/landingPage/landing')
}
