---
description: >-
  Generates any unprovided resolvers for query and mutation types that are
  generated or that use a @cypher directive.
---

# buildNeo4jResolvers

### API Reference

* `typeDefs` \(required\): Your GraphQL type definitions in [SDL format](https://www.prisma.io/blog/graphql-sdl-schema-definition-language-6755bcb9ce51/). 
* `driver`\(required\): Your Neo4j driver instance \(More info [here](https://www.npmjs.com/package/neo4j-driver)\). 
* `query` \(default: `true`\): A Boolean controlling whether to generate resolvers for query types. 
* `mutation` \(default: `true`\): A Boolean controlling whether to generate resolvers for mutation types. 
* `bindingKey` \(default: 'neo4j'\) The key of the binding \(stored in your server's context object\) to be used within generated resolvers for operation delegation.

### Example

TODO

