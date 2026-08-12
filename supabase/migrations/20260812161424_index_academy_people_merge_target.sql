-- Cover the academy_people self-reference used when identities are merged.

create index if not exists idx_academy_people_merged_into_person
  on public.academy_people (merged_into_person_id)
  where merged_into_person_id is not null;
