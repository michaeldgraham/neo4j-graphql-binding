---
description: A few examples of using the GraphQL Community Graph by Neo4j.
---

# GraphQL Community Graph

### With Multiple Bindings

Using the following typeDefs for your local Neo4j server:

```text
const typeDefs = `
  type Technology @model {
    name: String! @unique
    integration: [Technology] @relation(name: "HAPPINESS", direction: OUT)
  }
`;
```

The following is a modified version of the [twitter schema](https://github.com/grand-stack/grand-stack-starter/blob/twitter/api/src/graphql-schema.js) from the [GraphQL Community Graph](http://graphql.communitygraph.org/). Each type has received a `@model` directive. There are no further changes made because the endpoint is **read-only** and thus does not allow the schema or data to be modified.

```text
const twitterTypeDefs = `
  type Link @model {
    url: ID!
  }
  type TwitterUser @model {
    id: ID!
    screen_name: String!
    name: String
    location: String
    followers: Int
    following: Int
    statuses: Int
    profile_image_url: String
    posted: [Tweet] @relation(name:"POSTED", direction:"OUT")
  }
  type Tweet @model {
    id: ID!
    text: String
    created: Int
    favorites: Int
    postedBy: TwitterUser @relation(name:"POSTED", direction:"IN")
    mentioned: [TwitterUser] @relation(name:"MENTIONED", direction:"OUT")
    reply: Tweet @relation(name:"REPLIED_TO", direction:"OUT")
    retweeted: Tweet @relation(name:"RETWEETED", direction:"OUT")
    links: [Link] @relation(name:"LINKED", direction:"OUT")
    tags: [Tag] @relation(name:"TAGGED", direction:"OUT")
  }
  type Tag @model {
    name: ID!
    tagged: [Tweet] @relation(name:"TAGGED", direction:"IN")
  }
`;
```

Now we can setup the server, using `typeDefs` for our local Neo4j instance and `twitterTypeDefs` for the remote GraphQL Community Graph. 

```text
import { v1 as neo4j } from 'neo4j-driver';
import { Neo4jGraphQLServer } from '../michaeldgraham/neo4j-graphql-binding/src/index.js';

const driver = neo4j.driver(
  process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4j.auth.basic(
    process.env.NEO4J_USER || "neo4j",
    process.env.NEO4J_PASSWORD || "neo4j"
  )
);

const GraphQLCommunityGraphDriver = neo4j.driver(
  "bolt://107.170.69.23:7687",
  neo4j.auth.basic("graphql", "graphql")
);

const server = Neo4jGraphQLServer({
  typeDefs: typeDefs,
  driver: driver,
  log: true,
  bindings: {
    twitter: {
      typeDefs: twitterTypeDefs,
      driver: GraphQLCommunityGraphDriver,
      readOnly: true
    }
  }
});

server.listen().then( ({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});

```

Notice the `readOnly` parameter set to `true` in the configuration object for the `twitter` binding. This is a quick way to provide the following equivalent configuration:

```text
calls: {
  assert: false,
  idl: false
},
augment: {
  typeDefs: {
    query: true, 
    mutation: false
  },
  resolvers: {
    query: true, 
    mutation: false
  }
},
indexConfig: false
```

We can now __use the same auto-generated query types produced by the Neo4j-GraphQL extension to read data from the GraphQL Community Graph while also using a binding to manage a local Neo4j instance. 

TODO include picture of resulting generated schema and reading from

### Using neo4j-graphql-js

If...



