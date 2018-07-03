---
description: >-
  Creates a GraphQL Binding for a Neo4j instance that uses the Neo4j-GraphQL
  extension.
---

# neo4jGraphQLBinding

In your server setup, you use `neo4jGraphQLBinding` to create a [GraphQL binding](https://www.npmjs.com/package/graphql-binding) to your Neo4j server and set the binding into your server's context object at some key. The binding can then be accessed in your resolvers to send requests to your remote Neo4j GraphQL server for any `query` or `mutation` in your `typeDefs` with a [@cypher directive](https://neo4j.com/developer/graphql/#_neo4j_graphql_extension). Queries use the read only [graphql.query](https://github.com/neo4j-graphql/neo4j-graphql/tree/3.3#procedures) procedure and mutations use the read/write [graphql.execute](https://github.com/neo4j-graphql/neo4j-graphql/tree/3.3#procedures) procedure.

### Strategy

The current strategy is to create a custom GraphQL binding over the schema created by [makeRemoteExecutableSchema](https://www.apollographql.com/docs/graphql-tools/remote-schemas.html#makeRemoteExecutableSchema) from [graphql-tools](https://www.npmjs.com/package/graphql-tools) , using your local `typeDefs`and a custom Apollo Link.   
  
When you send a GraphQL request to a resolver that delegates to the binding, the link receives the operation, processes it to support various features, and finally uses the Bolt driver to send the operation to your Neo4j instance as a Cypher query that calls a custom procedure provided by the Neo4j-GraphQL extension \(`graphql.query` for queries and `graphql.execute`for mutations\).

### API Reference

* `typeDefs` \(required\): Your GraphQL type definitions in [SDL format](https://www.prisma.io/blog/graphql-sdl-schema-definition-language-6755bcb9ce51/). 
* `driver`\(required\): Your Neo4j driver instance \(More info [here](https://www.npmjs.com/package/neo4j-driver)\). 
* `log` \(default: `false`\): Logs results from query or mutation operations.  
* `indexConfig`
  * `use` \(default: `'cuid'`\) Configures what method to use when generating id field values. 

### Example

```javascript
import { neo4jGraphQLBinding } from 'neo4j-graphql-binding';

const binding = neo4jGraphQLBinding({
  typeDefs: typeDefs,
  driver: driver,
  log: true
});

const context = {
  neo4j: binding
  ...
};
```

### Resources



