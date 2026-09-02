export const runtime = 'edge';

export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        textAlign: 'center',
        padding: '2rem',
        background: '#0f1117',
        color: '#fff',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div>
        <h1 style={{ fontSize: '4rem', margin: '0 0 1rem', color: '#60a5fa' }}>
          404
        </h1>
        <p style={{ fontSize: '1.2rem', margin: '0 0 2rem', color: '#9ca3af' }}>
          页面不存在或已被移除
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.75rem 2rem',
            background: '#60a5fa',
            color: '#fff',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          返回首页
        </a>
      </div>
    </div>
  );
}