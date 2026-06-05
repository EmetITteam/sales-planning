/**
 * GET /api/sentry-test — генерує тестову помилку для перевірки що Sentry
 * захоплює крах у Vercel runtime.
 *
 * Як перевірити: відкрий цей URL у браузері (буде 500). За 1-2 хв у Sentry
 * Issues з'явиться запис «Sentry test error from sales-planning».
 *
 * Безпечно видалити після підтвердження що моніторинг працює.
 */

export async function GET() {
  throw new Error('Sentry test error from sales-planning — це навмисна перевірка моніторингу');
}
