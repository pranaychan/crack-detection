#!/usr/bin/env python3
"""Maintain the CrackScope Neo4j knowledge graph.

Commands:
  inspect                         Print graph labels, properties and counts
  update --case-id CRK001 ...     Update properties on an existing Defect_Case
  add-case --json case.json       Create/update a case and MERGE its linked nodes
  import-csv --file data.csv      Upsert cases and graph relationships from CSV

The script uses the existing CrackScope schema:
  (:Defect_Case)-[:What_Crack]->(:Crack_Type)
  (:Defect_Case)-[:What_Component]->(:Component)
  (:Crack_Type)-[:What_Cause]->(:Potential_cause)
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from neo4j import GraphDatabase

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")

URI = os.getenv("NEO4J_URI")
USERNAME = os.getenv("NEO4J_USERNAME")
PASSWORD = os.getenv("NEO4J_PASSWORD")
DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

CASE_PROPERTIES = {
    "building_type",
    "observed_symptoms",
    "evidence_status",
    "screening_priority",
    "evidence_notes",
    "suggested_follow_up",
    "source_type",
}


def connect():
    if not URI or not USERNAME or not PASSWORD:
        raise RuntimeError(
            "Neo4j is not configured. Set NEO4J_URI, NEO4J_USERNAME and "
            "NEO4J_PASSWORD in .env.local or .env."
        )
    driver = GraphDatabase.driver(URI, auth=(USERNAME, PASSWORD))
    driver.verify_connectivity()
    return driver


def clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def upsert_case(tx, row: dict[str, Any]) -> dict[str, Any]:
    case_id = clean(row.get("case_id"))
    if not case_id:
        raise ValueError("Each case must have a non-empty case_id.")

    # Do not overwrite useful values with blank CSV cells.
    properties = {
        key: clean(row.get(key))
        for key in CASE_PROPERTIES
        if clean(row.get(key))
    }
    tx.run(
        """
        MERGE (d:Defect_Case {case_id: $case_id})
        SET d += $properties
        """,
        case_id=case_id,
        properties=properties,
    ).consume()

    crack_type = clean(row.get("crack_type"))
    component = clean(row.get("component"))
    cause = clean(row.get("potential_causes_unverified"))

    if crack_type:
        tx.run(
            """
            MATCH (d:Defect_Case {case_id: $case_id})
            MERGE (ct:Crack_Type {crack_type: $crack_type})
            MERGE (d)-[:What_Crack]->(ct)
            """,
            case_id=case_id,
            crack_type=crack_type,
        ).consume()

        if cause:
            tx.run(
                """
                MATCH (ct:Crack_Type {crack_type: $crack_type})
                MERGE (p:Potential_cause {potential_causes_unverified: $cause})
                MERGE (ct)-[:What_Cause]->(p)
                """,
                crack_type=crack_type,
                cause=cause,
            ).consume()

    if component:
        tx.run(
            """
            MATCH (d:Defect_Case {case_id: $case_id})
            MERGE (c:Component {component: $component})
            MERGE (d)-[:What_Component]->(c)
            """,
            case_id=case_id,
            component=component,
        ).consume()

    return {"case_id": case_id, "properties_updated": sorted(properties),
            "crack_type": crack_type or None, "component": component or None,
            "potential_cause": cause or None}


def cmd_inspect(tx):
    result = tx.run(
        """
        MATCH (n)
        UNWIND labels(n) AS label
        RETURN label, count(*) AS nodes, collect(DISTINCT keys(n)) AS property_sets
        ORDER BY label
        """
    )
    rows = [record.data() for record in result]
    rels = [record.data() for record in tx.run(
        "MATCH ()-[r]->() RETURN type(r) AS relationship, count(*) AS total ORDER BY relationship"
    )]
    return {"labels": rows, "relationships": rels}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("inspect", help="Show node labels, properties and relationship counts")

    update = sub.add_parser("update", help="Update properties of an existing defect case")
    update.add_argument("--case-id", required=True)
    update.add_argument("--building-type")
    update.add_argument("--observed-symptoms")
    update.add_argument("--evidence-status")
    update.add_argument("--screening-priority")
    update.add_argument("--evidence-notes")
    update.add_argument("--suggested-follow-up")
    update.add_argument("--source-type")

    add = sub.add_parser("add-case", help="Create/update a case and its graph relationships from JSON")
    add.add_argument("--json", required=True, help="Path to a JSON object containing case fields")

    imp = sub.add_parser("import-csv", help="Upsert case records from CSV")
    imp.add_argument("--file", default=str(ROOT / "data" / "synthetic_crack_defect_cases.csv"))

    args = parser.parse_args()

    try:
        with connect() as driver:
            with driver.session(database=DATABASE) as session:
                if args.command == "inspect":
                    print(json.dumps(session.execute_read(cmd_inspect), indent=2, ensure_ascii=False))
                    return 0

                if args.command == "update":
                    properties = {
                        key: clean(getattr(args, key))
                        for key in CASE_PROPERTIES
                        if getattr(args, key, None) is not None
                    }
                    if not properties:
                        parser.error("Provide at least one property to update.")
                    result = session.run(
                        """
                        MATCH (d:Defect_Case {case_id: $case_id})
                        SET d += $properties
                        RETURN d.case_id AS case_id, keys(d) AS properties
                        """,
                        case_id=args.case_id,
                        properties=properties,
                    ).single()
                    if result is None:
                        print(f"No Defect_Case found with case_id={args.case_id!r}; nothing changed.", file=sys.stderr)
                        return 2
                    print(json.dumps({"updated": result.data()}, indent=2))
                    return 0

                if args.command == "add-case":
                    with open(args.json, encoding="utf-8-sig") as handle:
                        row = json.load(handle)
                    result = session.execute_write(upsert_case, row)
                    print(json.dumps(result, indent=2, ensure_ascii=False))
                    return 0

                if args.command == "import-csv":
                    path = Path(args.file).expanduser()
                    if not path.is_file():
                        raise FileNotFoundError(f"CSV file not found: {path}")
                    with path.open("r", encoding="utf-8-sig", newline="") as handle:
                        rows = list(csv.DictReader(handle))
                    if not rows:
                        print("CSV contains no data rows.")
                        return 0
                    # One transaction per row: a bad row won't undo previous successful rows.
                    results, errors = [], []
                    for line_number, row in enumerate(rows, start=2):
                        try:
                            results.append(session.execute_write(upsert_case, row))
                        except Exception as exc:
                            errors.append({"line": line_number, "case_id": row.get("case_id"), "error": str(exc)})
                    print(json.dumps({
                        "file": str(path), "rows_read": len(rows),
                        "rows_upserted": len(results), "errors": errors,
                        "results": results,
                    }, indent=2, ensure_ascii=False))
                    return 1 if errors else 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
