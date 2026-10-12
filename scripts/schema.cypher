CREATE CONSTRAINT defect_case_id IF NOT EXISTS
FOR (n:Defect_Case) REQUIRE n.case_id IS UNIQUE;

CREATE CONSTRAINT crack_type_value IF NOT EXISTS
FOR (n:Crack_Type) REQUIRE n.crack_type IS UNIQUE;

CREATE CONSTRAINT component_value IF NOT EXISTS
FOR (n:Component) REQUIRE n.component IS UNIQUE;

CREATE CONSTRAINT potential_cause_value IF NOT EXISTS
FOR (n:Potential_cause) REQUIRE n.potential_causes_unverified IS UNIQUE;
