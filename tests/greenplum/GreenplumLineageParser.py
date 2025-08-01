import json
import sqlglot
from sqlglot import exp
from sqlglot import optimizer
import sqlglot.lineage as lineage
from sqlglot.schema import MappingSchema
from typing import Dict, List, Set, Any, Optional
from datetime import datetime
import sys

def load_json_file(filepath: str) -> Dict[str, Any]:
    """
    Loads the content of a JSON file from the given path.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load or parse JSON file at '{filepath}'. {e}")
        return {}

def load_sql_file(filepath: str) -> str:
    """
    Loads the content of a SQL file from the given path.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Error: SQL file '{filepath}' not found.")
        exit(1)

class GreenplumLineageParser:
    """
    Parses a Greenplum SQL script to generate table and column lineage.
    """
    def __init__(self, schema_data: Dict[str, Any]):
        """Initializes the parser with schema data."""
        self.schema = MappingSchema(schema_data, dialect="postgres")
        self.errors: Dict[str, List[str]] = {}

    def _get_table_fqn(
        self, table_expr: exp.Table, default_db: Optional[str], default_schema: Optional[str]
    ) -> str:
        """Constructs a fully qualified table name from a table expression."""
        # In sqlglot, 'catalog' is the database and 'db' is the schema.
        catalog = table_expr.catalog or default_db
        schema = table_expr.db or default_schema
        table = table_expr.this.name

        # Filter out any None parts and join.
        parts = [
            part.name if isinstance(part, exp.Identifier) else part
            for part in [catalog, schema, table] if part
        ]
        return ".".join(parts)

    def _expand_stars_in_functions(self, expression: exp.Expression) -> exp.Expression:
        """
        Finds and expands "table.*" expressions used inside function calls,
        e.g., transforms `row_to_json(c.*)` into `row_to_json((c.col1, c.col2))`.
        This is a workaround for patterns not natively expanded by sqlglot's qualify.
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
            if columns: ## catchin sumple table names?
                scope_columns[alias] = columns
                scope_columns[source_name] = columns

        # 3. Find all function calls and replace "alias.*" with expanded columns.
        for func in expression.find_all(exp.Func):
            self._replace_star_args(func, scope_columns)

        return expression

    def _replace_star_args(self, func: exp.Func, scope_columns: Dict[str, Set[str]]):
        """Helper to replace 'alias.*' args in a function with expanded columns."""
        new_args = []
        transformed = False
        for arg in func.args.get("expressions", []):
            if isinstance(arg, exp.Column) and isinstance(arg.this, exp.Star) and arg.table in scope_columns:
                alias = arg.table
                sorted_cols = sorted(list(scope_columns[alias]))
                expanded_cols = [exp.Column(this=col, table=alias) for col in sorted_cols]
                # exp.Tuple represents a ROW() constructor or a parenthesized list
                row_constructor = exp.Tuple(expressions=expanded_cols)
                new_args.append(row_constructor)
                transformed = True
            else:
                new_args.append(arg)
        
        if transformed:
            func.set('expressions', new_args)

    def _trace_lineage_recursively(
        self, lineage_node: lineage.Node, default_db: Optional[str], default_schema: Optional[str]
    ) -> Set[str]:
        """Recursively traverses a lineage graph node to find the ultimate source columns."""
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
    ):
        """Analyzes a single CREATE TABLE statement and populates the lineage result."""
        target_table_fqn = self._get_table_fqn(expr.this, default_db, default_schema)
        select_statement = expr.expression

        if not select_statement:
            return

        # Handle CREATE TABLE ... AS (WITH ... SELECT ...)
        if isinstance(select_statement, exp.Subquery):
            select_statement = select_statement.this
        
        try:
            # Prepare the query for lineage analysis
            expanded_select = self._expand_stars_in_functions(select_statement)
            optimized_select = optimizer.optimize(
                expanded_select,
                schema=self.schema,
                dialect="postgres",
                db=default_schema,
                catalog=default_db,
            )
        except Exception as e:
            self.errors.setdefault(target_table_fqn, []).append(f"Could not analyze statement: {e}")
            return

        # Table-level dependencies
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
                    dialect="postgres",
                )
                final_sources = self._trace_lineage_recursively(node, default_db, default_schema)
                if final_sources:
                    columns_lineage[column_name] = {"lineage": sorted(list(final_sources))}
            except Exception as e:
                self.errors.setdefault(target_table_fqn, []).append(
                    f"Could not trace column '{column_name}': {e}"
                )

        lineage_nodes[target_table_fqn] = {
            "depends_on": sorted(list(dependencies)),
            "columns": columns_lineage,
        }

    def _find_default_schema(self, expressions: List[exp.Expression]) -> Optional[str]:
        """Finds the 'search_path' setting in the script."""
        for expr in expressions:
            # Look for statements like: SET search_path TO my_schema;
            # return expr.find(exp.Set).expression.this.right.name
            if (isinstance(expr, exp.Set)
                and isinstance(expr.expression, exp.EQ) 
                and expr.expressions[0].this.left.name.upper() == 'SEARCH_PATH' ):
                return expr.expressions[0].this.right.name    
        return None

    def _build_final_output(self, lineage_nodes: Dict) -> Dict[str, Any]:
        """Constructs the final dictionary to be returned."""
        return {
            "date_parsed": datetime.now().isoformat(),
            "errors": self.errors,
            "lineage": lineage_nodes,
        }

    def generate_lineage(self, sql_script: str) -> Dict[str, Any]:
        """
        Orchestrates parsing a SQL script and generating the complete lineage.
        """
        lineage_nodes: Dict[str, Any] = {}
        try:
            expressions = sqlglot.parse(sql_script, read="postgres")
        except Exception as e:
            self.errors["script"] = [f"Failed to parse the entire SQL script: {e}"]
            return self._build_final_output(lineage_nodes)

        # Establish default database and schema for unqualified identifiers
        default_schema = self._find_default_schema(expressions)
        default_db = next(iter(self.schema.mapping), None) # TODO fetch default db

        # Process each CREATE TABLE statement in the script
        for expr in expressions:
            if isinstance(expr, exp.Create) and expr.args.get('kind') == 'TABLE':
                self._process_create_statement(
                    expr, default_db, default_schema, lineage_nodes
                )
        
        return self._build_final_output(lineage_nodes)

def main() -> None:
    """Main function to execute the parser and print the result."""
    sql_file = "script.sql"
    schema_file = "schema.json"
    
    sql_script = load_sql_file(sql_file)
    schema_data = load_json_file(schema_file)
    

    parser = GreenplumLineageParser(schema_data)
    final_output = parser.generate_lineage(sql_script)
    
    print(json.dumps(final_output, indent=4))

if __name__ == "__main__":
    main()