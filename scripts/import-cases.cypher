// Local Neo4j only: put the CSV in the Neo4j import directory before running.
// Neo4j Aura cannot read a file:/// path on your desktop. Use a driver importer for Aura.

LOAD CSV WITH HEADERS
FROM 'file:///synthetic_crack_defect_cases.csv' AS row

MERGE (d:Defect_Case {case_id: row.case_id})
SET d.building_type = row.building_type,
    d.observed_symptoms = row.observed_symptoms,
    d.evidence_status = row.evidence_status,
    d.screening_priority = row.screening_priority,
    d.evidence_notes = row.evidence_notes,
    d.suggested_follow_up = row.suggested_follow_up;

LOAD CSV WITH HEADERS
FROM 'file:///synthetic_crack_defect_cases.csv' AS row
WITH row
WHERE trim(coalesce(row.crack_type, '')) <> ''
MERGE (ct:Crack_Type {crack_type: trim(row.crack_type)})
MERGE (d:Defect_Case {case_id: row.case_id})
MERGE (d)-[:What_Crack]->(ct)
WITH row, d, ct
WHERE trim(coalesce(row.component, '')) <> ''
MERGE (c:Component {component: trim(row.component)})
MERGE (d)-[:What_Component]->(c)
WITH row, ct
WHERE trim(coalesce(row.potential_causes_unverified, '')) <> ''
MERGE (p:Potential_cause {potential_causes_unverified: trim(row.potential_causes_unverified)})
MERGE (ct)-[:What_Cause]->(p);
