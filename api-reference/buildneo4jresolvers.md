---
description: >-
  Generates any unprovided resolvers for query and mutation types that are
  generated or that use a @cypher directive.
---

# buildNeo4jResolvers

TODO

### API Reference

* `typeDefs` \(required\): Your GraphQL type definitions in [SDL format](https://www.prisma.io/blog/graphql-sdl-schema-definition-language-6755bcb9ce51/). 
* `driver`\(required\): Your Neo4j driver instance \(More info [here](https://www.npmjs.com/package/neo4j-driver)\). 
* `query` \(default: `true`\): A Boolean controlling whether to generate resolvers for query types. 
* `mutation` \(default: `true`\): A Boolean controlling whether to generate resolvers for mutation types. 
* `bindingKey` The key of the binding \(stored in your server's context object\) to be used within generated resolvers for operation delegation.

### Example

This example would result in the creation 

```text
import { buildNeo4jResolvers } from 'neo4j-graphql-binding';
​
const driver = neo4j.driver(
  process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4j.auth.basic(
    process.env.NEO4J_USER || "neo4j",
    process.env.NEO4J_PASSWORD || "neo4j"
  )
);
​
const typeDefs = `
  type Person @model {
    name: String @unique
  }
`;
​
buildNeo4jResolvers({
  typeDefs: typeDefs,
  resolvers: resolvers,
  driver: driver,
  bindingKey: 'neo4j'
});
```



