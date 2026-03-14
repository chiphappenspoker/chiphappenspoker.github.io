import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavMenu } from './NavMenu';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ openSettingsModal: vi.fn() }),
}));

describe('NavMenu', () => {
  it('renders menu button with aria-label', () => {
    render(<NavMenu />);
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
  });

  it('shows dropdown with all nav links when menu is opened', () => {
    render(<NavMenu />);
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));

    expect(screen.getByRole('link', { name: /payout calculator/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /side pot calculator/i })).toHaveAttribute('href', '/side-pot');
    expect(screen.getByRole('link', { name: /^history$/i })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute('href', '/leaderboard');
    expect(screen.getByRole('link', { name: /^stats$/i })).toHaveAttribute('href', '/stats');
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('uses player names in side pot link when provided', () => {
    render(<NavMenu playerNames={['Alice', 'Bob']} />);
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(screen.getByRole('link', { name: /side pot calculator/i })).toHaveAttribute(
      'href',
      '/side-pot?names=Alice,Bob'
    );
  });
});
