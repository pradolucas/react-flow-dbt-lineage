-- advanced_script_1.sql
SET SEARCH_PATH to public;

CREATE TABLE customer_order_details
WITH (appendonly=true, orientation=column, compresslevel=5)
AS
WITH customer_base AS (
  SELECT
    c.customer_id,
    c.profile_data ->> 'fullName' AS full_name,
    c.profile_data ->> 'contact' AS contact_email,
    (c.profile_data -> 'address' ->> 'city') AS city
  FROM raw_data.customer_profiles AS c
  WHERE (c.profile_data ->> 'isActive')::boolean = true
),

order_summary AS (
  SELECT
    o.user_id,
    COUNT(o.id) as number_of_orders,
    SUM(o.amount) as total_revenue,
    MAX(o.order_date) as last_order_date
  FROM raw_data.orders AS o
  GROUP BY o.user_id
)
SELECT
  cb.customer_id,
  cb.full_name,
  cb.contact_email,
  os.number_of_orders,
  os.total_revenue,
  os.last_order_date,
  row_to_json(cb.*) as customer_snapshot
  cb.*

FROM customer_base cb
JOIN order_summary os ON cb.customer_id = os.user_id;

