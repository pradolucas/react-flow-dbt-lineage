"""
Contains the core lineage parsing class, GreenplumLineageParser.

This module uses sqlglot and the custom Greenplum dialect to analyze SQL scripts
and trace table and column-level lineage.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import sqlglot
import sqlglot.lineage as lineage
from sqlglot import exp, optimizer
from sqlglot.schema import MappingSchema

from .dialects.greenplum import Greenplum

# Standard way to register a custom dialect with sqlglot.
sqlglot.dialects.DIALECTS.append("greenplum")

class GreenplumLineageParser:
    """
    Parses a Greenplum SQL script to generate table and column lineage.

    This class encapsulates the logic for parsing `CREATE TABLE AS` statements,
    handling Greenplum-specific syntax, and tracing dependencies down to the
    column level.

    Attributes:
        schema: A sqlglot MappingSchema instance for schema lookups.
        errors: A dictionary to store any errors encountered during parsing.
    """

    def __init__(self, schema_data: Dict[str, Any]) -> None:
        """
        Initializes the parser with schema data.

        Args:
            schema_data: A dictionary representing the database schema.
        """
        self.schema: MappingSchema = MappingSchema(schema_data, dialect="greenplum")
        self.errors: Dict[str, List[str]] = {}

    def _get_table_fqn(
        self,
        table_expr: exp.Table,
        default_db: Optional[str],
        default_schema: Optional[str],
    ) -> str:
        """
        Constructs a fully qualified table name from a table expression.

        Args:
            table_expr: The sqlglot Table expression.
            default_db: The default database (catalog) to use if not specified.
            default_schema: The default schema to use if not specified.

        Returns:
            A string representing the fully qualified table name.
        """
        catalog = table_expr.catalog or default_db
        schema = table_expr.db or default_schema
        table = table_expr.this.name

        parts = [
            part.name if isinstance(part, exp.Identifier) else part
            for part in [catalog, schema, table]
            if part
        ]
        return ".".join(parts)

    def _qualify_stars_inside_functions(
        self, expression: exp.Expression
    ) -> exp.Expression:
        """
        Finds and expands `table.*` expressions used inside function calls.

        This is a workaround for patterns like `row_to_json(c.*)` which are not
        natively expanded by sqlglot's qualification step. It transforms the
        expression into a format that sqlglot can understand, like
        `row_to_json((c.col1, c.col2))`.

        Args:
            expression: The sqlglot expression to transform.

        Returns:
            A new, transformed sqlglot expression.
        """
        expression = expression.copy()

        # 1. Map all CTE definitions to their output columns.
        cte_definitions = {
            cte.alias: {s.alias_or_name for s in cte.this.selects}
            for cte in expression.find_all(exp.CTE)
        }

        # 2. Map table/CTE aliases in the current scope to their columns.
        scope_columns = {}
        for table in expression.find_all(exp.Table):
            alias = table.alias_or_name
            source_name = table.name
            columns: Optional[Set[str]] = None

            if source_name in cte_definitions:
                # The source is a CTE
                columns = cte_definitions[source_name]
            else:
                # The source is a base table, so look it up in the main schema.
                try:
                    schema_table = self.schema.find(table)
                    if schema_table:
                        columns = schema_table
                except sqlglot.errors.SchemaError:
                    # Ignore tables not found in the schema (e.g., from subqueries).
                    continue
            if columns:
                scope_columns[alias] = columns
                scope_columns[source_name] = columns

        # 3. Find all function calls and replace "alias.*" with expanded columns.
        for func in expression.find_all(exp.Func):
            self._replace_star_args(func, scope_columns)

        return expression

    def _replace_star_args(
        self, func: exp.Func, scope_columns: Dict[str, Set[str]]
    ) -> None:
        """
        Helper to replace `alias.*` args in a function with expanded columns.

        Args:
            func: The function expression to modify.
            scope_columns: A mapping of table aliases to their column sets.
        """
        new_args = []
        transformed = False
        for arg in func.args.get("expressions", []):
            if (
                isinstance(arg, exp.Column)
                and isinstance(arg.this, exp.Star)
                and arg.table in scope_columns
            ):
                alias = arg.table
                sorted_cols = sorted(list(scope_columns[alias]))
                expanded_cols = [
                    exp.Column(this=col, table=alias) for col in sorted_cols
                ]
                row_constructor = exp.Tuple(expressions=expanded_cols)
                new_args.append(row_constructor)
                transformed = True
            else:
                new_args.append(arg)

        if transformed:
            func.set("expressions", new_args)

    def _trace_lineage_recursively(
        self,
        lineage_node: lineage.Node,
        default_db: Optional[str],
        default_schema: Optional[str],
    ) -> Set[str]:
        """
        Recursively traverses a lineage graph to find ultimate source columns.

        Args:
            lineage_node: The starting sqlglot lineage.Node.
            default_db: The default database for qualifying names.
            default_schema: The default schema for qualifying names.

        Returns:
            A set of fully qualified source column names.
        """
        sources: Set[str] = set()
        for parent_node in lineage_node.downstream:
            if isinstance(parent_node.expression, exp.Table):
                # This node is a base table, the end of this trace.
                table_expr = parent_node.expression
                table_fqn = self._get_table_fqn(table_expr, default_db, default_schema)
                # Node name can be qualified, so we safely get the column name.
                column_name = parent_node.name.split('.')[-1]
                sources.add(f"{table_fqn}.{column_name}")
            else:
                # This node is derived from another expression; trace it further.
                new_sources = self._trace_lineage_recursively(
                    parent_node, default_db, default_schema
                )
                sources.update(new_sources)
        return sources

    def _process_create_statement(
        self,
        expr: exp.Create,
        default_db: Optional[str],
        default_schema: Optional[str],
        lineage_nodes: Dict[str, Any],
    ) -> None:
        """
        Analyzes a single CREATE TABLE statement and populates the lineage result.

        Args:
            expr: The sqlglot Create expression.
            default_db: The default database for name qualification.
            default_schema: The default schema for name qualification.
            lineage_nodes: The dictionary to populate with lineage results.
        """
        select_statement = expr.expression
        if not select_statement:
            return

        # Handle CREATE TABLE ... AS (WITH ... SELECT ...)
        if isinstance(select_statement, exp.Subquery):
            select_statement = select_statement.this

        try:
            # Prepare the query for lineage analysis
            expanded_select = self._qualify_stars_inside_functions(select_statement)
            optimized_select = optimizer.optimize(
                expanded_select,
                schema=self.schema,
                dialect="greenplum",
                db=default_schema,
                catalog=default_db,
            )
        except Exception as e:
            target_table_fqn = self._get_table_fqn(
                expr.this, default_db, default_schema
            )
            self.errors.setdefault(target_table_fqn, []).append(
                f"Could not analyze statement: {e}"
            )
            return

        # Table-level dependencies
        target_table_fqn = self._get_table_fqn(expr.this, default_db, default_schema) 
        cte_names = {cte.alias for cte in optimized_select.find_all(exp.CTE)}
        dependencies = {
            self._get_table_fqn(t, default_db, default_schema)
            for t in optimized_select.find_all(exp.Table)
            if t.this.name not in cte_names
        }

        # Column-level lineage
        columns_lineage: Dict[str, Any] = {}
        for selection in optimized_select.selects:
            column_name = selection.alias_or_name
            try:
                node = lineage.lineage(
                    sql=optimized_select,
                    schema=self.schema,
                    column=column_name,
                    dialect="greenplum",
                )
                final_sources = self._trace_lineage_recursively(
                    node, default_db, default_schema
                )
                if final_sources:
                    columns_lineage[column_name] = {
                        "lineage": sorted(list(final_sources))
                    }
            except Exception as e:
                self.errors.setdefault(target_table_fqn, []).append(
                    f"Could not trace column '{column_name}': {e}"
                )

        lineage_nodes[target_table_fqn] = {
            "depends_on": sorted(list(dependencies)),
            "columns": columns_lineage,
        }

    def _find_default_schema(
        self, expressions: List[exp.Expression]
    ) -> Optional[str]:
        """
        Finds the 'search_path' setting in the script.

        Args:
            expressions: A list of parsed sqlglot expressions.

        Returns:
            The schema name from the `SET search_path` command, if found.
        """
        for expr in expressions:
            # Look for statements like: SET search_path TO my_schema;
            if (
                isinstance(expr, exp.Set)
                and isinstance(expr.expressions[0], exp.SetItem)
                and isinstance(expr.expressions[0].this, exp.EQ)
                and expr.expressions[0].this.left.name.upper() == "SEARCH_PATH"
            ):
                return expr.expressions[0].this.right.name
        return None

    def _build_final_output(self, lineage_nodes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Constructs the final dictionary to be returned.

        Args:
            lineage_nodes: The dictionary of processed lineage information.

        Returns:
            A dictionary containing the full lineage report.
        """
        return {
            "date_parsed": datetime.now().isoformat(),
            "errors": self.errors,
            "lineage": lineage_nodes,
        }

    def generate_lineage(self, sql_script: str) -> Dict[str, Any]:
        """
        Orchestrates parsing a SQL script and generating the lineage report.

        This method is the main public entry point for the parser. It handles
        the full lifecycle of parsing, analysis, and result compilation for a
        single SQL script. It is designed to be stateless regarding errors
        across multiple calls.

        Args:
            sql_script: The SQL script content as a string.

        Returns:
            A dictionary containing the lineage report and any errors.
        """
        self.errors = {}
        lineage_nodes: Dict[str, Any] = {}

        try:
            expressions: List[exp.Expression] = sqlglot.parse(
                sql_script, read="greenplum"
            )
        except Exception as e:
            self.errors["script"] = [f"Failed to parse the entire SQL script: {e}"]
            return self._build_final_output(lineage_nodes)

        default_schema = self._find_default_schema(expressions)
        default_db = next(iter(self.schema.mapping), None)

        for expr in expressions:
            if isinstance(expr, exp.Create) and expr.args.get("kind") == "TABLE":
                self._process_create_statement(
                    expr, default_db, default_schema, lineage_nodes
                )

        return self._build_final_output(lineage_nodes)