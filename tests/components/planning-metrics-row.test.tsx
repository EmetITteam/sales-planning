import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanningMetricsRow } from '@/components/planning/sections/planning-metrics-row';

describe('PlanningMetricsRow', () => {
  const baseProps = {
    planAmount: 10000,
    factAmount: 5000,
    expectedAmount: 6000,
    factPct: 50,
    expectedPct: 60,
    deviation: -10,
    passedWorkingDays: 10,
    periodEndDate: '2026-05-15',
    prevMonthFactAmount: 0,
    prevMonthPlanAmount: 0,
    forecasts: [],
    gapClosures: [],
  };

  it('рендерить всі 4 метрики', () => {
    render(<PlanningMetricsRow {...baseProps} />);
    expect(screen.getByText('План місяця')).toBeInTheDocument();
    expect(screen.getByText('Факт')).toBeInTheDocument();
    expect(screen.getByText('Відхилення')).toBeInTheDocument();
    // Очікуване label містить «10 р.д.»
    expect(screen.getByText(/Очікуване.*10 р\.д\./)).toBeInTheDocument();
  });

  it('показує "+" префікс при позитивному відхиленні', () => {
    render(<PlanningMetricsRow {...baseProps} deviation={15.5} />);
    expect(screen.getByText('+15.5%')).toBeInTheDocument();
  });

  it('показує "-" префікс при негативному відхиленні', () => {
    render(<PlanningMetricsRow {...baseProps} deviation={-8.3} />);
    expect(screen.getByText('-8.3%')).toBeInTheDocument();
  });

  it('показує subline "Заплановано" коли є forecast+gap', () => {
    render(
      <PlanningMetricsRow
        {...baseProps}
        forecasts={[
          { clientId1c: '1', clientName: 'X', forecastAmount: 2000, stage: '' as never, stageComment: '', stageDone: false, factAmount: 0, lastPurchaseDate: null, lastPurchaseAmount: 0, completed: false, manuallyAdded: false },
        ]}
      />,
    );
    expect(screen.getByText(/Заплановано:/)).toBeInTheDocument();
  });

  it('показує subline "Мин. міс." коли є prevMonthFactAmount', () => {
    render(
      <PlanningMetricsRow
        {...baseProps}
        prevMonthFactAmount={8000}
        prevMonthPlanAmount={10000}
      />,
    );
    expect(screen.getByText(/Мин\. міс\./)).toBeInTheDocument();
  });

  it('badge "ok" коли factPct >= expectedPct', () => {
    render(<PlanningMetricsRow {...baseProps} factPct={70} expectedPct={60} />);
    // Badge показує factPct
    const badges = screen.getAllByText(/70\.0%/);
    expect(badges.length).toBeGreaterThan(0);
  });
});
