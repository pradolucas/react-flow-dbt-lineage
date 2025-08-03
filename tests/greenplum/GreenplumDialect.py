import typing as t

from sqlglot import exp
from sqlglot.dialects.postgres import Postgres

class Greenplum(Postgres):
    """
    Defines the Greenplum dialect for sqlglot, adding support for parsing
    and generating `DISTRIBUTED BY` and `DISTRIBUTED RANDOMLY` clauses.
    """

    class Parser(Postgres.Parser):
        """
        The Parser for the Greenplum dialect, which extends the Postgres parser
        with custom property parsing logic.
        """

        # Overwrite properties
        PROPERTY_PARSERS: t.Dict[str, t.Callable] = {
            **Postgres.Parser.PROPERTY_PARSERS | {"DISTRIBUTED": lambda self: self._parse_distributed_property()} # inplace return new dict with update
        }

        def _parse_distributed_property(self) -> exp.DistributedByProperty:
            """
            Parses a Greenplum DISTRIBUTED clause.
            This can be either `DISTRIBUTED BY (col1, ...)` or `DISTRIBUTED RANDOMLY`.

            Returns:
                An `exp.DistributedByProperty` expression node representing the clause.
            """
            kind: str = "BY"
            columns: t.Optional[t.Union[exp.Paren, exp.Tuple]] = None
            if self._match_text_seq("BY"):
                # The result of this operation should be an exp.Paren for a single
                # column or an exp.Tuple for multiple columns.
                columns = self._parse_bracket(self._parse_csv(self._parse_column))[0]
            elif self._match_text_seq("RANDOMLY"):
                kind = "RANDOMLY"
            
            return self.expression(
                exp.DistributedByProperty,
                expressions=columns,
                kind=kind,
                buckets=None,
                order=self._parse_order(),
            )

    class Generator(Postgres.Generator):
        """
        The Generator for the Greenplum dialect, which extends the Postgres generator
        to correctly format the DISTRIBUTED clause.
        """

        # Overwrite properties
        PROPERTIES_LOCATION: t.Dict[t.Type[exp.Property], exp.Properties.Location] = {
           **Postgres.Generator.PROPERTIES_LOCATION | {exp.DistributedByProperty: exp.Properties.Location.POST_EXPRESSION} # inplace return new dict with update
        }
        
        def distributedbyproperty_sql(self, expression: exp.DistributedByProperty) -> str:
            """
            Generates the SQL string for a DistributedByProperty expression.

            Args:
                expression: The `exp.DistributedByProperty` expression node.

            Returns:
                The formatted SQL string for the `DISTRIBUTED` clause.
            """
            kind: str = expression.text("kind")
            order: str = self.sql(expression, "order")
            
            if kind == "RANDOMLY":
                return f"DISTRIBUTED RANDOMLY {order}"
            exprs: str = self.sql(expression, "expressions")
            return f"DISTRIBUTED BY {exprs}{order}"