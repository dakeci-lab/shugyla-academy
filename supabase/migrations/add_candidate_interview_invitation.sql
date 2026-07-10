-- Поля приглашения на собеседование для кандидатов

alter table academy_candidates
  add column if not exists interview_salutation text,
  add column if not exists interview_date date,
  add column if not exists interview_time time,
  add column if not exists interview_address text,
  add column if not exists interview_comment text,
  add column if not exists invitation_sent_at timestamptz;
