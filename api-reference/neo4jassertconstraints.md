# neo4jAssertConstraints

### Overview

In order to support the use of a `@unique` field directive, `neo4jAssertConstraints` can be used to send a Cypher query to your Neo4j instance that executes the  `apoc.schema.assert` procedure. This drops all indexes and constraints, then rebuilds them for every field that has a @unique directive, in addition to all `id` fields, on each type with a `@model` directive.

### API Reference

* `typeDefs` \(required\): Your GraphQL type definitions in SDL format. 
* `driver`\(required\): Your Neo4j driver instance \(More info [here](https://www.npmjs.com/package/neo4j-driver)\). 
* `log` \(default: `false`\): Logs result from operation.

### Example

```text
import { neo4jAssertConstraints} from 'neo4j-graphql-binding';

neo4jAssertConstraints({
  typeDefs: typeDefs,
  driver: driver,
  log: log
});
```

