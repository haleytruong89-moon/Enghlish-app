-- Row count of EVERY ordinary table in schema english: one line per table "english.<table> <count>". Numbers only, no row data.
select format('%s.%s', n.nspname, c.relname) || ' ' ||
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'english' and c.relkind in ('r', 'p')
order by c.relname;
