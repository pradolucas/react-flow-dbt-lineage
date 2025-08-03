
from sqlglot import exp
from sqlglot.dialects.postgres import Postgres


class Distributed(exp.Expression):
    """
    A custom sqlglot Expression to represent the Greenplum `DISTRIBUTED` clause.

    This acts as a container, using boolean flags to differentiate between
    `DISTRIBUTED BY` and `DISTRIBUTED RANDOMLY`.
    """

    arg_types = {"this": True, "by": False, "randomly": False}


class Randomly(exp.Expression):
    """
    A custom sqlglot Expression used as a marker for `DISTRIBUTED RANDOMLY`.
    """

    arg_types = {}


class Greenplum(Postgres):
    """
    Defines the Greenplum dialect for sqlglot, adding support for parsing
    and generating `DISTRIBUTED BY` and `DISTRIBUTED RANDOMLY` clauses.
    """

    class Parser(Postgres.Parser):
        """
        The Parser for the Greenplum dialect.
        """

        def _parse_query_modifiers(self, query: exp.Query) -> None:
            """
            Parses query modifiers, adding custom logic for Greenplum's
            `DISTRIBUTED` clause.

            This method checks for "DISTRIBUTED RANDOMLY" or "DISTRIBUTED BY"
            after a SELECT statement and attaches the corresponding custom
            `Distributed` expression to the query's AST.
            """
            if self._match_text_seq("DISTRIBUTED"):
                is_random = self._match_text_seq("RANDOMLY")

                # The `this` argument for the Distributed expression will always be a list.
                # This consistency makes the generator simpler and more reliable.
                content: exp.Expression

                if is_random:
                    # For RANDOMLY, the content is a list containing our marker class.
                    content = self.expression(Randomly)
                elif self._match_text_seq("BY"):
                    # For BY, the content is a Tuple of columns.
                    content = self._parse_bracket(self._parse_csv(self._parse_column))[
                        0
                    ]
                else:
                    raise self.error("Expected RANDOMLY or BY after DISTRIBUTED")

                # Create the Distributed node with the appropriate flags and content.
                dist_node = self.expression(
                    Distributed, this=content, by=not is_random, randomly=is_random
                )
                query.set("distribute", dist_node)

            # Important: Call the super method to parse other standard modifiers
            # like ORDER BY, LIMIT, etc.
            return super()._parse_query_modifiers(query)

    class Generator(Postgres.Generator):
        """
        The Generator for the Greenplum dialect.
        """

        def create_sql(self, expression: exp.Create) -> str:
            """
            Generates the SQL for a `CREATE` statement.

            This is overridden to ensure that a `DISTRIBUTED` clause, which is
            parsed as part of the subquery, is correctly appended to the end
            of the final `CREATE TABLE` statement.
            """
            # Generate the standard "CREATE TABLE ... AS SELECT ..." part first.
            sql = super().create_sql(expression)

            # Check if the inner query has our custom `Distributed` node.
            query = expression.expression
            if isinstance(query, exp.Query):
                distribute_node = query.args.get("distribute")
                if distribute_node:
                    # If it exists, generate its SQL and append it.
                    distribute_sql = self.sql(distribute_node)
                    sql = f"{sql} {distribute_sql}"
            return sql

        def distributed_sql(self, expression: Distributed) -> str:
            """
            Generates the SQL for our custom `Distributed` expression.
            """
            if expression.args.get("randomly"):
                return "DISTRIBUTED RANDOMLY"
            elif expression.args.get("by"):
                # For the 'BY' case, the `this` argument is a list containing one
                # element: the Tuple of columns.
                columns = expression.this
                # Calling .sql() on the Tuple expression correctly generates
                # the full "(col1, col2, ...)" string.
                columns_sql = columns.sql()
                return f"DISTRIBUTED BY {columns_sql}"

        def randomly_sql(self, expression: Randomly) -> str:
            """
            Generates the SQL for the `Randomly` marker. It produces no
            output itself, as the parent `distributed_sql` handles the text.
            """
            return ""
