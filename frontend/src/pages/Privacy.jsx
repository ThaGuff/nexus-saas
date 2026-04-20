import { Link } from 'react-router-dom';

const C = { bg:'#04060e', green:'#0ff078', text:'#b8d0e8', sub:'#3a5068', card:'#080d1a', border:'#0f1e30' };

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:40 }}>
      <h2 style={{ color:'#e8f4ff', fontSize:18, fontWeight:700, marginBottom:16, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>{title}</h2>
      <div style={{ color:'#8ab0cc', fontSize:14, lineHeight:1.9 }}>{children}</div>
    </div>
  );
}

export default function Privacy() {
  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <nav style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 5%', borderBottom:`1px solid ${C.border}` }}>
        <Link to="/" style={{ color:C.green, fontWeight:800, fontSize:20, textDecoration:'none' }}>PLEX Trader</Link>
        <Link to="/login" style={{ color:C.text, textDecoration:'none', fontSize:14 }}>Sign In</Link>
      </nav>

      <div style={{ maxWidth:800, margin:'0 auto', padding:'60px 5%' }}>
        <h1 style={{ color:'#e8f4ff', fontSize:36, fontWeight:800, marginBottom:8 }}>Privacy Policy</h1>
        <p style={{ color:C.sub, fontSize:14, marginBottom:48 }}>Last updated: April 16, 2026</p>

        <Section title="1. Introduction">
          <p>NEXUS ("we," "our," or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our automated cryptocurrency trading platform and related services (the "Service").</p>
          <p style={{ marginTop:12 }}>By creating an account or using the Service, you consent to the data practices described in this policy. If you do not agree with this policy, please do not use our Service.</p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong style={{ color:'#e8f4ff' }}>Account Information:</strong> When you register, we collect your name, email address, and password (stored as a bcrypt hash — we never store your plain-text password).</p>
          <p style={{ marginTop:12 }}><strong style={{ color:'#e8f4ff' }}>Exchange API Keys:</strong> If you connect a cryptocurrency exchange, we store your API keys encrypted using AES-256-CBC encryption. We only request trade and read permissions — we never request withdrawal permissions. You maintain full custody of your funds.</p>
          <p style={{ marginTop:12 }}><strong style={{ color:'#e8f4ff' }}>Trading Data:</strong> We store trade history, bot settings, portfolio state, and performance metrics associated with your account.</p>
          <p style={{ marginTop:12 }}><strong style={{ color:'#e8f4ff' }}>Payment Information:</strong> Subscription payments are processed by Stripe, Inc. We do not store your credit card numbers or payment details. Stripe's privacy policy governs payment data handling.</p>
          <p style={{ marginTop:12 }}><strong style={{ color:'#e8f4ff' }}>Usage Data:</strong> We may collect information about how you interact with our Service, including log data, IP addresses, browser type, and device information for security and service improvement purposes.</p>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use collected information to:</p>
          <ul style={{ paddingLeft:20, marginTop:8 }}>
            {[
              'Provide, operate, and maintain the Service',
              'Process transactions and send related information',
              'Execute automated trading on your behalf using your exchange API keys',
              'Send administrative communications, including service updates and security alerts',
              'Respond to support inquiries',
              'Monitor and analyze usage patterns to improve the Service',
              'Detect, prevent, and address technical issues and fraudulent activity',
              'Comply with legal obligations',
            ].map(i => <li key={i} style={{ marginBottom:6 }}>{i}</li>)}
          </ul>
          <p style={{ marginTop:12 }}><strong style={{ color:'#e8f4ff' }}>We do not sell your personal information to third parties.</strong> We do not use your data for advertising purposes.</p>
        </Section>

        <Section title="4. Exchange API Key Security">
          <p>Your exchange API keys are encrypted at rest using AES-256-CBC encryption. Keys are decrypted only in memory during trade execution and are never logged, transmitted to third parties, or stored in plain text.</p>
          <p style={{ marginTop:12 }}>We strongly recommend:</p>
          <ul style={{ paddingLeft:20, marginTop:8 }}>
            {[
              'Creating API keys with trade and read permissions only — never withdrawal permissions',
              'Restricting API key access to our server IP addresses where your exchange allows it',
              'Regularly rotating your API keys',
              'Revoking API keys immediately if you suspect compromise',
            ].map(i => <li key={i} style={{ marginBottom:6 }}>{i}</li>)}
          </ul>
        </Section>

        <Section title="5. Data Sharing and Disclosure">
          <p>We may share your information only in these circumstances:</p>
          <ul style={{ paddingLeft:20, marginTop:8 }}>
            {[
              'Service Providers: Stripe (payment processing), hosting providers (Railway), and analytics services, bound by confidentiality obligations',
              'Legal Requirements: When required by law, court order, or governmental authority',
              'Business Transfers: In connection with a merger, acquisition, or sale of assets, with advance notice to users',
              'Protection of Rights: To protect the rights, property, or safety of NEXUS, our users, or others',
            ].map(i => <li key={i} style={{ marginBottom:8 }}>{i}</li>)}
          </ul>
          <p style={{ marginTop:12 }}>We do not share your trading data, portfolio information, or exchange credentials with any third parties for commercial purposes.</p>
        </Section>

        <Section title="6. Data Retention">
          <p>We retain your account data for as long as your account is active or as needed to provide services. Trade history is retained for up to 500 records per user. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law.</p>
        </Section>

        <Section title="7. Your Rights">
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul style={{ paddingLeft:20, marginTop:8 }}>
            {[
              'Access the personal information we hold about you',
              'Correct inaccurate personal information',
              'Request deletion of your personal information',
              'Object to or restrict processing of your personal information',
              'Data portability — receive your data in a structured, machine-readable format',
              'Withdraw consent where processing is based on consent',
            ].map(i => <li key={i} style={{ marginBottom:6 }}>{i}</li>)}
          </ul>
          <p style={{ marginTop:12 }}>To exercise these rights, contact us. We will respond within 30 days.</p>
        </Section>

        <Section title="8. Cookies">
          <p>We use only essential cookies required for authentication and session management. We do not use tracking cookies, advertising cookies, or third-party analytics cookies without consent. You can control cookie settings through your browser.</p>
        </Section>

        <Section title="9. Security">
          <p>We implement industry-standard security measures including HTTPS/TLS encryption for all data transmission, bcrypt password hashing, AES-256 encryption for sensitive credentials, rate limiting on authentication endpoints, and regular security reviews. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.</p>
        </Section>

        <Section title="10. Children's Privacy">
          <p>The Service is not directed to individuals under 18 years of age. We do not knowingly collect personal information from minors. If you believe we have collected information from a minor, please contact us immediately.</p>
        </Section>

        <Section title="11. International Data Transfers">
          <p>Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place for such transfers in accordance with applicable law.</p>
        </Section>

        <Section title="12. Changes to This Policy">
          <p>We may update this Privacy Policy periodically. We will notify you of material changes by email or prominent notice on the Service at least 30 days before the changes take effect. Continued use of the Service after changes constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="13. Contact Us">
          <p>For privacy-related questions, requests, or concerns, contact us at the email address associated with your account or through the support section of the Service. We aim to respond to all privacy inquiries within 5 business days.</p>
        </Section>
      </div>

      <footer style={{ borderTop:`1px solid ${C.border}`, padding:'24px 5%', textAlign:'center', color:C.sub, fontSize:12 }}>
        <Link to="/" style={{ color:C.green, textDecoration:'none', marginRight:24 }}>PLEX Trader</Link>
        <Link to="/terms" style={{ color:C.sub, textDecoration:'none', marginRight:24 }}>Terms of Service</Link>
        © 2026 NEXUS. All rights reserved.
      </footer>
    </div>
  );
}
