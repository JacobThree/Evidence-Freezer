import './globals.css'

export const metadata = {
  title: 'Vulnerable App',
  description: 'Target vulnerable app',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
