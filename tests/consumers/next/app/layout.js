import '@fhirq/themes/base.css';
import '@fhirq/themes/default.css';

export const metadata = { title: 'Consumer smoke: Next.js' };

export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
