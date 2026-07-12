-- Диагностика: кандидаты, вероятно отклонённые автоматически из-за вакансии без вопросов (0/0).
-- ВНИМАНИЕ: в схеме нет поля «источник отклонения», поэтому массовое обновление НЕ выполняется автоматически.
-- Используйте кнопку «Вернуть в новые» в HR или выполните UPDATE вручную после проверки каждой строки.

SELECT
  c.id,
  c.full_name,
  c.phone,
  c.status,
  c.score_percent,
  c.total_score,
  c.max_score,
  c.submitted_at,
  v.title AS vacancy_title,
  v.slug AS vacancy_slug,
  COUNT(q.id) AS question_count
FROM academy_candidates c
JOIN academy_vacancies v ON v.id = c.vacancy_id
LEFT JOIN academy_candidate_questions q ON q.vacancy_id = v.id
WHERE c.status = 'rejected'
  AND COALESCE(c.max_score, 0) = 0
  AND COALESCE(c.score_percent, 0) = 0
GROUP BY c.id, v.id
HAVING COUNT(q.id) = 0
ORDER BY c.submitted_at DESC;

-- Пример ручного восстановления ОДНОГО кандидата после проверки:
-- UPDATE academy_candidates
-- SET status = 'new', score_percent = NULL, updated_at = now()
-- WHERE id = '<candidate_uuid>';

-- НЕ запускайте массовый UPDATE без проверки — часть записей могла быть отклонена администратором вручную.
