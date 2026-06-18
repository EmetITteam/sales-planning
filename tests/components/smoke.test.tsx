import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Smoke-тест: переконатися що Vitest + RTL + jsdom працюють.
// Якщо цей тест пройшов — інфраструктура готова до component-тестів clients-page/planning-form.
describe('Vitest infrastructure smoke', () => {
  it('renders a simple component', () => {
    render(<div>hello refactor</div>);
    expect(screen.getByText('hello refactor')).toBeInTheDocument();
  });

  it('jest-dom matchers працюють', () => {
    render(
      <button type="button" disabled>
        Click me
      </button>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
