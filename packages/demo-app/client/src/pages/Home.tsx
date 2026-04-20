import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #e2e4e8',
        borderRadius: 10,
        padding: 40,
        maxWidth: 460,
        width: '100%',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            padding: '2px 10px',
            background: '#eef0f3',
            color: '#555',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            borderRadius: 4,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Example customer
          </div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#1a1a2e', fontWeight: 700 }}>
            BenefitsDesk
          </h1>
          <p style={{ margin: '6px 0 0', color: '#6c6f76', fontSize: 14 }}>
            Your employee benefits portal
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link to="/login" style={primaryButton}>Sign in</Link>
          <Link to="/signup" style={secondaryButton}>Create an account</Link>
          <Link to="/forgot" style={textLink}>
            Forgot password or email?
          </Link>
        </div>

        <div style={{
          marginTop: 32,
          padding: 14,
          background: '#f8f9fb',
          borderRadius: 6,
          fontSize: 12,
          color: '#6c6f76',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: '#1a1a2e' }}>About this app:</strong> BenefitsDesk is a
          fake B2B portal. It exists to demonstrate biometric account
          recovery powered by chickenScratch — sign up, forget your
          password, and use your signature to get back in.
        </div>
      </div>
    </div>
  );
}

const primaryButton: React.CSSProperties = {
  padding: '12px 20px',
  background: '#1a1a2e',
  color: '#fff',
  textDecoration: 'none',
  textAlign: 'center',
  borderRadius: 6,
  fontSize: 15,
  fontWeight: 600,
};

const secondaryButton: React.CSSProperties = {
  padding: '12px 20px',
  background: '#fff',
  color: '#1a1a2e',
  textDecoration: 'none',
  textAlign: 'center',
  borderRadius: 6,
  fontSize: 15,
  fontWeight: 600,
  border: '1px solid #d0d3d9',
};

const textLink: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 13,
  color: '#4a5fc1',
  textDecoration: 'none',
  padding: '4px 0',
};
