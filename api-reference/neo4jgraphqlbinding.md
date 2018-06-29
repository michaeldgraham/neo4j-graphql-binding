# neo4jGraphQLBinding

### Overview

In your server setup, you use `neo4jGraphQLBinding` to create a [GraphQL binding](https://www.npmjs.com/package/graphql-binding) to your Neo4j server and set the binding into your server's context object at some key. The binding can then be accessed in your resolvers to send requests to your remote Neo4j GraphQL server for any `query` or `mutation` in your `typeDefs` with a [@cypher directive](https://neo4j.com/developer/graphql/#_neo4j_graphql_extension). Queries use the read only [graphql.query](https://github.com/neo4j-graphql/neo4j-graphql/tree/3.3#procedures) procedure and mutations use the read/write [graphql.execute](https://github.com/neo4j-graphql/neo4j-graphql/tree/3.3#procedures) procedure.

### API Reference

* `typeDefs` \(required\): Your GraphQL type definitions in SDL format. 
* `driver`\(required\): Your Neo4j driver instance \(More info [here](https://www.npmjs.com/package/neo4j-driver)\). 
* `log` \(default: `false`\): Logs results from query or mutation operations.  
* `indexConfig`
  * `use` \(default: `'cuid'`\) Configures what method to use when generating id field values. 

### Example

```text
import { neo4jGraphQLBinding } from 'neo4j-graphql-binding';

const binding = neo4jGraphQLBinding({
  typeDefs: typeDefs,
  driver: driver,
  log: false
});

const context = {
  neo4j: binding
  ...
};
```



