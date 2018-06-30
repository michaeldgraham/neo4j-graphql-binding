---
description: TODO
---

# neo4jIDL

In order to update your Neo4j-GraphQL schema, you can use the `neo4jIDL`export, which sends a request to Neo4j to call the [graphql.idl](https://github.com/neo4j-graphql/neo4j-graphql/tree/3.3#uploading-a-graphql-schema) procedure using the `typeDefs` you provide.

### API Reference

* `typeDefs` \(required\): Your GraphQL type definitions in [SDL format](https://www.prisma.io/blog/graphql-sdl-schema-definition-language-6755bcb9ce51/). 
* `driver`\(required\): Your Neo4j driver instance \(More info [here](https://www.npmjs.com/package/neo4j-driver)\). 
* `log` \(default: `false`\): Logs result from operation. 

### Example

... show an example using typeDefs, with resulting neo4j-graphql extension generated schema from an introspection, include information about setting up an introspection; make an example of a workflow for updating your schema, then viewing the neo4j-graphql generated result with introspection

```text
import { neo4jIDL } from 'neo4j-graphql-binding';

neo4jIDL({
  typeDefs: typeDefs,
  driver: driver,
  log: log
});
```

