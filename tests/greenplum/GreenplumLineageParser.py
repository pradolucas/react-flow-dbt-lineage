import json
import sqlglot
from sqlglot import exp
from sqlglot import optimizer
import sqlglot.lineage as lineage
from sqlglot.schema import MappingSchema
from typing import Dict, List, Set, Any
from datetime import datetime

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
    A class to parse a Greenplum SQL script and generate table and column lineage.
    """
    def __init__(self, schema_data: Dict[str, Any]):
        """
        Initializes the parser with schema data.
        """
        self.schema = MappingSchema(schema_data)
        self.errors: Dict[str, List[str]] = {}

    def _trace_lineage_recursively(self, lineage_node: lineage.Node, default_db: str) -> Set[str]:
        """
        Recursively traverses a lineage graph node to find the ultimate source columns.
        """
        sources: Set[str] = set()
        for parent_node in lineage_node.downstream:
            if isinstance(parent_node.expression, exp.Table):
                table_expr = parent_node.expression
                # Manually build the FQN to get a clean name without aliases/quotes.
                parts = []
                if table_expr.catalog:
                    parts.append(table_expr.catalog)
                elif default_db:
                    parts.append(default_db)
                if table_expr.db:
                    parts.append(table_expr.db)
                if table_expr.this:
                    parts.append(table_expr.this.name)
                
                table_fqn = ".".join(parts)
                column_name = parent_node.name.split('.')[-1]
                full_source_name = f"{table_fqn}.{column_name}"
                sources.add(full_source_name)
            else:
                new_sources = self._trace_lineage_recursively(parent_node, default_db)
                sources.update(new_sources)
        return sources

    def generate_lineage(self, sql_script: str) -> Dict[str, Any]:
        """
        The main orchestrator method. It parses a SQL script, identifies all
        CREATE TABLE statements, and generates the complete lineage for each.
        """
        lineage_nodes: Dict[str, Any] = {}
        
        try:
            expressions = sqlglot.parse(sql_script, read="postgres")
        except Exception as e:
            self.errors["script"] = [f"Failed to parse the entire SQL script: {e}"]
            return { "date_parsed": datetime.now().isoformat(), "errors": self.errors, "lineage": lineage_nodes }

        default_schema = None
        for expr in expressions:
            for expr in expressions:
                if isinstance(expr, exp.Set) and expr.expressions[0].this.left.name.upper() == 'SEARCH_PATH':
                    default_schema = expr.expressions[0].this.right.name
        
        default_db = list(self.schema.mapping.keys())[0] if self.schema.mapping else None

        for expr in expressions:
            if isinstance(expr, exp.Create) and expr.args.get('kind') == 'TABLE':
                
                # Build the target table FQN robustly to use as the final key.
                target_table_expr = exp.to_table(expr.this.sql())
                
                # Manually build the FQN for the target table
                target_parts = []
                if target_table_expr.catalog:
                    target_parts.append(target_table_expr.catalog.name)
                elif default_db:
                    target_parts.append(default_db)
                
                if target_table_expr.db:
                    target_parts.append(target_table_expr.db.name)
                elif default_schema:
                    target_parts.append(default_schema)

                target_parts.append(target_table_expr.this.name)
                target_table_fqn = ".".join(target_parts)

                model_lineage_result: Dict[str, Any] = {}
                select_statement = expr.expression

                if not select_statement:
                    continue

                try:

                    qualified_sql = select_statement.qualify(schema=self.schema,
                        dialect="postgres",
                        db=default_schema,
                        catalog=default_db,
                        quote_identifiers=False)

                    optimized_select = optimizer.optimize(
                        qualified_sql,
                        schema=self.schema,
                        dialect="postgres",
                        db=default_schema,
                        catalog=default_db,
                        quote_identifiers=False
                        )         
                except Exception as e:
                    self.errors.setdefault(target_table_fqn, []).append(f"Could not analyze statement: {e}")
                    continue
                
                cte_names = {cte.alias for cte in optimized_select.ctes}
                dependencies = set()
                for t in optimized_select.find_all(exp.Table):
                    if t.this.name not in cte_names:
                        dep_parts = []
                        if t.catalog:
                            dep_parts.append(t.catalog)
                        else:
                            dep_parts.append(default_db)
                        if t.db:
                            dep_parts.append(t.db)
                        dep_parts.append(t.this.name)

                        dependencies.add(".".join(dep_parts))

                model_lineage_result["depends_on"] = sorted(list(dependencies))
                
                columns_lineage: Dict[str, Any] = {}
                for selection in optimized_select.selects:
                    column_name = selection.alias_or_name
                    try:
                        lineage_node = lineage.lineage(
                            sql=optimized_select, 
                            schema=self.schema, 
                            column=column_name,
                            dialect="postgres"
                        )
                        final_sources = self._trace_lineage_recursively(lineage_node, default_db)

                        if final_sources:
                            columns_lineage[column_name] = {"lineage": sorted(list(set(final_sources)))}
                    except Exception as e:
                        self.errors.setdefault(target_table_fqn, []).append(f"Could not trace column '{column_name}': {e}")

                model_lineage_result["columns"] = columns_lineage
                lineage_nodes[target_table_fqn] = model_lineage_result

        return {
            "date_parsed": datetime.now().isoformat(),
            "errors": self.errors,
            "lineage": lineage_nodes
        }

def main() -> None:
    """Main function to execute the parser and print the result."""
    sql_file = "script.sql"
    schema_file = "schema.json"
    
    sql_script = load_sql_file(sql_file)
    schema_data = load_json_file(schema_file)
    
    if not schema_data:
        print("Error: Schema file is required for lineage analysis.")
        exit(1)

    parser = GreenplumLineageParser(schema_data)
    final_output = parser.generate_lineage(sql_script)
    
    if final_output:
        print(json.dumps(final_output, indent=4))

if __name__ == "__main__":
    main()