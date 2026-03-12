# Requirements Document

## Introduction

The Moqui Scene Template Extractor is the second phase of the SCE + Moqui fusion strategy. Building on Spec 90's MoquiClient and MoquiAdapter, this feature connects to a live Moqui ERP instance, discovers available entities/services/screens, analyzes them to identify business patterns (e.g., CRUD operations, order queries, workflow orchestrations), and generates reusable scene templates (YAML manifests + scene-package.json). The extracted templates integrate with SCE's existing `scene package-publish` and `scene instantiate` workflows.

## Glossary

- **Extractor**: The `moqui-extractor.js` module responsible for analyzing discovered Moqui resources and generating scene templates
- **Discovery_Payload**: The structured response from `scene discover` containing lists of entities, services, and screens from a Moqui instance
- **Business_Pattern**: A recognized combination of Moqui resources that maps to a reusable scene archetype (e.g., "crud", "query", "workflow")
- **Pattern_Rule**: A rule definition that describes how to match discovered resources to a specific Business_Pattern
- **Extraction_Result**: The output of the extraction pipeline containing generated scene manifests and package contracts
- **Scene_Manifest**: A YAML file following `sce.scene/v0.2` apiVersion that describes a scene's domain, intent, bindings, and governance
- **Package_Contract**: A JSON file following `sce.scene.package/v0.1` apiVersion that describes a scene package's metadata, parameters, and template structure
- **Template_Bundle**: A directory containing a Scene_Manifest and Package_Contract pair ready for publishing via `scene package-publish`
- **MoquiClient**: The HTTP client from Spec 90 that handles JWT authentication and request execution against Moqui REST APIs
- **MoquiAdapter**: The binding handler from Spec 90 that parses binding refs and routes operations to Moqui endpoints

## Requirements

### Requirement 1: Moqui Resource Discovery Integration

**User Story:** As a developer, I want the extractor to connect to a Moqui instance and retrieve discovered resources, so that the extraction pipeline has raw data to analyze.

#### Acceptance Criteria

1. WHEN the Extractor receives a valid Adapter_Config, THE Extractor SHALL authenticate with the Moqui instance using MoquiClient and retrieve entity, service, and screen catalogs
2. WHEN the `--type` option is provided, THE Extractor SHALL limit discovery to the specified resource type (entities, services, or screens)
3. IF authentication with the Moqui instance fails, THEN THE Extractor SHALL return an Extraction_Result with `success: false` and a descriptive error containing the authentication failure reason
4. IF a catalog endpoint returns an error, THEN THE Extractor SHALL continue extracting from remaining endpoints and include partial results with warnings

### Requirement 2: Business Pattern Recognition

**User Story:** As a developer, I want the extractor to identify business patterns from discovered resources, so that meaningful scene templates are generated automatically.

#### Acceptance Criteria

1. THE Extractor SHALL support the following built-in Business_Patterns: "crud" (entity with all CRUD operations), "query" (read-only entity access), "workflow" (service orchestration with entity side-effects)
2. WHEN analyzing discovered entities, THE Extractor SHALL classify each entity into matching Business_Patterns based on Pattern_Rules
3. WHEN the `--pattern` option is provided, THE Extractor SHALL filter extraction to generate templates only for the specified Business_Pattern
4. WHEN an entity name contains related suffixes (e.g., "Header" and "Item" such as OrderHeader + OrderItem), THE Extractor SHALL group them into a single composite pattern
5. WHEN no resources match any Business_Pattern, THE Extractor SHALL return an Extraction_Result with zero templates and a descriptive message

### Requirement 3: Scene Manifest Generation

**User Story:** As a developer, I want the extractor to generate valid scene manifests from identified patterns, so that the templates are compatible with SCE's scene runtime.

#### Acceptance Criteria

1. THE Extractor SHALL generate Scene_Manifests using apiVersion `sce.scene/v0.2` with `kind: scene`
2. WHEN generating a Scene_Manifest for a "crud" pattern, THE Extractor SHALL include binding refs for all five entity operations (list, get, create, update, delete) in the capability_contract
3. WHEN generating a Scene_Manifest for a "query" pattern, THE Extractor SHALL include binding refs for read-only operations (list, get) in the capability_contract
4. WHEN generating a Scene_Manifest for a "workflow" pattern, THE Extractor SHALL include service invoke binding refs and entity read/write model_scope entries
5. THE Extractor SHALL set governance_contract fields (risk_level, approval, idempotency) based on the Business_Pattern type: "query" patterns use risk_level "low" with no approval required; "crud" and "workflow" patterns use risk_level "medium" with approval required
6. THE Extractor SHALL generate valid YAML output that can be parsed back into an equivalent object (round-trip property)

### Requirement 4: Package Contract Generation

**User Story:** As a developer, I want the extractor to generate scene-package.json contracts alongside manifests, so that templates can be published and instantiated through existing SCE workflows.

#### Acceptance Criteria

1. THE Extractor SHALL generate Package_Contracts using apiVersion `sce.scene.package/v0.1`
2. THE Extractor SHALL derive the package name from the Business_Pattern type and primary entity/service name using kebab-case formatting
3. THE Extractor SHALL include template parameters for configurable values (e.g., timeout_ms, retry count) in the Package_Contract
4. THE Extractor SHALL set the package kind based on the Business_Pattern: "scene-template" for all pattern types
5. WHEN generating a Package_Contract, THE Extractor SHALL include metadata fields: name, version ("0.1.0"), group ("sce.scene"), and description derived from the pattern

### Requirement 5: Template Output and File Writing

**User Story:** As a developer, I want extracted templates written to a specified output directory, so that I can review and publish them.

#### Acceptance Criteria

1. WHEN the `--out` option is provided, THE Extractor SHALL write Template_Bundles to the specified output directory
2. THE Extractor SHALL create one subdirectory per Template_Bundle, named using the pattern `{pattern}-{primary-resource-name}`
3. THE Extractor SHALL write a `scene.yaml` file and a `scene-package.json` file inside each Template_Bundle subdirectory
4. WHEN the `--dry-run` option is provided, THE Extractor SHALL return the Extraction_Result without writing any files to disk
5. IF the output directory does not exist, THEN THE Extractor SHALL create the directory recursively before writing files

### Requirement 6: CLI Command Integration

**User Story:** As a developer, I want a `sce scene extract` CLI command, so that I can run template extraction from the command line.

#### Acceptance Criteria

1. THE CLI SHALL register a `scene extract` subcommand following the normalize → validate → run → print pattern established in `lib/commands/scene.js`
2. THE CLI SHALL accept the following options: `--config <path>`, `--type <type>`, `--pattern <pattern>`, `--out <dir>`, `--dry-run`, `--json`
3. WHEN the `--json` option is provided, THE CLI SHALL output the Extraction_Result as formatted JSON to stdout
4. WHEN the `--json` option is not provided, THE CLI SHALL print a human-readable summary showing the number of templates generated, pattern types found, and output paths
5. IF validation of CLI options fails, THEN THE CLI SHALL print a descriptive error message and set process.exitCode to 1
6. WHEN the `--pattern` option value is not one of the supported Business_Patterns, THE CLI SHALL return a validation error

### Requirement 7: Error Handling and Resilience

**User Story:** As a developer, I want the extraction pipeline to handle errors gracefully, so that partial failures do not prevent useful output.

#### Acceptance Criteria

1. IF a network error occurs during discovery, THEN THE Extractor SHALL return an Extraction_Result with `success: false` and error code "NETWORK_ERROR"
2. IF the config file is missing or invalid, THEN THE Extractor SHALL return an Extraction_Result with `success: false` and a descriptive error referencing the config issue
3. WHEN writing template files fails for a specific Template_Bundle, THE Extractor SHALL continue writing remaining bundles and include the failure in the result warnings
4. THE Extractor SHALL dispose the MoquiClient connection after extraction completes, regardless of success or failure

### Requirement 8: Serialization Round-Trip

**User Story:** As a developer, I want generated templates to be serializable and deserializable without data loss, so that the extraction output is reliable.

#### Acceptance Criteria

1. FOR ALL valid Extraction_Results, serializing to JSON and deserializing SHALL produce an equivalent object
2. FOR ALL generated Scene_Manifests, serializing to YAML and parsing back SHALL produce an equivalent object
3. FOR ALL generated Package_Contracts, serializing to JSON and parsing back SHALL produce an equivalent object
