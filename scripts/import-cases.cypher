// Put synthetic_crack_defect_cases.csv in the Neo4j database import directory.
// Then run this script in Neo4j Browser (local/Desktop) or adapt file loading for Aura.

LOAD CSV WITH HEADERS
FROM 'file:///synthetic_crack_defect_cases.csv' AS row

MERGE (c:DefectCase {case_id: row.case_id})
SET c.building_type = row.building_type,
    c.observed_symptoms = row.observed_symptoms,
    c.evidence_status = row.evidence_status,
    c.screening_priority = row.screening_priority,
    c.evidence_notes = row.evidence_notes,
    c.suggested_follow_up = row.suggested_follow_up,
    c.source_type = row.source_type,
    c.potential_causes_unverified = row.potential_causes_unverified

MERGE (t:CrackType {name: row.crack_type})
MERGE (p:Component {name: row.component})
MERGE (c)-[:HAS_CRACK_TYPE]->(t)
MERGE (c)-[:OCCURS_ON]->(p)

WITH c, row
UNWIND split(row.potential_causes_unverified, ';') AS rawCause
WITH c, trim(rawCause) AS causeName
WHERE causeName <> ''
MERGE (cause:PotentialCause {name: causeName})
MERGE (c)-[:MAY_BE_ASSOCIATED_WITH]->(cause);
