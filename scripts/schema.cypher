CREATE CONSTRAINT defect_case_id IF NOT EXISTS
FOR (n:DefectCase) REQUIRE n.case_id IS UNIQUE;

CREATE CONSTRAINT crack_type_name IF NOT EXISTS
FOR (n:CrackType) REQUIRE n.name IS UNIQUE;

CREATE CONSTRAINT component_name IF NOT EXISTS
FOR (n:Component) REQUIRE n.name IS UNIQUE;

CREATE CONSTRAINT potential_cause_name IF NOT EXISTS
FOR (n:PotentialCause) REQUIRE n.name IS UNIQUE;
