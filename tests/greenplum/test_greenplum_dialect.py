import pytest
from sqlglot import parse_one, exp
from GreenplumDialect import Greenplum  # Your dialect code

# A list of SQL queries to test
GREENPLUM_TEST_CASES = [
    # Case 1: Distributed by a single column
    "CREATE TABLE sales (id INT) DISTRIBUTED BY (id)",
    
    # Case 2: Distributed by multiple columns
    "CREATE TABLE sales (id INT, sale_date DATE) DISTRIBUTED BY (id, sale_date)",
    
    # Case 3: Distributed randomly
    "CREATE TABLE logs (msg TEXT, ts TIMESTAMP) DISTRIBUTED RANDOMLY",

    "CREATE TABLE sales_compressed (id INT) WITH (appendonly=true, orientation=column) DISTRIBUTED BY (id)",
    "CREATE TABLE sales_archive (id INT, sale_date DATE) WITH (appendonly=true, compresslevel=5) DISTRIBUTED BY (id, sale_date)",
    "CREATE TABLE logs_fast (msg TEXT, ts TIMESTAMP) WITH (appendonly=false) DISTRIBUTED RANDOMLY",

    # Standard SQL check
    "CREATE TABLE users (user_id INT PRIMARY KEY, username VARCHAR(50))",
]

@pytest.mark.parametrize("sql_query", GREENPLUM_TEST_CASES)
def test_greenplum_dialect_roundtrip(sql_query: str):
    """
    Tests that the Greenplum dialect can perform a round-trip parse and
    generation for a given SQL query.
    
    Fails if the parse result is a generic `exp.Command`, indicating a
    partial parse.
    
    Args:
        sql_query: The SQL string to be tested.
    """
    try:
        # 1. Parse the SQL query
        parsed_expression = parse_one(sql_query, read=Greenplum)

        # 2. Check for a partial, generic parse result
        if isinstance(parsed_expression, exp.Command):
            pytest.fail(
                f"Parsing resulted in a generic Command, not a structured expression."
                f"\nQuery: {sql_query}"
            )

        # 3. Generate SQL from the parsed expression
        generated_sql = parsed_expression.sql(dialect=Greenplum)

        # 4. Assert that the output matches the input
        assert generated_sql.lower() == sql_query.lower()

    except Exception as e:
        pytest.fail(f"Round-trip test failed for query:\n{sql_query}\nError: {e}")
