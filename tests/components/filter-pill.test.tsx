import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterPill } from '@/components/clients/shared/filter-pill';

describe('FilterPill (clients/shared)', () => {
  it('рендерить дітей + count', () => {
    render(
      <FilterPill active={false} onClick={() => {}} count={42}>
        Активні
      </FilterPill>,
    );
    expect(screen.getByText('Активні')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('викликає onClick при кліку', async () => {
    const onClick = vi.fn();
    render(
      <FilterPill active={false} onClick={onClick} count={5}>
        Фокус
      </FilterPill>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('показує dot коли передано dotClass', () => {
    const { container } = render(
      <FilterPill active={false} onClick={() => {}} count={3} dotClass="bg-rose-500">
        Втрачені
      </FilterPill>,
    );
    expect(container.querySelector('.bg-rose-500')).not.toBeNull();
  });

  it('активний стан застосовує emet-blue background', () => {
    const { container } = render(
      <FilterPill active={true} onClick={() => {}} count={5}>
        Активні
      </FilterPill>,
    );
    const button = container.querySelector('button');
    expect(button?.className).toMatch(/bg-emet-blue/);
  });
});
