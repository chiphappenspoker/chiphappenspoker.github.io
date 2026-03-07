'use client';

export default function ActivatePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{
        background: 'radial-gradient(1200px 700px at 80% -10%, #15151a 0%, var(--color-bg) 60%)',
        color: 'var(--color-text)',
      }}
    >
      <div className="card max-w-md w-full p-8">
        <h1 className="text-xl font-semibold mb-3" style={{ color: 'var(--color-accent)' }}>Account activated</h1>
        <p className="muted-text max-w-sm mx-auto">
          Your account is now active. Open the app to start using ChipHappens.
        </p>
      </div>
    </div>
  );
}
