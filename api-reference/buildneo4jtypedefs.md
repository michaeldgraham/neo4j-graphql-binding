# neo4jIDL

### Overview

In order to update your Neo4j-GraphQL schema, you can use the `neo4jIDL`, which sends a request to Neo4j to call the [graphql.idl](https://github.com/neo4j-graphql/neo4j-graphql/tree/3.3#uploading-a-graphql-schema) procedure using the `typeDefs` you provide.

### API Reference

* `typeDefs` \(required\): Your GraphQL type definitions in SDL format. 
* `driver`\(required\): Your Neo4j driver instance \(More info [here](https://www.npmjs.com/package/neo4j-driver)\). 
* `log` \(default: `false`\): Logs result from operation. 

### Example

```text
import { neo4jIDL } from 'neo4j-graphql-binding';

neo4jIDL({
  typeDefs: typeDefs,
  driver: driver,
  log: log
});
```



