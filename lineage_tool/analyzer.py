"""
Contains the core orchestration logic for the lineage analysis tool.

This module is responsible for finding SQL files, extracting table names,
coordinating schema fetching (either from a file or a database), and
aggregating the final lineage report.
"""

import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import sqlglot
from sqlglot import exp

from .db import fetch_schema_from_db
from .parser import GreenplumLineageParser

logger = logging.getLogger(__name__)

def find_sql_files(directory: str) -> List[str]:
    """
    Recursively finds all files with a .sql extension in a directory.

    Args:
        directory: The path to the directory to search.

    Returns:
        A list of full file paths for all found .sql files.
    """
    sql_files: List[str] = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".sql"):
                sql_files.append(os.path.join(root, file))
    return sql_files

def extract_table_names_from_script(sql_script: str) -> Set[str]:
    """
    Parses a SQL script to find unique source table identifiers, excluding CTEs.

    Args:
        sql_script: The SQL script content as a string.

    Returns:
        A set of unique table names found in the script.
    """
    source_tables: Set[str] = set()
    try:
        expressions = sqlglot.parse(sql_script, read="greenplum")
        
        # CORRECTED: Find all CTE names by iterating through each expression tree
        cte_names = {
            cte.alias_or_name
            for expr in expressions
            for cte in expr.find_all(exp.CTE)
        }

        # CORRECTED: Find tables in each expression tree and filter out CTEs
        for expr in expressions:
            for table_expr in expr.find_all(exp.Table):
                if table_expr.this.name not in cte_names:
                    source_tables.add(table_expr.this.name)
    except Exception as e:
        logger.warning(f"Could not parse a SQL file to extract table names. Error: {e}")
    return source_tables


def analyze_directory(
    sql_directory: str, schema_file: Optional[str] = None
) -> Dict[str, Any]:
    """
    Orchestrates the end-to-end lineage analysis for a directory.

    This is the main driver function. It handles the workflow of loading the schema
    (either from a file or DB), analyzing each SQL file, and compiling the
    final results.

    Args:
        sql_directory: The path to the directory containing SQL files.
        schema_file: Optional path to a pre-existing schema JSON file.

    Returns:
        A dictionary containing the final lineage report and, if generated,
        the database schema.
    """
    logger.info(f"Starting analysis for directory: {sql_directory}")
    
    schema_data = {}
    generated_schema_data = None

    # UPDATED: New workflow to either load schema from file or fetch from DB
    if schema_file:
        logger.info(f"Attempting to load schema from file: {schema_file}")
        try:
            with open(schema_file, 'r', encoding='utf-8') as f:
                schema_data = json.load(f)
            logger.info("Schema successfully loaded from file. Skipping database fetch.")
        except FileNotFoundError:
            logger.error(f"Schema file not found at '{schema_file}'. Aborting.")
            return {}
        except json.JSONDecodeError:
            logger.error(f"Could not parse JSON from schema file '{schema_file}'. Aborting.")
            return {}
    else:
        logger.info("No schema file provided. Proceeding with database discovery.")
        # --- Step 1: Find SQL files ---
        find_start = time.perf_counter()
        sql_files = find_sql_files(sql_directory)
        if not sql_files:
            logger.warning("No .sql files found.")
            return {}
        find_end = time.perf_counter()
        logger.info(f"Found {len(sql_files)} SQL file(s) in {find_end - find_start:.2f} seconds.")
        
        # --- Step 2: Extract table names ---
        extract_start = time.perf_counter()
        all_table_names: Set[str] = set()
        sql_scripts_content: Dict[str, str] = {}
        for file_path in sql_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    sql_scripts_content[file_path] = content
                    all_table_names.update(extract_table_names_from_script(content))
            except Exception as e:
                logger.error(f"Failed to read or process file: {file_path}. Error: {e}")
        extract_end = time.perf_counter()
        logger.info(f"Extracted {len(all_table_names)} unique table names in {extract_end - extract_start:.2f} seconds.")
        logger.debug(f"Unique table names found: {all_table_names}")

        # --- Step 3: Build schema from DB ---
        schema_start = time.perf_counter()
        schema_data = fetch_schema_from_db(all_table_names)
        generated_schema_data = schema_data # Keep a copy to save later
        schema_end = time.perf_counter()
        if not schema_data:
            logger.warning("Schema could not be built. Lineage analysis may be incomplete or fail.")
        logger.info(f"Schema build process finished in {schema_end - schema_start:.2f} seconds.")
        logger.debug(f"Generated schema: {schema_data}")

    # --- Step 4: Generate Lineage (This part is now common to both workflows) ---
    lineage_start = time.perf_counter()
    parser = GreenplumLineageParser(schema_data)
    final_report = {
        "date_parsed": datetime.now().isoformat(),
        "errors": {},
        "lineage": {}
    }
    
    # We need to re-read files if we didn't in the DB-fetch path
    if schema_file:
        sql_files = find_sql_files(sql_directory)
        sql_scripts_content = {}
        for file_path in sql_files:
             with open(file_path, 'r', encoding='utf-8') as f:
                sql_scripts_content[file_path] = f.read()

    for file_path, script in sql_scripts_content.items():
        logger.debug(f"Analyzing file: {os.path.basename(file_path)}")
        report = parser.generate_lineage(script)
        
        final_report["lineage"].update(report.get("lineage", {}))
        for table, errors in report.get("errors", {}).items():
            error_messages = [f"[{os.path.basename(file_path)}] {e}" for e in errors]
            final_report["errors"].setdefault(table, []).extend(error_messages)
    
    lineage_end = time.perf_counter()
    logger.info(f"Lineage generation for all files completed in {lineage_end - lineage_start:.2f} seconds.")
            
    # Return the generated schema only if we created it in this run
    return {"schema": generated_schema_data, "report": final_report} if generated_schema_data is not None else {"report": final_report}