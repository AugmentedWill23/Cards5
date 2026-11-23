-- READ ONLY. Run before cleanup to find which public tables actually use space.
-- total_bytes includes indexes and TOAST; dead_rows is an estimate.
select
  s.relname as table_name,
  pg_size_pretty(pg_total_relation_size(s.relid)) as total_size,
  pg_total_relation_size(s.relid) as total_bytes,
  pg_size_pretty(pg_relation_size(s.relid)) as heap_size,
  pg_size_pretty(pg_indexes_size(s.relid)) as index_size,
  s.n_live_tup as estimated_live_rows,
  s.n_dead_tup as estimated_dead_rows
from pg_stat_user_tables s
where s.schemaname='public'
order by pg_total_relation_size(s.relid) desc;
