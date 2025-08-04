"""
Main entry point for the lineage_tool package.

This allows the package to be executed as a script using `python -m lineage_tool`.
It directly calls the main function from the command-line interface module.
"""
from .cli import main

if __name__ == "__main__":
    main()