-- Recruitment: employee role on vacancy + candidate status questionable
alter table academy_vacancies add column if not exists employee_role text;

update academy_vacancies
set employee_role = role
where employee_role is null;

update academy_candidates
set status = 'questionable'
where status = 'maybe';

alter table academy_candidates drop constraint if exists academy_candidates_status_check;

alter table academy_candidates add constraint academy_candidates_status_check
  check (status in (
    'new', 'suitable', 'questionable', 'maybe', 'rejected', 'invited',
    'interview_passed', 'intern', 'trainee', 'hired'
  ));
